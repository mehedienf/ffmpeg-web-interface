/**
 * lib/storage.ts
 *
 * Ensures storage/uploads and storage/outputs are always resolved
 * relative to the project root directory, avoiding cPanel passenger cwd drift.
 */
import path from "path";
import fs from "fs";

// Always anchor to the true application root
const APP_ROOT = process.env.APP_DIR || process.cwd();
export const STORAGE_ROOT = path.join(APP_ROOT, "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
export const OUTPUTS_DIR = path.join(STORAGE_ROOT, "outputs");

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
