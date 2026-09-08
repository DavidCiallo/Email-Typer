/**
 * Extract verification codes from email body text.
 * Implementation lives in shared/lib/extract.ts alongside extractLinks —
 * the server runs both at ingest so list rows can carry codes without
 * carrying bodies.
 */
export { extractCodes } from "./extract";
