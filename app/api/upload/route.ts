/**
 * app/api/upload/route.ts
 *
 * POST /api/upload
 * Step 1: Upload file to server. Returns a fileId.
 * The file stays in storage/uploads until processed or cleaned up.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { ensureStorageDirs, UPLOADS_DIR } from "@/lib/storage";

// Auto-delete unprocessed uploads after 30 minutes
function scheduleUploadCleanup(filePath: string) {
  setTimeout(() => {
    fs.unlink(filePath, () => {});
  }, 30 * 60 * 1000);
}

export async function POST(req: NextRequest) {
  try {
    ensureStorageDirs();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const ext = path.extname(file.name) || ".mp4";
    const fileId = randomUUID();
    const filename = `${fileId}${ext}`;
    const uploadPath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(uploadPath, buffer);

    const stat = fs.statSync(uploadPath);
    if (stat.size === 0) {
      fs.unlinkSync(uploadPath);
      return NextResponse.json(
        { error: "Uploaded file was empty. Please try again." },
        { status: 400 },
      );
    }

    scheduleUploadCleanup(uploadPath);

    return NextResponse.json({
      fileId,
      filename,
      originalName: file.name,
      size: stat.size,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }
}

