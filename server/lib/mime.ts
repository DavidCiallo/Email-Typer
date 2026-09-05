import { nanoid } from "nanoid";

/**
 * Minimal MIME toolkit used by the ingest pipeline.
 *
 * Parsing works on Buffers so binary attachment parts survive intact:
 * structure (headers/boundaries) is located as bytes, leaf bodies are kept as
 * Buffers and only decoded on demand (transfer encoding → bytes → charset text).
 * Composing produces CRLF-terminated RFC 5322 messages with base64 bodies.
 */

// ---------- charsets ----------

const CHARSET_MAP: Record<string, string> = {
    "gb2312": "gbk",
    "gbk": "gbk",
    "gb18030": "gb18030",
    "big5": "big5",
    "shift_jis": "shift-jis",
    "shift-jis": "shift-jis",
    "euc-jp": "euc-jp",
    "euc-kr": "euc-kr",
    "windows-1252": "windows-1252",
    "windows-874": "windows-874",
    "iso-8859-1": "iso-8859-1",
    "iso-8859-2": "iso-8859-2",
    "iso-8859-6": "iso-8859-6",
    "koi8-r": "koi8-r",
    "us-ascii": "utf-8",
};

export function resolveCharset(charset: string): string {
    const key = (charset || "").toLowerCase().replace(/["']/g, "").trim();
    return CHARSET_MAP[key] || "utf-8";
}

export function decodeText(buf: Buffer, charset?: string): string {
    try {
        return new TextDecoder(resolveCharset(charset || "utf-8")).decode(buf);
    } catch {
        return buf.toString("utf-8");
    }
}

/** Decode RFC 2047 encoded-words like =?UTF-8?B?...?= or =?GB2312?Q?...?= */
export function decodeMimeHeader(value: string): string {
    if (!value) return "";
    return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, charset: string, encoding: string, data: string) => {
        try {
            const decoder = resolveCharset(charset);
            if (encoding.toUpperCase() === "B") {
                return new TextDecoder(decoder).decode(Buffer.from(data, "base64"));
            } else {
                const bytes: number[] = [];
                const src = data.replace(/_/g, " ");
                let i = 0;
                while (i < src.length) {
                    if (src[i] === "=" && i + 2 < src.length) {
                        bytes.push(parseInt(src.substring(i + 1, i + 3), 16));
                        i += 3;
                    } else {
                        bytes.push(src.charCodeAt(i));
                        i++;
                    }
                }
                return new TextDecoder(decoder).decode(new Uint8Array(bytes));
            }
        } catch {
            return data;
        }
    });
}

// ---------- structure ----------

interface HeaderBody {
    headers: Record<string, string>;
    body: Buffer;
}

function headerEndIndex(buf: Buffer): { end: number; sepLen: number } {
    const crlf = buf.indexOf("\r\n\r\n");
    const lf = buf.indexOf("\n\n");
    if (crlf !== -1 && (lf === -1 || crlf < lf)) return { end: crlf, sepLen: 4 };
    if (lf !== -1) return { end: lf, sepLen: 2 };
    return { end: buf.length, sepLen: 0 };
}

function parseHeaderLines(text: string): Record<string, string> {
    const headers: Record<string, string> = {};
    let currentKey = "";
    for (const line of text.split(/\r?\n/)) {
        if (/^[ \t]/.test(line) && currentKey) {
            headers[currentKey] += " " + line.trim();
        } else {
            const idx = line.indexOf(":");
            if (idx > 0) {
                currentKey = line.slice(0, idx).trim().toLowerCase();
                headers[currentKey] = line.slice(idx + 1).trim();
            }
        }
    }
    return headers;
}

export function splitHeaderBody(buf: Buffer): HeaderBody {
    const { end, sepLen } = headerEndIndex(buf);
    const headers = parseHeaderLines(buf.slice(0, end).toString("utf-8"));
    const body = sepLen ? buf.slice(end + sepLen) : Buffer.alloc(0);
    return { headers, body };
}

