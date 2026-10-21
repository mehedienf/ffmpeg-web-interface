/**
 * app/api/keep-alive/route.ts
 *
 * POST /api/keep-alive
 * Called periodically by the client while the user is actively interacting with the site.
 * Refreshes timestamps on active upload and output files so they are not deleted
 * due to inactivity.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  ensureStorageDirs,
  UPLOADS_DIR,
  OUTPUTS_DIR,
  touchFile,
  initStorageCleanup,
  cleanExpiredFiles,
} from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    ensureStorageDirs();
    initStorageCleanup();
    cleanExpiredFiles();

    const body = (await req.json().catch(() => ({}))) as {
      uploadFilename?: string;
      outputFilename?: string;
    };

    const { uploadFilename, outputFilename } = body;
    let uploadTouched = false;
    let outputTouched = false;

    if (uploadFilename) {
      const safeUpload = path.basename(uploadFilename);
      const uploadPath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, safeUpload);
      if (fs.existsSync(uploadPath)) {
        touchFile(uploadPath);
        uploadTouched = true;
      }
    }

    if (outputFilename) {
      const safeOutput = path.basename(outputFilename);
      const outputPath = path.join(/*turbopackIgnore: true*/ OUTPUTS_DIR, safeOutput);
      if (fs.existsSync(outputPath)) {
        touchFile(outputPath);
        outputTouched = true;
      }
    }

    return NextResponse.json({
      success: true,
      uploadTouched,
      outputTouched,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

