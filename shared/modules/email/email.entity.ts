import { BaseEntity } from "../../lib/default/base.entity";

/** Metadata for one extracted attachment (binary stored under DATA_DIR/attachments/<eid>/). */
export interface AttachmentMeta {
    filename: string;
    contentType: string;
    size: number;
    cid: string;       // content-id when referenced from HTML as <img src="cid:...">
    inline: boolean;   // inline part (usually an embedded image)
    path: string;      // file name inside the attachment folder; "" when skipped
    skipped: boolean;  // true when the file exceeded the size limit and was not stored
}

/** Where the mail came from: Postfix maildir, HTTP raw receive, push API, or IMAP sync. */
export type EmailSource = "maildir" | "receive" | "api" | "imap";

export interface EmailEntity extends BaseEntity {
    eid: string;           // email unique id from the mail system
    from: string;          // sender address
    to: string;            // recipient address
    subject: string;       // email subject
    html: string;          // html content — empty on stored rows; hydrated on demand from the eml archive
    text: string;          // plain text content — same as html
    time: number;          // email sent time (timestamp)
    account_id: string;    // associated account id (recipient localpart)
    message_id: string;    // RFC 5322 Message-ID (dedup key when present)
    source: string;        // "maildir" | "receive" | "api" | "imap"
    mailbox_id: string;    // owning MailboxEntity id ("" for legacy rows)
    eml?: string;          // archived RFC822 file, relative to the maildir root — bodies live here, not in the index
    codes?: string[];      // verification codes extracted from the body at ingest (list rows show these)
    has_code?: number;     // 1 = body contained verification codes (content filter)
    has_links?: number;    // 1 = body contained http(s) links (content filter)
    attachments: AttachmentMeta[] | null;
    blocked?: number;      // 1 = intercepted by safety rules (stored but not forwarded)
    blocked_by?: string;   // rule type that caught it: "blacklist" | "sensitive_word" | ""
    block_rule?: string;   // matched rule value
}