/** Parse "type/subtype; k=v; k2="v2"" — quote- and backslash-aware. */
export function parseContentType(value: string): { type: string; params: Record<string, string> } {
    const semi = value.indexOf(";");
    const type = (semi === -1 ? value : value.slice(0, semi)).trim().toLowerCase();
    const params = resolveExtendedParams(parseParams(semi === -1 ? "" : value.slice(semi + 1)));
    return { type, params };
}

function parseParams(s: string): Record<string, string> {
    const params: Record<string, string> = {};
    let i = 0;
    while (i < s.length) {
        while (i < s.length && (s[i] === ";" || s[i] === " " || s[i] === "\t")) i++;
        const eq = s.indexOf("=", i);
        if (eq === -1) break;
        const name = s.slice(i, eq).trim().toLowerCase();
        i = eq + 1;
        let value = "";
        if (s[i] === '"') {
            i++;
            while (i < s.length && s[i] !== '"') {
                if (s[i] === "\\") {
                    value += s[i + 1] || "";
                    i += 2;
                } else {
                    value += s[i];
                    i++;
                }
            }
            i++;
        } else {
            let j = i;
            while (j < s.length && s[j] !== ";") j++;
            value = s.slice(i, j).trim();
            i = j;
        }
        if (name) params[name] = value;
        if (s[i] === ";") i++;
    }
    return params;
}

/**
 * Fold RFC 2231 continuations (filename*0*, filename*1*...) and extended params
 * (filename*=utf-8''...) into plain parameter names with decoded values.
 */
function resolveExtendedParams(params: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    const frags = new Map<string, { idx: number; ext: boolean; value: string }[]>();
    for (const [k, v] of Object.entries(params)) {
        const m = k.match(/^(.+?)\*(\d+)?(\*)?$/);
        if (!m) {
            out[k] = v;
            continue;
        }
        const base = m[1];
        const idx = m[2] !== undefined ? parseInt(m[2], 10) : 0;
        const ext = m[3] === "*" || m[2] === undefined;
        const arr = frags.get(base) || [];
        arr.push({ idx, ext, value: v });
        frags.set(base, arr);
    }
    for (const [base, arr] of frags) {
        arr.sort((a, b) => a.idx - b.idx);
        const isExt = arr.some((f) => f.ext);
        const joined = arr.map((f) => f.value).join("");
        out[base] = isExt ? decodeExtendedParam(joined) : decodeMimeHeader(joined);
    }
    return out;
}

/** Decode RFC 2231 extended values: charset''percent-encoded (also handles bare percent-encoding). */
function decodeExtendedParam(value: string): string {
    const m = value.match(/^([^']*)'[^']*'(.*)$/s);
    const raw = m ? m[2] : value;
    const charset = m && m[1] ? m[1] : "utf-8";
    const bytes: number[] = [];
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === "%" && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3))) {
            bytes.push(parseInt(raw.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            bytes.push(raw.charCodeAt(i));
        }
    }
    try {
        return new TextDecoder(resolveCharset(charset)).decode(new Uint8Array(bytes));
    } catch {
        return raw;
    }
}

export function sanitizeFilename(name: string): string {
    const decoded = decodeMimeHeader(name || "").replace(/[\r\n\0]/g, "");
    const cleaned = decoded.replace(/^.*[\/\\]/, "").trim();
    return cleaned.slice(0, 200);
}

// ---------- transfer decoding ----------

export function decodeTransfer(body: Buffer, encoding: string): Buffer {
    const enc = (encoding || "").trim().toLowerCase();
    if (enc === "base64") {
        const text = body.toString("ascii").replace(/[^A-Za-z0-9+/=]/g, "");
        try {
            return Buffer.from(text, "base64");
        } catch {
            return body;
        }
    }
    if (enc === "quoted-printable") {
        return decodeQuotedPrintable(body);
    }
    return body;
}

function decodeQuotedPrintable(body: Buffer): Buffer {
    const out: number[] = [];
    let i = 0;
    while (i < body.length) {
        const b = body[i];
        if (b === 0x3d /* = */) {
            if (body[i + 1] === 0x0d && body[i + 2] === 0x0a) { i += 3; continue; }  // soft break =CRLF
            if (body[i + 1] === 0x0a) { i += 2; continue; }                          // soft break =LF
            const hex = body.slice(i + 1, i + 3).toString("ascii");
            if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                out.push(parseInt(hex, 16));
                i += 3;
                continue;
            }
        }
        out.push(b);
        i++;
    }
    return Buffer.from(out);
}

