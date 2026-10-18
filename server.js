// server.js - Ultra-reliable custom server for cPanel / CloudLinux Phusion Passenger

// Polyfill Array.prototype.toSorted & toReversed for older Node.js versions (< Node 20)
if (!Array.prototype.toSorted) {
  Array.prototype.toSorted = function (compareFn) {
    const copy = this.slice();
    return copy.sort(compareFn);
  };
}
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return this.slice().reverse();
  };
}

const http = require("http");
const url = require("url");
const next = require("next");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// Set absolute application root (prevents cPanel cwd drift)
process.env.APP_DIR = __dirname;

// cPanel Passenger passes port via env
const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== "production";

// ─── Resolve a working FFmpeg binary ──────────────────────────────────────────
// STRICTLY respects manually uploaded Linux binaries in ~/bin/
// NEVER overwrites user files with node_modules binaries!
function resolveFFmpegBinary() {
  const userHomeBin = path.join(os.homedir(), "bin", "ffmpeg");
  
  // 1. If user placed ffmpeg in ~/bin, ensure chmod 755 and verify
  if (fs.existsSync(userHomeBin)) {
    try {
      fs.chmodSync(userHomeBin, 0o755);
      const test = execSync(`"${userHomeBin}" -version`, { timeout: 2000 }).toString();
      if (test.includes("ffmpeg version")) {
        console.log(`> Using verified user FFmpeg: ${userHomeBin}`);
        return userHomeBin;
      }
    } catch (err) {
      console.warn(`> Notice: ~/bin/ffmpeg exists but failed verification test:`, err.message);
    }
  }

  // 2. Check common system-level FFmpeg paths
  const systemPaths = [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/local/ffmpeg/bin/ffmpeg",
    "/opt/cpanel/ea-php-cli/root/usr/bin/ffmpeg",
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) {
      console.log(`> Using system FFmpeg: ${p}`);
      return p;
    }
  }

  // 3. Try to locate via `which ffmpeg`
  try {
    const which = execSync("which ffmpeg", { timeout: 2000 }).toString().trim();
    if (which) {
      console.log(`> Found FFmpeg via which: ${which}`);
      return which;
    }
  } catch (_) {}

  // 4. Fallback to ~/bin/ffmpeg path directly
  return userHomeBin;
}

function resolveFFprobeBinary() {
  const userProbe = path.join(os.homedir(), "bin", "ffprobe");
  if (fs.existsSync(userProbe)) {
    try { fs.chmodSync(userProbe, 0o755); } catch (_) {}
    return userProbe;
  }
  const systemPaths = ["/usr/bin/ffprobe", "/usr/local/bin/ffprobe"];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }
  return "ffprobe";
}

process.env.FFMPEG_BINARY = resolveFFmpegBinary();
process.env.FFPROBE_BINARY = resolveFFprobeBinary();
console.log(`> Active FFmpeg : ${process.env.FFMPEG_BINARY}`);
console.log(`> Active FFprobe: ${process.env.FFPROBE_BINARY}`);

// ──────────────────────────────────────────────────────────────────────────────

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

const MIME_TYPES = {
  ".css":   "text/css; charset=utf-8",
  ".js":    "application/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff":  "font/woff",
  ".ttf":   "font/ttf",
  ".ico":   "image/x-icon",
  ".svg":   "image/svg+xml",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".webp":  "image/webp",
};

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    try {
      const parsedUrl = url.parse(req.url, true);
      const { pathname } = parsedUrl;

      // Serve /_next/static/ directly from .next/static/
      if (pathname && pathname.startsWith("/_next/static/")) {
        const relativePath = pathname.replace("/_next/static/", "");
        const filePath = path.join(__dirname, ".next", "static", relativePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Request Error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`> FFmpeg Studio ready on port: ${port}`);
  });
}).catch((err) => {
  console.error("Fatal Error preparing Next.js app:", err);
  process.exit(1);
});
