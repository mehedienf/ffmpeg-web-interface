/**
 * app/api/process/route.ts
 *
 * Hardened for cPanel / CloudLinux Shared Hosting:
 * 1. Global -threads 2 to prevent pthread creation failure (code -22).
 * 2. -pix_fmt yuv420p for universal compatibility.
 * 3. Even dimension guarantees via scale=-2:H or scale=trunc(iw/2)*2:trunc(ih/2)*2.
 * 4. -preset veryfast for minimal memory footprint and fast processing.
 * 5. Supports chained operations: Convert + Compress + Trim combined in a single FFmpeg pass!
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import {
  ensureStorageDirs,
  UPLOADS_DIR,
  OUTPUTS_DIR,
  touchFile,
  initStorageCleanup,
  cleanExpiredFiles,
  deleteFileSafe,
} from "@/lib/storage";

function calcDuration(start: string, end: string): number {
  const toSec = (t: string) => {
    const p = (t || "00:00:00").split(":").map(Number);
    return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  };
  return Math.max(1, toSec(end) - toSec(start));
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check Project Root bin first, then Home bin, then env/system
    const appRoot = process.env.APP_DIR || process.cwd();
    const appBin = path.join(appRoot, "bin", "ffmpeg");
    const homeBin = path.join(require("os").homedir(), "bin", "ffmpeg");

    let binary = "ffmpeg";
    if (fs.existsSync(appBin)) {
      binary = appBin;
    } else if (fs.existsSync(homeBin)) {
      binary = homeBin;
    } else if (process.env.FFMPEG_BINARY) {
      binary = process.env.FFMPEG_BINARY;
    }

    console.log("[FFmpeg] Binary:", binary);
    console.log("[FFmpeg] Args:", args.join(" "));

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
    initStorageCleanup();
    cleanExpiredFiles();

    const body = (await req.json()) as {
      fileId: string;
      filename: string;
      previousFilename?: string;
      operation?: string;
      operations?: string[];
      outputFormat: string;
      startTime?: string;
      endTime?: string;
      fastCopy?: boolean;
      resolution?: string;
      crf?: number;
      audioBitrate?: string;
    };

    const { fileId, filename, outputFormat } = body;
    const fmt = (outputFormat || "mp4").toLowerCase();

    if (!fileId || !filename) {
      return NextResponse.json({ error: "Missing fileId or filename." }, { status: 400 });
    }

    // Support both multiple operations array and legacy single operation string
    const operations: string[] = Array.isArray(body.operations) && body.operations.length > 0
      ? body.operations
      : body.operation
      ? [body.operation]
      : ["convert"];

    const validOps = ["convert", "trim", "compress", "extract"];
    if (!operations.every((op) => validOps.includes(op))) {
      return NextResponse.json({ error: "Invalid operation specified." }, { status: 400 });
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

    // If re-processing, delete the previous output file so orphaned files don't accumulate
    if (body.previousFilename) {
      const safePrev = path.basename(body.previousFilename);
      const prevPath = path.join(/*turbopackIgnore: true*/ OUTPUTS_DIR, safePrev);
      deleteFileSafe(prevPath);
      console.log(`[Re-process] Deleted previous converted file: ${safePrev}`);
    }

    const outputExt = fmt.startsWith(".") ? fmt : `.${fmt}`;
    const outputName = `${randomUUID()}${outputExt}`;
    const outputPath = path.join(/*turbopackIgnore: true*/ OUTPUTS_DIR, outputName);

    const isExtract = operations.includes("extract");
    const isTrim = operations.includes("trim");
    const isCompress = operations.includes("compress");
    const isConvert = operations.includes("convert");

    // Global flags: -y (overwrite), -threads 2 (prevents thread limit exhaustion on cPanel)
    const args: string[] = ["-y", "-threads", "2"];

    // ── Audio Extraction Mode ────────────────────────────────────────────────
    if (isExtract) {
      if (isTrim) {
        const startTime = body.startTime || "00:00:00";
        const endTime = body.endTime || "";
        args.push("-ss", startTime);
        if (endTime) args.push("-t", String(calcDuration(startTime, endTime)));
      }

      args.push("-i", uploadPath, "-vn");
      const audioBitrate = body.audioBitrate || "192k";

      if (fmt === "wav") {
        args.push("-c:a", "pcm_s16le", outputPath);
      } else if (fmt === "aac") {
        args.push("-c:a", "aac", "-b:a", audioBitrate, outputPath);
      } else {
        args.push("-c:a", "libmp3lame", "-b:a", audioBitrate, outputPath);
      }
    } else {
      // ── Video Processing (Convert / Compress / Trim combined) ──────────────
      const startTime = body.startTime || "00:00:00";
      const endTime = body.endTime || "";
      const canFastCopy = isTrim && !isCompress && !isConvert && body.fastCopy === true;

      if (isTrim) {
        args.push("-ss", startTime);
        if (endTime) args.push("-t", String(calcDuration(startTime, endTime)));
      }

      args.push("-i", uploadPath);

      if (canFastCopy) {
        // Fast stream copy (instant cutting without re-encoding)
        args.push("-c", "copy", "-avoid_negative_ts", "make_zero", outputPath);
      } else {
        // Re-encoding pipeline
        let scaleFilter = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
        if (isCompress) {
          const resolution = body.resolution || "720p";
          if (resolution === "1080p") {
            scaleFilter = "scale=-2:1080";
          } else if (resolution === "720p") {
            scaleFilter = "scale=-2:720";
          } else if (resolution === "480p") {
            scaleFilter = "scale=-2:480";
          }
        }

        const crf = String(body.crf ?? (fmt === "webm" ? 30 : 23));

        if (fmt === "gif") {
          args.push(
            "-vf",
            `fps=10,${scaleFilter}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
            "-an",
            outputPath,
          );
        } else if (fmt === "webm") {
          args.push(
            "-c:v", "libvpx-vp9",
            "-threads", "2",
            "-crf", crf,
            "-b:v", "0",
            "-pix_fmt", "yuv420p",
            "-vf", scaleFilter,
            "-c:a", "libopus",
            outputPath,
          );
        } else if (["mp3", "wav", "aac"].includes(fmt)) {
          // Audio-only conversion
          args.push("-vn");
          if (fmt === "wav") {
            args.push("-c:a", "pcm_s16le", outputPath);
          } else if (fmt === "aac") {
            args.push("-c:a", "aac", "-b:a", "192k", outputPath);
          } else {
            args.push("-c:a", "libmp3lame", "-b:a", "192k", outputPath);
          }
        } else {
          // Default: MP4 / MKV with H.264 + AAC
          args.push(
            "-c:v", "libx264",
            "-threads", "2",
            "-crf", crf,
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-vf", scaleFilter,
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            "-movflags", "+faststart",
            outputPath,
          );
        }
      }
    }

    await runFFmpeg(args);

    // Keep both input and output files active; auto-deleted after 15m of user inactivity
    touchFile(uploadPath);
    touchFile(outputPath);

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