// ---------- multipart walking ----------

export interface ParsedAttachment {
    filename: string;
    contentType: string;
    size: number;
    cid: string;
    inline: boolean;
    content: Buffer;
}

export interface ParsedEmail {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    time: number;
    message_id: string;
    source: string;
    mailbox_id: string;
    account_id: string;
    attachments: ParsedAttachment[];
}

const MAX_DEPTH = 10;

interface WalkOut {
    text: string;
    html: string;
    attachments: ParsedAttachment[];
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
    const delim = Buffer.from("--" + boundary, "ascii");
    const marks: { start: number; close: boolean }[] = [];
    let pos = 0;
    while (true) {
        const idx = body.indexOf(delim, pos);
        if (idx === -1) break;
        if (idx === 0 || body[idx - 1] === 0x0a) {
            const after = idx + delim.length;
            const close = body[after] === 0x2d && body[after + 1] === 0x2d; // trailing "--"
            marks.push({ start: idx, close });
            if (close) break;
        }
        pos = idx + delim.length;
    }

    const parts: Buffer[] = [];
    for (let i = 0; i + 1 < marks.length; i++) {
        let segStart = marks[i].start + delim.length;
        while (segStart < body.length && body[segStart] !== 0x0a) segStart++; // skip padding to EOL
        segStart++;                                                            // past \n
        let segEnd = marks[i + 1].start;
        if (segEnd > 0 && body[segEnd - 1] === 0x0a) segEnd--;                 // strip CRLF before delimiter
        if (segEnd > 0 && body[segEnd - 1] === 0x0d) segEnd--;
        if (segEnd > segStart) parts.push(body.slice(segStart, segEnd));
    }
    return parts;
}

function walkPart(buf: Buffer, headers: Record<string, string>, depth: number, out: WalkOut): void {
    if (depth > MAX_DEPTH) return;

    const contentTypeHeader = headers["content-type"] || "text/plain";
    const { type: ctype, params } = parseContentType(contentTypeHeader);
    const { body } = splitHeaderBody(buf);

    if (ctype.startsWith("multipart/")) {
        const boundary = params["boundary"];
        if (!boundary) return;
        for (const part of splitMultipart(body, boundary)) {
            const sub = splitHeaderBody(part);
            walkPart(part, sub.headers, depth + 1, out);
        }
        return;
    }

    if (ctype === "message/rfc822") {
        const sub = splitHeaderBody(body);
        walkPart(sub.body, sub.headers, depth + 1, out);
        return;
    }

    const dispositionHeader = headers["content-disposition"] || "";
    const disposition = dispositionHeader.split(";")[0].trim().toLowerCase();
    const dispoParams = resolveExtendedParams(parseParams(
        dispositionHeader.includes(";") ? dispositionHeader.slice(dispositionHeader.indexOf(";") + 1) : "",
    ));
    const cid = (headers["content-id"] || "").replace(/[<>]/g, "").trim();
    const encoding = headers["content-transfer-encoding"] || "";

    const filename = sanitizeFilename(
        dispoParams["filename"] !== undefined ? dispoParams["filename"]
            : params["name"] !== undefined ? params["name"]
                : dispoParams["name"] || "",
    );

    const isTextPart = ctype === "text/plain" || ctype === "text/html";
    let isAttachment = disposition === "attachment";
    if (!isAttachment && disposition === "inline") {
        isAttachment = (!!cid && !isTextPart) || (!!filename && !isTextPart);
    }
    if (!isAttachment && !disposition) {
        isAttachment = !isTextPart; // binary part without disposition — treat as attachment
    }

    if (isAttachment) {
        const content = decodeTransfer(body, encoding);
        out.attachments.push({
            filename: filename || "untitled",
            contentType: ctype,
            size: content.length,
            cid,
            inline: disposition === "inline" && !!cid,
            content,
        });
        return;
    }

    const decoded = decodeText(decodeTransfer(body, encoding), params["charset"]);
    if (ctype === "text/html") {
        out.html += decoded;
    } else {
        out.text += decoded;
    }
}

