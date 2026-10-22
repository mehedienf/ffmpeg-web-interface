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
const { execSync } = require("child_process");

// Set absolute application root (prevents cPanel cwd drift)
process.env.APP_DIR = __dirname;

// cPanel Passenger passes port via env
const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== "production";

// ─── Resolve manually uploaded project binaries ───────────────────────────────
function resolveFFmpegBinary() {
  const appBin = path.join(__dirname, "bin", "ffmpeg");
  if (!fs.existsSync(appBin)) {
    throw new Error(`FFmpeg binary not found at ${appBin}. Upload it to the project's bin/ directory.`);
  }
  try {
    fs.chmodSync(appBin, 0o755);
    const version = execSync(`"${appBin}" -version`, { timeout: 2000 }).toString();
    if (!version.includes("ffmpeg version")) throw new Error("version check failed");
  } catch (err) {
    throw new Error(`FFmpeg binary at ${appBin} is not executable: ${err.message}`);
  }
  return appBin;
}

function resolveFFprobeBinary() {
  const appProbe = path.join(__dirname, "bin", "ffprobe");
  if (!fs.existsSync(appProbe)) {
    throw new Error(`FFprobe binary not found at ${appProbe}. Upload it to the project's bin/ directory.`);
  }
  try {
    fs.chmodSync(appProbe, 0o755);
    const version = execSync(`"${appProbe}" -version`, { timeout: 2000 }).toString();
    if (!version.includes("ffprobe version")) throw new Error("version check failed");
  } catch (err) {
    throw new Error(`FFprobe binary at ${appProbe} is not executable: ${err.message}`);
  }
  return appProbe;
}

process.env.FFMPEG_BINARY = resolveFFmpegBinary();
process.env.FFPROBE_BINARY = resolveFFprobeBinary();
console.log(`> Active FFmpeg : ${process.env.FFMPEG_BINARY}`);
console.log(`> Active FFprobe: ${process.env.FFPROBE_BINARY}`);

// ──────────────────────────────────────────────────────────────────────────────

// Automatically create symlink _next -> .next so Apache/LiteSpeed can serve static assets directly
try {
  const dotNext = path.join(__dirname, ".next");
  const underscoreNext = path.join(__dirname, "_next");

  // Remove broken/stale symlink first
  if (fs.existsSync(underscoreNext)) {
    try {
      const stat = fs.lstatSync(underscoreNext);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(underscoreNext);
        // Remove if it points somewhere wrong or if .next moved
        if (!fs.existsSync(path.resolve(__dirname, target))) {
          fs.unlinkSync(underscoreNext);
          console.log("> Removed stale _next symlink");
        }
      }
    } catch (_) {}
  }

  if (fs.existsSync(dotNext) && !fs.existsSync(underscoreNext)) {
    try {
      fs.symlinkSync(".next", underscoreNext, "dir");
      console.log("> Created symlink _next -> .next for Apache/cPanel");
    } catch (e) {
      console.warn("> Could not create _next symlink:", e.message);
    }
  }
} catch (_) {}

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

// Background cleanup for inactive files (auto-deletes after 15m of inactivity)
function cleanStorageFiles() {
  const root = process.env.APP_DIR || __dirname;
  const dirs = [path.join(root, "storage", "uploads"), path.join(root, "storage", "outputs")];
  const now = Date.now();
  const maxAgeMs = 15 * 60 * 1000;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.startsWith(".")) continue;
        const p = path.join(dir, file);
        try {
          const stat = fs.statSync(p);
          if (stat.isFile() && now - stat.mtimeMs >= maxAgeMs) {
            fs.unlinkSync(p);
            console.log(`[Auto Cleanup] Deleted inactive file: ${file}`);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    try {
      const parsedUrl = url.parse(req.url, true);
      const { pathname } = parsedUrl;

      // Serve /_next/static/ directly from .next/static/
      if (pathname && pathname.startsWith("/_next/static/")) {
        const relativePath = decodeURIComponent(pathname.replace("/_next/static/", ""));
        const searchDirs = [
          path.join(__dirname, ".next", "static", relativePath),
          path.join(process.cwd(), ".next", "static", relativePath),
        ];

        for (const filePath of searchDirs) {
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
    console.log(`> klipr ready on port: ${port}`);
    cleanStorageFiles();
    const cleanupInterval = setInterval(cleanStorageFiles, 60 * 1000);
    if (cleanupInterval.unref) cleanupInterval.unref();
  });
}).catch((err) => {
  console.error("Fatal Error preparing Next.js app:", err);
  process.exit(1);
});
