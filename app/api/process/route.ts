/**
 * app/api/process/route.ts
 *
 * POST /api/process
 * Accepts multipart/form-data with:
 *   - file         : the media file to process
 *   - operation    : "convert" | "trim" | "compress" | "extract"
 *   - outputFormat : target container/codec extension
 *   - startTime    : (trim) "HH:MM:SS"
 *   - endTime      : (trim) "HH:MM:SS"
 *   - fastCopy     : (trim) "true" | "false"
 *   - resolution   : (compress) "1080p" | "720p" | "480p"
 *   - crf          : (compress) number as string
 *   - audioBitrate : (extract) "128k" | "192k" | "320k"
 *
 * Returns JSON:
 *   { downloadUrl: string; filename: string; outputFormat: string }
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobe from "@ffprobe-installer/ffprobe";
import { ensureStorageDirs, UPLOADS_DIR, OUTPUTS_DIR } from "@/lib/storage";

// Patch the binary paths so fluent-ffmpeg uses the bundled npm binaries
// instead of requiring a system-level FFmpeg installation.
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
ffmpeg.setFfprobePath(ffprobe.path);

/** Schedule deletion of the output file after 15 minutes. */
function scheduleOutputCleanup(filePath: string) {
  setTimeout(
    () => {
      fs.unlink(filePath, (err) => {
        if (err && err.code !== "ENOENT") {
          console.error("Cleanup error for output:", filePath, err);
        }
      });
    },
    15 * 60 * 1000,
  );
}

/** Immediately delete the input upload file (fire-and-forget). */
function deleteUpload(filePath: string) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete upload:", filePath, err);
    }
  });
}

const RESOLUTION_MAP: Record<string, string> = {
  "1080p": "1920x1080",
  "720p": "1280x720",
  "480p": "854x480",
};

export async function POST(req: NextRequest) {
  try {
    ensureStorageDirs();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const operation = (formData.get("operation") as string) ?? "";
    const outputFormat = (formData.get("outputFormat") as string) ?? "mp4";

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!["convert", "trim", "compress", "extract"].includes(operation)) {
      return NextResponse.json(
        { error: `Unknown operation: ${operation}` },
        { status: 400 },
      );
    }

    // Save the uploaded file buffer to disk
    const uploadExt = path.extname(file.name) || ".tmp";
    const uploadName = `${randomUUID()}${uploadExt}`;
    // turbopackIgnore: true — runtime storage path, not a static asset
    const uploadPath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, uploadName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(uploadPath, fileBuffer);

    // Build the output filename
    const outputExt = outputFormat.startsWith(".")
      ? outputFormat
      : `.${outputFormat}`;
    const outputName = `${randomUUID()}${outputExt}`;
    // turbopackIgnore: true — runtime storage path, not a static asset
    const outputPath = path.join(/*turbopackIgnore: true*/ OUTPUTS_DIR, outputName);

    // Helper that wraps fluent-ffmpeg in a promise
    function runFfmpeg(cmd: ffmpeg.FfmpegCommand): Promise<void> {
      return new Promise((resolve, reject) => {
        cmd
          .on("error", (err) => reject(err))
          .on("end", () => resolve())
          .run();
      });
    }

    // ----------------------------------------------------------------
    // Branch on operation
    // ----------------------------------------------------------------
    if (operation === "convert") {
      const cmd = ffmpeg(uploadPath).output(outputPath);

      // Codec hints based on target format
      if (outputFormat === "mp3") {
        cmd.noVideo().audioCodec("libmp3lame").audioBitrate("192k");
      } else if (outputFormat === "aac") {
        cmd.noVideo().audioCodec("aac").audioBitrate("192k");
      } else if (outputFormat === "wav") {
        cmd.noVideo().audioCodec("pcm_s16le");
      } else if (outputFormat === "gif") {
        cmd
          .outputOptions([
            "-vf",
            "fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
          ])
          .noAudio();
      } else if (outputFormat === "webm") {
        cmd.videoCodec("libvpx-vp9").audioCodec("libopus");
      } else if (outputFormat === "mkv") {
        cmd.videoCodec("libx264").audioCodec("aac");
      } else {
        // mp4 default
        cmd.videoCodec("libx264").audioCodec("aac");
      }

      try {
        await runFfmpeg(cmd);
      } finally {
        deleteUpload(uploadPath);
      }
    } else if (operation === "trim") {
      const startTime = (formData.get("startTime") as string) ?? "00:00:00";
      const endTime = (formData.get("endTime") as string) ?? "";
      const fastCopy = formData.get("fastCopy") === "true";

      const cmd = ffmpeg(uploadPath)
        .setStartTime(startTime)
        .output(outputPath);

      if (endTime) {
        cmd.setDuration(calcDuration(startTime, endTime));
      }

      if (fastCopy) {
        cmd.outputOptions(["-c", "copy"]);
      } else {
        cmd.videoCodec("libx264").audioCodec("aac");
      }

      try {
        await runFfmpeg(cmd);
      } finally {
        deleteUpload(uploadPath);
      }
    } else if (operation === "compress") {
      const resolution =
        (formData.get("resolution") as string) ?? "";
      const crf = parseInt((formData.get("crf") as string) ?? "23", 10);
      const size = RESOLUTION_MAP[resolution];

      const cmd = ffmpeg(uploadPath)
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions(["-crf", String(crf), "-preset", "medium"])
        .output(outputPath);

      if (size) {
        cmd.size(size);
      }

      try {
        await runFfmpeg(cmd);
      } finally {
        deleteUpload(uploadPath);
      }
    } else if (operation === "extract") {
      const audioBitrate =
        (formData.get("audioBitrate") as string) ?? "192k";

      const cmd = ffmpeg(uploadPath).noVideo().output(outputPath);

      if (outputFormat === "wav") {
        cmd.audioCodec("pcm_s16le");
      } else {
        // mp3 default
        cmd.audioCodec("libmp3lame").audioBitrate(audioBitrate);
      }

      try {
        await runFfmpeg(cmd);
      } finally {
        deleteUpload(uploadPath);
      }
    }

    // Schedule auto-cleanup of the output file after 15 minutes
    scheduleOutputCleanup(outputPath);

    const downloadUrl = `/api/download/${outputName}`;
    return NextResponse.json({
      downloadUrl,
      filename: outputName,
      outputFormat,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("FFmpeg processing error:", message);
    return NextResponse.json(
      { error: `Processing failed: ${message}` },
      { status: 500 },
    );
  }
}

/**
 * Calculate duration in seconds between two HH:MM:SS timestamps.
 */
function calcDuration(start: string, end: string): number {
  const toSeconds = (t: string) => {
    const parts = t.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  };
  return Math.max(0, toSeconds(end) - toSeconds(start));
}

