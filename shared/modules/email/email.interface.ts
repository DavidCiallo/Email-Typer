import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { EmailEntity } from "./email.entity";

export type EmailDTO = Pick<EmailEntity, "id" | "eid" | "from" | "to" | "subject" | "text" | "time" | "account_id">;

// Query email list
export class EmailListRequest implements BaseRequest {
    public auth?: string;
    public limit?: number;
    public offset?: number;
    public account_id?: string;

    constructor(origin: Partial<EmailListRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.limit = origin.limit;
        this.offset = origin.offset;
        this.account_id = origin.account_id;
    }
    static self(unsafe: EmailListRequest) {
        return new EmailListRequest(unsafe);
    }
}

export class EmailListResponse implements BaseResponse<EmailDTO[]> {
    public success: boolean;
    public message: string;
    public data?: { list: EmailDTO[]; total: number };

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
    public to: string;
    public subject: string;
    public html: string;
    public text?: string;

    constructor(origin: any) {
        if (!origin.to || !origin.subject || !origin.html) {
            throw new Error("To, subject and html are required");
        }
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
