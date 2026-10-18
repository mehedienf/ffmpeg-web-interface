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
// CloudLinux CageFS blocks execution of binaries inside nodevenv/node_modules.
// Strategy: find system ffmpeg → if not found, copy ffmpeg-static to ~/bin/
function resolveFFmpegBinary() {
  // 0. Prioritize explicitly installed standalone Linux binary in user's ~/bin
  const userHomeBin = path.join(os.homedir(), "bin", "ffmpeg");
  if (fs.existsSync(userHomeBin)) {
    try {
      execSync(`"${userHomeBin}" -version`, { timeout: 2000 });
      console.log(`> Using verified user FFmpeg: ${userHomeBin}`);
      return userHomeBin;
    } catch (_) {}
  }

  // 1. Check common system-level FFmpeg paths
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

  // 2. Try to locate via `which ffmpeg`
  try {
    const which = execSync("which ffmpeg", { timeout: 3000 }).toString().trim();
    if (which) {
      console.log(`> Found FFmpeg via which: ${which}`);
      return which;
    }
  } catch (_) {}

  // 3. Copy ffmpeg-static to ~/bin/ to escape CageFS restrictions
  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      const binDir = path.join(os.homedir(), "bin");
      const destPath = path.join(binDir, "ffmpeg");

      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }

      // Always copy fresh to ensure correct binary
      fs.copyFileSync(ffmpegStatic, destPath);
      fs.chmodSync(destPath, 0o755);
      console.log(`> Copied ffmpeg-static to ${destPath}`);
      return destPath;
    }
  } catch (e) {
    console.warn("> Could not copy ffmpeg-static:", e.message);
  }

  // 4. Last resort: hope `ffmpeg` is in PATH
  console.warn("> No FFmpeg binary found. Using 'ffmpeg' from PATH.");
  return "ffmpeg";
}

// Resolve FFprobe binary (same strategy)
function resolveFFprobeBinary() {
  const systemPaths = [
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const { path: ffprobePath } = require("@ffprobe-installer/ffprobe");
    if (ffprobePath && fs.existsSync(ffprobePath)) {
      const binDir = path.join(os.homedir(), "bin");
      const destPath = path.join(binDir, "ffprobe");
      if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
      fs.copyFileSync(ffprobePath, destPath);
      fs.chmodSync(destPath, 0o755);
      return destPath;
    }
  } catch (_) {}
  return "ffprobe";
}

process.env.FFMPEG_BINARY = resolveFFmpegBinary();
process.env.FFPROBE_BINARY = resolveFFprobeBinary();
console.log(`> FFmpeg : ${process.env.FFMPEG_BINARY}`);
console.log(`> FFprobe: ${process.env.FFPROBE_BINARY}`);

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