/**
 * Parse a raw email (Buffer/Uint8Array or utf-8 string) into structured content.
 * Returns null when the input has no discernible header block.
 */
export function parseRawEmail(raw: string | Uint8Array): ParsedEmail | null {
    try {
        const buf = typeof raw === "string" ? Buffer.from(raw, "utf-8") : Buffer.from(raw);
        if (buf.length === 0) return null;

        const top = splitHeaderBody(buf);
        if (!Object.keys(top.headers).length) return null;

        const out: WalkOut = { text: "", html: "", attachments: [] };
        walkPart(buf, top.headers, 0, out);

        const headers = top.headers;
        const from = decodeMimeHeader(headers["from"] || "");
        const to = decodeMimeHeader(headers["to"] || "");
        const subject = decodeMimeHeader(headers["subject"] || "");
        const messageId = (headers["message-id"] || "").trim();
        const source = (headers["x-cfrs-source"] || "").trim() || "maildir";
        const mailboxId = (headers["x-cfrs-mailbox"] || "").trim();

        const dateStr = headers["date"] || "";
        let time = dateStr ? new Date(dateStr).getTime() : Date.now();
        if (!Number.isFinite(time)) time = Date.now();

        let account_id = "";
        const toMatch = to.match(/[\w.-]+@[\w.-]+/);
        if (toMatch) account_id = toMatch[0].split("@")[0];

        if (!out.text && out.html) {
            out.text = out.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }

        return {
            from,
            to,
            subject,
            text: out.text.trim(),
            html: out.html,
            time,
            message_id: messageId,
            source,
            mailbox_id: mailboxId,
            account_id,
            attachments: out.attachments,
        };
    } catch {
        return null;
    }
}

// ---------- composing ----------

export interface ComposeAttachment {
    filename: string;
    contentType?: string;
    content: Buffer;
}

export interface ComposeOptions {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: ComposeAttachment[];
    headers?: Record<string, string>;
    messageId?: string;
    date?: Date;
}

/** RFC 2047 B-encoding for non-ASCII header values, chunked at UTF-8 char boundaries. */
function bEncodeHeader(value: string): string {
    if (!/[^\x20-\x7e]/.test(value)) return value || "";
    const bytes = Buffer.from(value, "utf-8");
    const chunks: string[] = [];
    let start = 0;
    while (start < bytes.length) {
        let end = Math.min(start + 40, bytes.length);
        while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split a code point
        chunks.push(`=?UTF-8?B?${bytes.slice(start, end).toString("base64")}?=`);
        start = end;
    }
    return chunks.join("\r\n ");
}

function base64Wrap(content: Buffer): string {
    const b64 = content.toString("base64");
    return (b64.match(/.{1,76}/g) || []).join("\r\n");
}

function textPartBody(content: string, subtype: string): string {
    return [
        `Content-Type: text/${subtype}; charset=utf-8`,
        "Content-Transfer-Encoding: base64",
        "",
        base64Wrap(Buffer.from(content, "utf-8")),
    ].join("\r\n");
}

function assembleMultipart(boundary: string, parts: string[]): string {
    return parts.map((p) => `--${boundary}\r\n${p}`).join("\r\n") + `\r\n--${boundary}--`;
}

