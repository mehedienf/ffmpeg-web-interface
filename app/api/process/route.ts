/**
 * app/api/process/route.ts
 *
 * Robust, production-grade FFmpeg execution handler with comprehensive
 * stderr error reporting and compatibility fixes for cPanel.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobe from "@ffprobe-installer/ffprobe";
import { ensureStorageDirs, UPLOADS_DIR, OUTPUTS_DIR } from "@/lib/storage";

// Ensure FFmpeg and FFprobe binary paths are linked
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobe && ffprobe.path) {
  ffmpeg.setFfprobePath(ffprobe.path);
}

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

/** Delete the input upload file safely. */
function deleteUpload(filePath: string) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete upload:", filePath, err);
    }
  });
}

/**
 * Calculate duration in seconds between two HH:MM:SS timestamps.
 */
function calcDuration(start: string, end: string): number {
  const toSeconds = (t: string) => {
    const parts = (t || "00:00:00").split(":").map(Number);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;
    return h * 3600 + m * 60 + s;
  };
  return Math.max(1, toSeconds(end) - toSeconds(start));
}

export async function POST(req: NextRequest) {
  try {
    ensureStorageDirs();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const operation = (formData.get("operation") as string) ?? "";
    const outputFormat = ((formData.get("outputFormat") as string) ?? "mp4").toLowerCase();

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!["convert", "trim", "compress", "extract"].includes(operation)) {
      return NextResponse.json(
        { error: `Unknown operation: ${operation}` },
        { status: 400 },
      );
    }

    // Save uploaded file buffer to disk
    const uploadExt = path.extname(file.name) || ".tmp";
    const uploadName = `${randomUUID()}${uploadExt}`;
    const uploadPath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, uploadName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(uploadPath, fileBuffer);

    // Build unique output filename
    const outputExt = outputFormat.startsWith(".") ? outputFormat : `.${outputFormat}`;
    const outputName = `${randomUUID()}${outputExt}`;
    const outputPath = path.join(/*turbopackIgnore: true*/ OUTPUTS_DIR, outputName);

    // Promisified execution with full stderr logging for crystal clear error tracing
    function runFfmpeg(cmd: ffmpeg.FfmpegCommand): Promise<void> {
      return new Promise((resolve, reject) => {
        let stderrOutput = "";

        cmd
          .on("stderr", (line) => {
            stderrOutput += line + "\n";
          })
          .on("error", (err, _stdout, stderr) => {
            const finalLog = stderr || stderrOutput || err.message;
            console.error("FFmpeg execution failure:\n", finalLog);
            // Extract the most informative last lines of stderr
            const lines = finalLog.trim().split("\n");
            const briefError = lines.slice(-4).join(" | ");
            reject(new Error(briefError || err.message));
          })
          .on("end", () => {
            resolve();
          })
          .run();
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Execute Requested Operation
    // ─────────────────────────────────────────────────────────────
    if (operation === "convert") {
      const cmd = ffmpeg(uploadPath).output(outputPath);

      if (outputFormat === "mp3") {
        cmd.noVideo().audioCodec("libmp3lame").audioBitrate("192k");
      } else if (outputFormat === "aac") {
        cmd.noVideo().audioCodec("aac").audioBitrate("192k");
      } else if (outputFormat === "wav") {
        cmd.noVideo().audioCodec("pcm_s16le");
      } else if (outputFormat === "gif") {
        cmd
          .noAudio()
          .outputOptions([
            "-vf",
            "fps=10,scale=480:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
          ]);
      } else if (outputFormat === "webm") {
        cmd
          .videoCodec("libvpx-vp9")
          .outputOptions(["-crf", "30", "-b:v", "0", "-pix_fmt", "yuv420p"]);
      } else {
        // mp4 / mkv default: safe H.264 encoding with universally compatible pixel format
        cmd
          .videoCodec("libx264")
          .outputOptions([
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            "-preset",
            "fast",
            "-movflags",
            "+faststart",
          ]);
      }

      try {
        await runFfmpeg(cmd);
      } finally {
        deleteUpload(uploadPath);
      }
    } else if (operation === "trim") {
      const startTime = (formData.get("startTime") as string) || "00:00:00";
      const endTime = (formData.get("endTime") as string) || "";
      const fastCopy = formData.get("fastCopy") === "true";

      const cmd = ffmpeg(uploadPath)
        .setStartTime(startTime)
        .output(outputPath);

      if (endTime) {
        cmd.setDuration(calcDuration(startTime, endTime));
      }

      if (fastCopy) {
        // Fast stream copy without re-encoding
        cmd.outputOptions(["-c", "copy", "-avoid_negative_ts", "make_zero"]);
      } else {
        cmd
          .videoCodec("libx264")
          .outputOptions([
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            "-preset",
            "fast",
            "-movflags",
            "+faststart",
          ]);
      }

      try {
        await runFfmpeg(cmd);
      } finally {
        deleteUpload(uploadPath);
      }
    } else if (operation === "compress") {
      const resolution = (formData.get("resolution") as string) || "720p";
      const crf = parseInt((formData.get("crf") as string) || "23", 10);

      // Scale maintaining aspect ratio and ensuring even pixel dimensions
      let scaleFilter = "pad=ceil(iw/2)*2:ceil(ih/2)*2";
      if (resolution === "1080p") {
        scaleFilter = "scale='min(1920,iw)':-2";
      } else if (resolution === "720p") {
        scaleFilter = "scale='min(1280,iw)':-2";
      } else if (resolution === "480p") {
        scaleFilter = "scale='min(854,iw)':-2";
      }

      const cmd = ffmpeg(uploadPath)
        .videoCodec("libx264")
        .outputOptions([
          "-crf",
          String(crf),
          "-preset",
          "fast",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          scaleFilter,
          "-movflags",
          "+faststart",
        ])
        .output(outputPath);

      try {
        await runFfmpeg(cmd);
      } finally {
        deleteUpload(uploadPath);
      }
    } else if (operation === "extract") {
      const audioBitrate = (formData.get("audioBitrate") as string) || "192k";
      const cmd = ffmpeg(uploadPath).noVideo().output(outputPath);

      if (outputFormat === "wav") {
        cmd.audioCodec("pcm_s16le");
      } else {
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
    console.error("FFmpeg route error:", message);
    return NextResponse.json(
      { error: `Processing failed: ${message}` },
      { status: 500 },
    );
  }
}
