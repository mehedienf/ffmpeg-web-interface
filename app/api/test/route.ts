// app/api/test/route.ts — Live diagnostic for ~/bin/ffmpeg
import { NextResponse } from "next/server";
import { UPLOADS_DIR, OUTPUTS_DIR } from "@/lib/storage";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

export async function GET() {
  const userBinFfmpeg = path.join(os.homedir(), "bin", "ffmpeg");
  const userBinFfprobe = path.join(os.homedir(), "bin", "ffprobe");

  let ffmpegExists = fs.existsSync(userBinFfmpeg);
  let ffmpegSize = 0;
  let ffmpegVersion = "";
  let executionError = "";

  if (ffmpegExists) {
    const stat = fs.statSync(userBinFfmpeg);
    ffmpegSize = stat.size;

    // Ensure permissions
    try {
      fs.chmodSync(userBinFfmpeg, 0o755);
    } catch (_) {}

    // Test execution
    try {
      ffmpegVersion = execSync(`"${userBinFfmpeg}" -version`, { timeout: 3000 }).toString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      executionError = msg;
    }
  }

  return NextResponse.json({
    status: ffmpegVersion ? "SUCCESS_READY_TO_USE" : "NEEDS_REPLACE",
    userBinFfmpeg,
    exists: ffmpegExists,
    sizeInMB: (ffmpegSize / (1024 * 1024)).toFixed(2) + " MB",
    version: ffmpegVersion.split("\n")[0] || null,
    executionError: executionError || null,
    serverArch: os.arch(),
    serverPlatform: os.platform(),
  });
}
