// app/api/test/route.ts — Live diagnostic checking BOTH locations
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export async function GET() {
  const appRoot = process.env.APP_DIR || process.cwd();
  
  const appBinFfmpeg = path.join(appRoot, "bin", "ffmpeg");

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

  return NextResponse.json({
    status: projectBinStatus.works ? "SUCCESS_READY_TO_USE" : "NEEDS_WORKING_BINARY",
    activeSelectedFfmpeg: projectBinStatus.works ? projectBinStatus.path : null,
    appRoot,
    location1_ProjectFolder: projectBinStatus,
  });
}
