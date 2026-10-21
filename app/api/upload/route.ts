/**
 * app/api/upload/route.ts
 *
 * POST /api/upload
 * Step 1: Upload file to server. Returns a fileId.
 * The file stays in storage/uploads until processed or cleaned up after 15 minutes of inactivity.
 *
 * DELETE /api/upload
 * Allows client to immediately delete the uploaded file when user clears it.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import {
  ensureStorageDirs,
  UPLOADS_DIR,
  initStorageCleanup,
  cleanExpiredFiles,
  deleteFileSafe,
} from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    ensureStorageDirs();
    initStorageCleanup();
    cleanExpiredFiles();

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

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return NextResponse.json({ error: "Missing filename." }, { status: 400 });
    }

    const safeName = path.basename(filename);
    const filePath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, safeName);

    const deleted = deleteFileSafe(filePath);
    return NextResponse.json({ success: deleted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 500 });
  }
}
