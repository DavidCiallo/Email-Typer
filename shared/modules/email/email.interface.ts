import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { EmailEntity } from "./email.entity";

export type EmailDTO = Pick<EmailEntity, "id" | "eid" | "from" | "to" | "subject" | "text" | "time" | "account_id" | "blocked" | "blocked_by" | "block_rule" | "message_id" | "source" | "mailbox_id"> & {
    has_attachments: boolean;
    attachment_count: number;
};

// Query email list
export class EmailListRequest implements BaseRequest {
    public auth?: string;
    public limit?: number;
    public offset?: number;
    public account_id?: string;
    public q?: string;
    public archived?: boolean;
    public blocked?: boolean;
    public source?: string;
    public mailbox_id?: string;

    constructor(origin: Partial<EmailListRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.limit = origin.limit;
        this.offset = origin.offset;
        this.account_id = origin.account_id;
        this.q = origin.q;
        this.archived = origin.archived;
        this.blocked = origin.blocked;
        this.source = origin.source;
        this.mailbox_id = origin.mailbox_id;
    }
    static self(unsafe: EmailListRequest) {
        return new EmailListRequest(unsafe);
    }
}

export class EmailListResponse implements BaseResponse<EmailDTO[]> {
    public success: boolean;
    public message: string;
    public data?: { list: EmailDTO[]; total: number; accounts?: string[] };

    constructor(origin: EmailListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Get email detail
export class EmailDetailRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<EmailDetailRequest>) {
        if (!origin.id) throw new Error("Email id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: EmailDetailRequest) {
        return new EmailDetailRequest(unsafe);
    }
}

export class EmailDetailResponse implements BaseResponse<EmailEntity> {
    public success: boolean;
    public message: string;
    public data?: EmailEntity;

    constructor(origin: EmailDetailResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Send email
export class EmailSendBody {
    public from: string;
    public to: string;
    public subject: string;
    public html: string;
    public text?: string;

    constructor(origin: any) {
        if (!origin.from || !origin.to || !origin.subject || !origin.html) {
            throw new Error("From, to, subject and html are required");
        }
        this.from = origin.from;
        this.to = origin.to;
        this.subject = origin.subject;
        this.html = origin.html;
        this.text = origin.text || "";
    }

    static self(unsafe: EmailSendBody) {
        return new EmailSendBody(unsafe);
    }
}

export class EmailSendRequest implements BaseRequest {
    public auth?: string;
    public email: EmailSendBody;

    constructor(origin: Partial<EmailSendRequest>) {
        if (!origin.email) throw new Error("Email data is required");
        origin.auth && (this.auth = origin.auth);
        this.email = EmailSendBody.self(origin.email);
    }
    static self(unsafe: EmailSendRequest) {
        return new EmailSendRequest(unsafe);
    }
}

export class EmailSendResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: EmailSendResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Receive email (external)
export class EmailReceiveRequest implements BaseRequest {
    public auth?: string;
    public raw: string;

    constructor(origin: Partial<EmailReceiveRequest>) {
        if (!origin.raw) throw new Error("Raw email content is required");
        origin.auth && (this.auth = origin.auth);
        this.raw = origin.raw;
    }
    static self(unsafe: EmailReceiveRequest) {
        return new EmailReceiveRequest(unsafe);
    }
}

export class EmailReceiveResponse implements BaseResponse<{ id: string }> {
    public success: boolean;
    public message: string;
    public data?: { id: string };

    constructor(origin: EmailReceiveResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Scan maildir for new emails
export class EmailScanRequest implements BaseRequest {
    public auth?: string;
    public path?: string;

    constructor(origin: Partial<EmailScanRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.path = origin.path;
    }
    static self(unsafe: EmailScanRequest) {
        return new EmailScanRequest(unsafe);
    }
}

export class EmailScanResponse implements BaseResponse<{ scanned: number; imported: number }> {
    public success: boolean;
    public message: string;
    public data?: { scanned: number; imported: number };

    constructor(origin: EmailScanResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Delete email
export class EmailDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<EmailDeleteRequest>) {
        if (!origin.id) throw new Error("Email id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: EmailDeleteRequest) {
        return new EmailDeleteRequest(unsafe);
    }
}

export class EmailDeleteResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: EmailDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Restore email
export class EmailRestoreRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<EmailRestoreRequest>) {
        if (!origin.id) throw new Error("Email id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: EmailRestoreRequest) {
        return new EmailRestoreRequest(unsafe);
    }
}

export class EmailRestoreResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: EmailRestoreResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Push structured email via API (auth: per-mailbox api_key or the receive master key)
export interface EmailPushAttachment {
    filename: string;
    contentType?: string;
    base64?: string;
}

export class EmailPushRequest implements BaseRequest {
    public auth?: string;
    public to?: string;          // required when authenticating with the master key
    public from?: string;
    public subject?: string;
    public html?: string;
    public text?: string;
    public attachments?: EmailPushAttachment[];
    public message_id?: string;
    // Raw MIME passthrough — for bridge scripts that already hold a full
    // RFC 822 message. Either a complete message/rfc822 request body
    // (Content-Type: message/rfc822) or one of these fields.
    public raw?: string;
    public raw_base64?: string;

    constructor(origin: Partial<EmailPushRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.to = origin.to;
        this.from = origin.from;
        this.subject = origin.subject;
        this.html = origin.html;
        this.text = origin.text;
        this.attachments = origin.attachments;
        this.message_id = origin.message_id;
        this.raw = origin.raw;
        this.raw_base64 = origin.raw_base64;
    }
    static self(unsafe: any) {
        return new EmailPushRequest(unsafe);
    }
}

export interface EmailPushAttachmentResult {
    stored: number;
    skipped: number;
    skipped_files: string[];
}

export class EmailPushResponse implements BaseResponse<{ id: string; message_id: string; duplicate: boolean; attachments: EmailPushAttachmentResult }> {
    public success: boolean;
    public message: string;
    public data?: { id: string; message_id: string; duplicate: boolean; attachments: EmailPushAttachmentResult };

    constructor(origin: EmailPushResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Download one attachment of an email (responds with the raw file)
export class EmailAttachmentRequest implements BaseRequest {
    public auth?: string;
    public id: string;
    public index: number;

    constructor(origin: Partial<EmailAttachmentRequest>) {
        if (!origin.id) throw new Error("Email id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
        this.index = Number(origin.index) || 0;
    }
    static self(unsafe: any) {
        return new EmailAttachmentRequest(unsafe);
    }
}

export class EmailAttachmentResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: EmailAttachmentResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}
