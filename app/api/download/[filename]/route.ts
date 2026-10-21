/**
 * app/api/download/[filename]/route.ts
 *
 * GET /api/download/:filename
 * Streams the processed file from storage/outputs with proper headers.
 * Supports inline video/audio streaming with HTTP 206 Range requests for seamless preview playback.
 *
 * DELETE /api/download/:filename
 * Removes the output file from storage/outputs when replacing or clearing.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { OUTPUTS_DIR, touchFile, cleanExpiredFiles, deleteFileSafe } from "@/lib/storage";

const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  gif: "image/gif",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/download/[filename]">,
) {
  const { filename } = await ctx.params;

  // Sanitise – prevent path traversal attacks
  const safeName = path.basename(filename);
  const filePath = path.join(OUTPUTS_DIR, safeName);

  cleanExpiredFiles();

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "File not found or has already expired." },
      { status: 404 },
    );
  }

  // Refresh timestamp on access to reflect user activity
  touchFile(filePath);

  const ext = path.extname(safeName).replace(".", "").toLowerCase();
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  const url = new URL(req.url);
  const isInline = url.searchParams.get("inline") === "true";
  const rangeHeader = req.headers.get("range");

  // Support HTTP Range requests for video/audio seek & streaming
  if (rangeHeader && isInline) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start < fileSize) {
        const chunkEnd = Math.min(end, fileSize - 1);
        const chunkSize = chunkEnd - start + 1;
        const nodeStream = fs.createReadStream(filePath, { start, end: chunkEnd });

        const webStream = new ReadableStream({
          start(controller) {
            nodeStream.on("data", (chunk) =>
              controller.enqueue(
                chunk instanceof Buffer ? chunk : Buffer.from(chunk as string),
              ),
            );
            nodeStream.on("end", () => controller.close());
            nodeStream.on("error", (err) => controller.error(err));
          },
          cancel() {
            nodeStream.destroy();
          },
        });

        return new Response(webStream, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${chunkEnd}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSize),
            "Content-Disposition": "inline",
            "Cache-Control": "no-cache",
          },
        });
      }
    }
  }

  const nodeStream = fs.createReadStream(filePath);

  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) =>
        controller.enqueue(
          chunk instanceof Buffer ? chunk : Buffer.from(chunk as string),
        ),
      );
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  const disposition = isInline
    ? "inline"
    : `attachment; filename="${safeName}"`;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": isInline ? "no-cache" : "no-store",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/download/[filename]">,
) {
  try {
    const { filename } = await ctx.params;
    const safeName = path.basename(filename);
    const filePath = path.join(OUTPUTS_DIR, safeName);
    const deleted = deleteFileSafe(filePath);
    return NextResponse.json({ success: deleted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
