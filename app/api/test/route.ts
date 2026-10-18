// app/api/test/route.ts — Live diagnostic checking BOTH locations
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

export async function GET() {
  const appRoot = process.env.APP_DIR || process.cwd();
  
  // Location 1: Project root bin (e.g. /home/olivosof/ffmpeg.olivosoft.com/bin/ffmpeg)
  const appBinFfmpeg = path.join(appRoot, "bin", "ffmpeg");
  
  // Location 2: User home bin (e.g. /home/olivosof/bin/ffmpeg)
  const homeBinFfmpeg = path.join(os.homedir(), "bin", "ffmpeg");

  function inspectFile(filePath: string) {
    const exists = fs.existsSync(filePath);
    let size = 0;
    let version = "";
    let error = "";

    if (exists) {
      try {
        const stat = fs.statSync(filePath);
        size = stat.size;
        fs.chmodSync(filePath, 0o755);
        version = execSync(`"${filePath}" -version`, { timeout: 3000 }).toString();
      } catch (err: unknown) {
        error = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      path: filePath,
      exists,
      sizeInMB: (size / (1024 * 1024)).toFixed(2) + " MB",
      works: version.includes("ffmpeg version"),
      version: version ? version.split("\n")[0] : null,
      error: error || null,
    };
  }

  const projectBinStatus = inspectFile(appBinFfmpeg);
  const homeBinStatus = inspectFile(homeBinFfmpeg);

  const bestWorking = projectBinStatus.works
    ? projectBinStatus.path
    : homeBinStatus.works
    ? homeBinStatus.path
    : null;

  return NextResponse.json({
    status: bestWorking ? "SUCCESS_READY_TO_USE" : "NEEDS_WORKING_BINARY",
    activeSelectedFfmpeg: bestWorking,
    appRoot,
    location1_ProjectFolder: projectBinStatus,
    location2_HomeFolder: homeBinStatus,
    serverPlatform: os.platform(),
    serverArch: os.arch(),
  });
}
