import tls from "tls";
import net from "net";

/**
 * Minimal IMAP4rev1 client — just enough for auth-code mailbox sync:
 * LOGIN → SELECT INBOX → UID SEARCH → UID FETCH (BODY.PEEK[]).
 *
 * One command in flight at a time. Literal responses ({n}) are consumed
 * byte-exactly so binary message bodies survive; fetched mail is returned
 * as the raw Buffer it arrived as.
 */

interface CommandResult {
    status: string;
    text: string;
    lines: string[];
    literals: Uint8Array[];
}

interface PendingCommand {
    tag: string;
    lines: string[];
    literals: Uint8Array[];
    resolve: (r: CommandResult) => void;
    reject: (e: Error) => void;
}

export interface ImapConnectOptions {
    host: string;
    port: number;
    tls: boolean;
    timeoutMs?: number;
}

function quoteImapString(value: string): string {
    return `"${String(value).replace(/([\\"])/g, "\\$1")}"`;
}

export class ImapClient {
    private socket: net.Socket | tls.TLSSocket;
    private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    private literalRemaining = 0;
    private pending: PendingCommand | null = null;
    private tagCounter = 0;
    private closed = false;
    private timeoutMs: number;

    private constructor(socket: net.Socket | tls.TLSSocket, timeoutMs: number) {
        this.socket = socket;
        this.timeoutMs = timeoutMs;
        socket.on("data", (chunk: Buffer) => {
            this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
            this.processBuffer();
        });
        socket.on("error", (err: Error) => {
            this.failPending(new Error(`IMAP 连接错误: ${err.message}`));
        });
        socket.on("close", () => {
            this.closed = true;
            this.failPending(new Error("IMAP 连接已关闭"));
        });
        socket.setTimeout(timeoutMs, () => {
            socket.destroy();
            this.failPending(new Error("IMAP 响应超时"));
        });
    }

    static connect(opts: ImapConnectOptions): Promise<ImapClient> {
        const timeoutMs = opts.timeoutMs ?? 30000;
        return new Promise((resolve, reject) => {
            const onSetup = () => {
                socket.setTimeout(0);
                resolve(new ImapClient(socket, timeoutMs));
            };
            const onError = (err: Error) => {
                socket.destroy();
                reject(new Error(`IMAP 连接失败 (${opts.host}:${opts.port}): ${err.message}`));
            };
            const socket: net.Socket | tls.TLSSocket = opts.tls
                ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host, rejectUnauthorized: false })
                : net.connect({ host: opts.host, port: opts.port });
            socket.once(opts.tls ? "secureConnect" : "connect", onSetup);
            socket.once("error", onError);
            socket.setTimeout(timeoutMs, () => {
                socket.destroy();
                onError(new Error("连接超时"));
            });
        });
    }

    private failPending(err: Error) {
        const p = this.pending;
        if (p) {
            this.pending = null;
            p.reject(err);
        }
    }

    private processBuffer(): void {
        while (true) {
            if (this.literalRemaining > 0) {
                if (this.buffer.length < this.literalRemaining + 2) return; // literal + CRLF not complete yet
                this.pending?.literals.push(this.buffer.subarray(0, this.literalRemaining));
                this.buffer = this.buffer.slice(this.literalRemaining + 2);
                this.literalRemaining = 0;
                continue;
            }
            const idx = this.buffer.indexOf("\r\n");
            if (idx === -1) {
                // tolerate bare-LF servers
                const lf = this.buffer.indexOf("\n");
                if (lf === -1) return;
                const line = this.buffer.slice(0, lf).toString("utf-8");
                this.buffer = this.buffer.slice(lf + 1);
                this.handleLine(line);
                continue;
            }
            const line = this.buffer.slice(0, idx).toString("utf-8");
            this.buffer = this.buffer.slice(idx + 2);
            this.handleLine(line);
        }
    }

    private handleLine(line: string): void {
        const m = line.match(/\{(\d+)\}$/);
        if (m && this.pending) {
            this.pending.lines.push(line);
            this.literalRemaining = parseInt(m[1], 10);
            return;
        }
        if (!this.pending) return; // greeting / untagged between commands — ignore
        this.pending.lines.push(line);
        if (line.startsWith(this.pending.tag + " ")) {
            const rest = line.slice(this.pending.tag.length + 1);
            const status = rest.split(" ")[0].toUpperCase();
            const p = this.pending;
            this.pending = null;
            if (status === "OK") {
                p.resolve({ status, text: rest, lines: p.lines, literals: p.literals });
            } else {
                p.reject(new Error(rest || "IMAP command failed"));
            }
        }
    }

    private run(command: string): Promise<CommandResult> {
        return new Promise((resolve, reject) => {
            if (this.closed) return reject(new Error("IMAP 连接已关闭"));
            if (this.pending) return reject(new Error("IMAP client is busy"));
            const tag = `A${++this.tagCounter}`;
            this.pending = { tag, lines: [], literals: [], resolve, reject };
            this.socket.setTimeout(this.timeoutMs);
            this.socket.write(`${tag} ${command}\r\n`);
        });
    }

    async login(user: string, password: string): Promise<void> {
        await this.run(`LOGIN ${quoteImapString(user)} ${quoteImapString(password)}`);
    }

    async selectInbox(): Promise<{ uidvalidity: number; exists: number }> {
        const res = await this.run("SELECT INBOX");
        let uidvalidity = 0;
        let exists = 0;
        for (const line of res.lines) {
            const uv = line.match(/\[UIDVALIDITY (\d+)\]/i);
            if (uv) uidvalidity = parseInt(uv[1], 10);
            const ex = line.match(/^\* (\d+) EXISTS/i);
            if (ex) exists = parseInt(ex[1], 10);
        }
        return { uidvalidity, exists };
    }

    /** All UIDs when sinceUid is omitted; otherwise UIDs >= sinceUid+1 (server-side quirk filtered by caller). */
    async uidSearch(sinceUid?: number): Promise<number[]> {
        const res = await this.run(sinceUid ? `UID SEARCH UID ${sinceUid + 1}:*` : "UID SEARCH ALL");
        for (const line of res.lines) {
            const m = line.match(/^\* SEARCH (.*)$/i);
            if (m) {
                return m[1].trim().split(/\s+/).filter(Boolean).map(Number).filter(n => Number.isFinite(n));
            }
        }
        return [];
    }

    async uidFetch(uid: number): Promise<{ raw: Uint8Array; internalDate: string }> {
        const res = await this.run(`UID FETCH ${uid} (BODY.PEEK[] INTERNALDATE)`);
        const raw = res.literals[0];
        if (!raw || raw.length === 0) throw new Error(`FETCH UID ${uid} 未返回邮件内容`);
        let internalDate = "";
        for (const line of res.lines) {
            const m = line.match(/INTERNALDATE "([^"]*)"/i);
            if (m) {
                internalDate = m[1];
                break;
            }
        }
        return { raw, internalDate };
    }

    async logout(): Promise<void> {
        try {
            await this.run("LOGOUT");
        } catch {
            /* best effort */
        }
        this.close();
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        try {
            this.socket.destroy();
        } catch {
            /* ignore */
        }
        this.failPending(new Error("IMAP 连接已关闭"));
    }
}