/** Compose a complete RFC 5322 message (CRLF line endings, base64 bodies). */
export function composeRawEmail(opts: ComposeOptions): string {
    const date = opts.date || new Date();
    const messageId = opts.messageId || `<${nanoid(14)}.${date.getTime()}@cfrs.local>`;
    const atts = opts.attachments || [];

    const headerLines: string[] = [];
    headerLines.push(`Date: ${date.toUTCString()}`);
    headerLines.push(`From: ${bEncodeHeader(opts.from)}`);
    headerLines.push(`To: ${bEncodeHeader(opts.to)}`);
    headerLines.push(`Subject: ${bEncodeHeader(opts.subject || "")}`);
    headerLines.push(`Message-ID: ${messageId}`);
    headerLines.push("MIME-Version: 1.0");
    for (const [k, v] of Object.entries(opts.headers || {})) {
        headerLines.push(`${k}: ${v}`);
    }

    let bodyType = "";
    let body: string;

    const hasText = typeof opts.text === "string" && opts.text.length > 0;
    const hasHtml = typeof opts.html === "string" && opts.html.length > 0;

    if (atts.length > 0) {
        let inner: string;
        if (hasText && hasHtml) {
            const altBoundary = "=_cfrs_alt_" + nanoid(12);
            inner = [
                `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
                "",
                assembleMultipart(altBoundary, [textPartBody(opts.text!, "plain"), textPartBody(opts.html!, "html")]),
            ].join("\r\n");
        } else {
            inner = textPartBody(hasHtml ? opts.html! : opts.text || "", hasHtml ? "html" : "plain");
        }
        const mixedBoundary = "=_cfrs_mixed_" + nanoid(12);
        const parts = [inner];
        for (const att of atts) {
            const ct = att.contentType || "application/octet-stream";
            const name = bEncodeHeader(att.filename || "attachment");
            parts.push([
                `Content-Type: ${ct}; name="${name}"`,
                `Content-Disposition: attachment; filename="${name}"`,
                "Content-Transfer-Encoding: base64",
                "",
                base64Wrap(att.content),
            ].join("\r\n"));
        }
        bodyType = `multipart/mixed; boundary="${mixedBoundary}"`;
        body = assembleMultipart(mixedBoundary, parts);
    } else if (hasText && hasHtml) {
        const altBoundary = "=_cfrs_alt_" + nanoid(12);
        bodyType = `multipart/alternative; boundary="${altBoundary}"`;
        body = assembleMultipart(altBoundary, [textPartBody(opts.text!, "plain"), textPartBody(opts.html!, "html")]);
    } else if (hasHtml) {
        bodyType = "text/html; charset=utf-8";
        body = textPartBody(opts.html!, "html");
    } else {
        bodyType = "text/plain; charset=utf-8";
        body = textPartBody(opts.text || "", "plain");
    }

    if (bodyType && !bodyType.startsWith("multipart/")) {
        headerLines.push(`Content-Type: ${bodyType}`);
        headerLines.push("Content-Transfer-Encoding: base64");
        return headerLines.join("\r\n") + "\r\n\r\n" + body + "\r\n";
    }
    if (bodyType) {
        headerLines.push(`Content-Type: ${bodyType}`);
        return headerLines.join("\r\n") + "\r\n\r\n" + body + "\r\n";
    }
    return headerLines.join("\r\n") + "\r\n\r\n" + body + "\r\n";
}

/** Prepend extra headers to a raw email (used to stamp source metadata on fetched mail). */
export function stampHeaders(raw: string, extra: Record<string, string>): string {
    const lines = Object.entries(extra).map(([k, v]) => `${k}: ${v}`);
    return lines.join("\r\n") + "\r\n" + raw;
}

/** Buffer-level variant — binary bodies (8bit attachments) never round-trip through strings. */
export function stampHeadersBuffer(raw: Uint8Array, extra: Record<string, string>): Buffer {
    const head = Object.entries(extra).map(([k, v]) => `${k}: ${v}\r\n`).join("");
    return Buffer.concat([Buffer.from(head, "utf-8"), raw]);
}
