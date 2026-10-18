/**
 * app/api/install-ffmpeg/route.ts
 *
 * Robust, CageFS-safe standalone Linux x86_64 FFmpeg installer.
 * Uses ~/bin for all downloading and unpacking to bypass CloudLinux /tmp restrictions.
 */

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import { exec, execSync } from "child_process";

// Direct reliable mirror
const DOWNLOAD_URL = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function getWithRedirect(targetUrl: string, maxRedirects = 5) {
      if (maxRedirects <= 0) {
        reject(new Error("Too many redirects"));
        return;
      }

      const client = targetUrl.startsWith("https") ? https : http;

      client.get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, targetUrl).toString();
          getWithRedirect(redirectUrl, maxRedirects - 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close(() => resolve());
        });

        fileStream.on("error", (err) => {
          try { fs.unlinkSync(destPath); } catch (_) {}
          reject(err);
        });
      }).on("error", (err) => {
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });
    }

    getWithRedirect(url);
  });
}

function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${err.message}\n${stderr}`));
      else resolve(stdout || stderr);
    });
  });
}

export async function GET() {
  const binDir = path.join(os.homedir(), "bin");
  const ffmpegDest = path.join(binDir, "ffmpeg");
  const ffprobeDest = path.join(binDir, "ffprobe");
  
  // Keep everything in user's home directory to bypass CageFS /tmp restrictions
  const archivePath = path.join(binDir, "ffmpeg-amd64.tar.gz");
  const extractDir = path.join(binDir, "temp_extract");

  try {
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true, mode: 0o755 });
    }

    // Clean previous partial files
    if (fs.existsSync(archivePath)) {
      try { fs.unlinkSync(archivePath); } catch (_) {}
    }

    // 1. Download official .tar.gz build (supported natively by standard gzip)
    console.log("[Auto-Installer] Downloading Linux x86_64 FFmpeg .tar.gz into ~/bin ...");
    const GZ_URL = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.gz";
    await downloadFile(GZ_URL, archivePath);

    const stat = fs.statSync(archivePath);
    if (stat.size < 5000000) {
      throw new Error(`Downloaded file size is too small: ${stat.size} bytes`);
    }

    // 2. Extract with standard gzip
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    console.log("[Auto-Installer] Extracting archive with tar -zxf ...");
    await runCmd(`tar -zxf "${archivePath}" -C "${extractDir}"`);

    // 3. Locate subfolder
    const entries = fs.readdirSync(extractDir);
    const subFolder = entries.find((e) => e.startsWith("ffmpeg-") && fs.statSync(path.join(extractDir, e)).isDirectory());

    if (!subFolder) {
      throw new Error(`Extracted folder not found. Found entries: ${entries.join(", ")}`);
    }

    const sourceFfmpeg = path.join(extractDir, subFolder, "ffmpeg");
    const sourceFfprobe = path.join(extractDir, subFolder, "ffprobe");

    // 4. Move binaries to ~/bin
    if (!fs.existsSync(sourceFfmpeg)) {
      throw new Error(`Source ffmpeg not found at ${sourceFfmpeg}`);
    }

    fs.copyFileSync(sourceFfmpeg, ffmpegDest);
    fs.chmodSync(ffmpegDest, 0o755);

    if (fs.existsSync(sourceFfprobe)) {
      fs.copyFileSync(sourceFfprobe, ffprobeDest);
      fs.chmodSync(ffprobeDest, 0o755);
    }

    // 5. Cleanup
    try {
      fs.unlinkSync(archivePath);
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (_) {}

    // 6. Test execution directly on the server
    const versionOutput = execSync(`"${ffmpegDest}" -version`, { timeout: 4000 }).toString();

    return NextResponse.json({
      success: true,
      message: "Linux x86_64 FFmpeg successfully installed to ~/bin/ffmpeg!",
      ffmpegPath: ffmpegDest,
      ffprobePath: ffprobeDest,
      versionCheck: versionOutput.split("\n").slice(0, 3).join("\n"),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Auto-Installer Error]", msg);

    // Clean up partials
    try {
      if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (_) {}

    return NextResponse.json(
      {
        success: false,
        error: msg,
        diagnostic: {
          arch: os.arch(),
          platform: os.platform(),
          binDir,
          binExists: fs.existsSync(binDir),
        },
      },
      { status: 500 },
    );
  }
}
