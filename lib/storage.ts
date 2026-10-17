/**
 * lib/storage.ts
 * Utility to lazily create the storage/uploads and storage/outputs
 * directories relative to the project root.  Works in both dev and
 * the cPanel production environment.
 */
import path from "path";
import fs from "fs";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
export const OUTPUTS_DIR = path.join(STORAGE_ROOT, "outputs");

export function ensureStorageDirs() {
  [UPLOADS_DIR, OUTPUTS_DIR].forEach((dir) => {
    // turbopackIgnore: true — intentional runtime path, not a static asset
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
