/**
 * Extract verification codes from email body text.
 * Single implementation lives in shared/lib — the server also runs it at
 * ingest so list rows can carry codes without carrying bodies.
 */
export { extractCodes } from "../../shared/lib/verifycode";
