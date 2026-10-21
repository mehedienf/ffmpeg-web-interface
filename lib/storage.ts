/**
 * lib/storage.ts
 *
 * Ensures storage/uploads and storage/outputs are always resolved
 * relative to the project root directory, avoiding cPanel passenger cwd drift.
 * Handles automatic cleanup of inactive input and output files after 15 minutes.
 */
import path from "path";
import fs from "fs";

// Always anchor to the true application root
const APP_ROOT = process.env.APP_DIR || process.cwd();
export const STORAGE_ROOT = path.join(APP_ROOT, "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
export const OUTPUTS_DIR = path.join(STORAGE_ROOT, "outputs");

// Inactivity threshold: 15 minutes
export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export function ensureStorageDirs() {
  [STORAGE_ROOT, UPLOADS_DIR, OUTPUTS_DIR].forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      }
    } catch (e) {
      console.warn("Storage directory notice:", e);
    }
  });
}

/**
 * Updates a file's access and modification timestamps to now,
 * signaling ongoing user activity.
 */
export function touchFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const now = new Date();
      fs.utimesSync(filePath, now, now);
    }
  } catch (err) {
    console.warn("[touchFile error]", err);
  }
}

/**
 * Safely removes a file if it exists.
 */
export function deleteFileSafe(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.warn("[deleteFileSafe error]", err);
  }
  return false;
}

/**
 * Cleans up files in storage/uploads and storage/outputs that have had no activity
 * for more than maxAgeMs (default 15 minutes).
 */
export function cleanExpiredFiles(maxAgeMs: number = INACTIVITY_TIMEOUT_MS): number {
  ensureStorageDirs();
  const now = Date.now();
  let deletedCount = 0;

  const targetDirs = [UPLOADS_DIR, OUTPUTS_DIR];

  for (const dir of targetDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        // Skip hidden files like .gitkeep or .DS_Store
        if (entry.startsWith(".")) continue;

        const filePath = path.join(dir, entry);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            const ageMs = now - stat.mtimeMs;
            if (ageMs >= maxAgeMs) {
              fs.unlinkSync(filePath);
              deletedCount++;
              console.log(
                `[Auto Cleanup] Deleted inactive file: ${entry} (${Math.round(ageMs / 1000)}s old)`,
              );
            }
          }
        } catch {
          // File might have already been removed by another request
        }
      }
    } catch (err) {
      console.warn(`[Auto Cleanup Error in ${dir}]:`, err);
    }
  }

  return deletedCount;
}

// Global cleanup interval guard to prevent multiple timers in dev/reloads
declare global {
  // eslint-disable-next-line no-var
  var __storage_cleanup_interval: NodeJS.Timeout | undefined;
}

/**
 * Initializes a background cleanup interval running every 60 seconds.
 */
export function initStorageCleanup() {
  if (global.__storage_cleanup_interval) {
    return;
  }

  // Run initial cleanup once at startup
  cleanExpiredFiles();

  global.__storage_cleanup_interval = setInterval(() => {
    cleanExpiredFiles();
  }, 60 * 1000);

  if (global.__storage_cleanup_interval.unref) {
    global.__storage_cleanup_interval.unref();
  }
}
