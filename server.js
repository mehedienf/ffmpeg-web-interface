// server.js — cPanel Phusion Passenger custom entry point
// This file is required by cPanel Node.js hosting to launch the Next.js app.
// Run `npm run build` first, then set this file as the Application Startup File
// in cPanel's Node.js section.

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const fs = require("fs");

// ─── Ensure FFmpeg binaries are executable ──────────────────────────────────
// cPanel often strips the execute bit from npm-installed binaries.
// This silently fixes it every time the server starts.
try {
  const ffmpegPath = require("ffmpeg-static");
  if (ffmpegPath) fs.chmodSync(ffmpegPath, "755");
} catch (e) {}

try {
  const ffprobe = require("@ffprobe-installer/ffprobe");
  if (ffprobe && ffprobe.path) fs.chmodSync(ffprobe.path, "755");
} catch (e) {}
// ────────────────────────────────────────────────────────────────────────────

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> FFmpeg Studio ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? "development" : "production"}`);
  });
});

