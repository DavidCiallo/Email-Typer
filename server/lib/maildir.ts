import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";

/**
 * Maildir-style atomic delivery: write into tmp/ then rename into new/.
 * The rename guarantees that a watcher (or a concurrent reader) never sees a
 * half-written message — Postfix uses the same protocol.
 */

/** Sanitize a folder name used under the maildir root (domain or synthetic mailbox dir). */
export function sanitizeMaildirName(name: string): string {
    return (name || "").toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 100) || "_unknown";
}

export function deliverToMaildir(root: string, folder: string, raw: string | Uint8Array): string {
    const safeFolder = sanitizeMaildirName(folder);
    const folderDir = path.join(root, safeFolder);
    const tmpDir = path.join(folderDir, "tmp");
    const newDir = path.join(folderDir, "new");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });

    const unique = `${Date.now()}.M${process.pid}${nanoid(10)}`;
    const tmpPath = path.join(tmpDir, unique);
    const newPath = path.join(newDir, unique);

    fs.writeFileSync(tmpPath, raw);
    fs.renameSync(tmpPath, newPath);
    return newPath;
}
