/**
 * app/api/process/route.ts
 *
 * POST /api/process
 * Step 2: Process an already-uploaded file by fileId.
 * Uses FFMPEG_BINARY env var set by server.js (resolves system ffmpeg or ~/bin/ffmpeg).
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { ensureStorageDirs, UPLOADS_DIR, OUTPUTS_DIR } from "@/lib/storage";

function scheduleOutputCleanup(filePath: string) {
  setTimeout(() => {
    fs.unlink(filePath, () => {});
  }, 15 * 60 * 1000);
}

function calcDuration(start: string, end: string): number {
  const toSec = (t: string) => {
    const p = (t || "00:00:00").split(":").map(Number);
    return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  };
  return Math.max(1, toSec(end) - toSec(start));
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use binary resolved at server startup or explicit ~/bin/ffmpeg
    const userBin = path.join(require("os").homedir(), "bin", "ffmpeg");
    const binary =
      (fs.existsSync(userBin) ? userBin : null) ||
      process.env.FFMPEG_BINARY ||
      (function () {
        try { return require("ffmpeg-static") as string; } catch { return "ffmpeg"; }
      })();

    console.log("[FFmpeg] Binary:", binary);
    console.log("[FFmpeg] Args:", args.join(" "));

    // turbopackIgnore: true
    const child = spawn(/*turbopackIgnore: true*/ binary, args);
    let stderr = "";

    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error("[FFmpeg STDERR]\n", stderr);
        const brief = stderr.trim().split("\n").slice(-5).join(" | ");
        reject(new Error(brief || `FFmpeg exited with code ${code}`));
      }
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    ensureStorageDirs();

    const body = await req.json() as {
      fileId: string;
      filename: string;
      operation: string;
      outputFormat: string;
      startTime?: string;
      endTime?: string;
      fastCopy?: boolean;
      resolution?: string;
      crf?: number;
      audioBitrate?: string;
    };

    const { fileId, filename, operation, outputFormat } = body;
    const fmt = (outputFormat || "mp4").toLowerCase();

    if (!fileId || !filename) {
      return NextResponse.json({ error: "Missing fileId or filename." }, { status: 400 });
    }

    if (!["convert", "trim", "compress", "extract"].includes(operation)) {
      return NextResponse.json({ error: `Unknown operation: ${operation}` }, { status: 400 });
    }

    const uploadPath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, path.basename(filename));
    if (!fs.existsSync(uploadPath)) {
      return NextResponse.json(
        { error: "Upload not found. Please re-upload the file." },
        { status: 404 },
      );
    }

    const stat = fs.statSync(uploadPath);
    if (stat.size === 0) {
      return NextResponse.json({ error: "Upload file is empty or corrupt." }, { status: 400 });
    }

    const outputExt = fmt.startsWith(".") ? fmt : `.${fmt}`;
    const outputName = `${randomUUID()}${outputExt}`;
    const outputPath = path.join(/*turbopackIgnore: true*/ OUTPUTS_DIR, outputName);

    const args: string[] = ["-y", "-i", uploadPath];

    if (operation === "convert") {
      if (fmt === "mp3") {
        args.push("-vn", "-c:a", "libmp3lame", "-b:a", "192k", outputPath);
      } else if (fmt === "aac") {
        args.push("-vn", "-c:a", "aac", "-b:a", "192k", outputPath);
      } else if (fmt === "wav") {
        args.push("-vn", "-c:a", "pcm_s16le", outputPath);
      } else if (fmt === "gif") {
        args.push(
          "-vf", "fps=10,scale=480:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
          "-an", outputPath,
        );
      } else if (fmt === "webm") {
        args.push(
          "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0",
          "-pix_fmt", "yuv420p", "-c:a", "libopus", outputPath,
        );
      } else {
        // mp4 / mkv
        args.push(
          "-c:v", "libx264", "-crf", "23", "-preset", "medium",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
          "-movflags", "+faststart", outputPath,
        );
      }
    } else if (operation === "trim") {
      const startTime = body.startTime || "00:00:00";
      const endTime   = body.endTime   || "";
      const fastCopy  = body.fastCopy  === true;

      args.push("-ss", startTime);
      if (endTime) args.push("-t", String(calcDuration(startTime, endTime)));

      if (fastCopy) {
        args.push("-c", "copy", "-avoid_negative_ts", "make_zero", outputPath);
      } else {
        args.push(
          "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
          "-movflags", "+faststart", outputPath,
        );
      }
    } else if (operation === "compress") {
      const resolution = body.resolution || "720p";
      const crf        = String(body.crf ?? 23);

      const scales: Record<string, string> = {
        "1080p": "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:x=(ow-iw)/2:y=(oh-ih)/2",
        "720p":  "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:x=(ow-iw)/2:y=(oh-ih)/2",
        "480p":  "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:x=(ow-iw)/2:y=(oh-ih)/2",
      };
      const scaleFilter = scales[resolution] || "scale=trunc(iw/2)*2:trunc(ih/2)*2";

      args.push(
        "-c:v", "libx264", "-crf", crf, "-preset", "medium",
        "-pix_fmt", "yuv420p", "-vf", scaleFilter,
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-movflags", "+faststart", outputPath,
      );
    } else if (operation === "extract") {
      const audioBitrate = body.audioBitrate || "192k";
      args.push("-vn");
      if (fmt === "wav") {
        args.push("-c:a", "pcm_s16le", outputPath);
      } else {
        args.push("-c:a", "libmp3lame", "-b:a", audioBitrate, outputPath);
      }
    }

    await runFFmpeg(args);

    // Delete the upload file immediately after processing
    fs.unlink(uploadPath, () => {});

    scheduleOutputCleanup(outputPath);

    return NextResponse.json({
      downloadUrl: `/api/download/${outputName}`,
      filename: outputName,
      outputFormat: fmt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Process route error]", msg);
    return NextResponse.json({ error: `Processing failed: ${msg}` }, { status: 500 });
  }
}
