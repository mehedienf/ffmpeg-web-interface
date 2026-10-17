/**
 * app/api/download/[filename]/route.ts
 *
 * GET /api/download/:filename
 * Streams the processed file from storage/outputs with proper headers
 * so the browser triggers a download on both mobile and desktop.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { OUTPUTS_DIR } from "@/lib/storage";

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
  _req: NextRequest,
  ctx: RouteContext<"/api/download/[filename]">,
) {
  const { filename } = await ctx.params;

  // Sanitise – prevent path traversal attacks
  const safeName = path.basename(filename);
  const filePath = path.join(OUTPUTS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "File not found or has already expired." },
      { status: 404 },
    );
  }

  const ext = path.extname(safeName).replace(".", "").toLowerCase();
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";
  const stat = fs.statSync(filePath);

  const nodeStream = fs.createReadStream(filePath);

  // Convert Node.js ReadableStream → Web ReadableStream for App Router
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
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(stat.size),
      "Cache-Control": "no-store",
    },
  });
}
