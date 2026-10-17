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

// cPanel Passenger passes a unix domain socket or random port in process.env.PORT
const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== "production";

// Auto fix binary permissions safely without throwing unhandled exceptions
try {
  const ffmpegStatic = require("ffmpeg-static");
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    fs.chmodSync(ffmpegStatic, 0o755);
  }
} catch (e) {
  console.warn("Notice: could not chmod ffmpeg-static:", e.message);
}

try {
  const ffprobe = require("@ffprobe-installer/ffprobe");
  if (ffprobe && ffprobe.path && fs.existsSync(ffprobe.path)) {
    fs.chmodSync(ffprobe.path, 0o755);
  }
} catch (e) {
  console.warn("Notice: could not chmod ffprobe:", e.message);
}

// In cPanel Passenger, hostname should NOT be hardcoded to 0.0.0.0 if port is a socket pipe
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = url.parse(req.url, true);
        handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Passenger Request Error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });

    server.listen(port, (err) => {
      if (err) {
        console.error("Failed to start server on port:", port, err);
        process.exit(1);
      }
      console.log(`> App successfully listening on: ${port}`);
    });
  })
  .catch((err) => {
    console.error("Fatal Error preparing Next.js app:", err);
    process.exit(1);
  });
