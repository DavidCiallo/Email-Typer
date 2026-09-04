import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { MailboxEntity } from "./mailbox.entity";

export type MailboxDTO = Pick<
    MailboxEntity,
    | "id" | "name" | "type" | "address" | "domain" | "local_part"
    | "provider" | "imap_host" | "imap_port" | "imap_tls" | "sync_interval"
    | "api_key" | "status" | "sync_error" | "last_sync_time" | "note"
> & {
    has_credential: boolean;
};

// List
export class MailboxListRequest implements BaseRequest {
    public auth?: string;
    public type?: string;

    constructor(origin: Partial<MailboxListRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.type = origin.type;
    }
    static self(unsafe: MailboxListRequest) {
        return new MailboxListRequest(unsafe);
    }
}

export class MailboxListResponse implements BaseResponse<{ list: MailboxDTO[]; domains: string[] }> {
    public success: boolean;
    public message: string;
    public data?: { list: MailboxDTO[]; domains: string[] };

    constructor(origin: MailboxListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Save (create or update). `password` is the write-only IMAP auth code;
// an empty/missing password on update keeps the stored credential.
export class MailboxSaveBody {
    public name: string;
    public type: string;
    public address: string;
    public provider: string;
    public imap_host: string;
    public imap_port: number;
    public imap_tls: number;
    public sync_interval: number;
    public password: string;   // plaintext auth code, write-only
    public note: string;

    constructor(origin: any) {
        if (!origin.type) throw new Error("Mailbox type is required");
        if (!["catchall", "api", "imap"].includes(origin.type)) throw new Error("Unknown mailbox type");
        if (!origin.address || !/^[^\s@]+@[^\s@]+$/.test(origin.address)) throw new Error("Valid address is required");
        this.name = origin.name || "";
        this.type = origin.type;
        this.address = origin.address.trim().toLowerCase();
        this.provider = origin.provider || "";
        this.imap_host = origin.imap_host || "";
        this.imap_port = Number(origin.imap_port) || 993;
        this.imap_tls = origin.imap_tls === 0 || origin.imap_tls === false ? 0 : 1;
        this.sync_interval = Number(origin.sync_interval) || 0;
        this.password = origin.password || "";
        this.note = origin.note || "";
    }
    static self(unsafe: any) {
        return new MailboxSaveBody(unsafe);
    }
}

export class MailboxSaveRequest implements BaseRequest {
    public auth?: string;
    public id?: string;
    public mailbox: MailboxSaveBody;

    constructor(origin: Partial<MailboxSaveRequest>) {
        if (!origin.mailbox) throw new Error("Mailbox data is required");
        origin.auth && (this.auth = origin.auth);
        origin.id && (this.id = origin.id);
        this.mailbox = MailboxSaveBody.self(origin.mailbox);
    }
    static self(unsafe: any) {
        return new MailboxSaveRequest(unsafe);
    }
}

export class MailboxSaveResponse implements BaseResponse<MailboxDTO> {
    public success: boolean;
    public message: string;
    public data?: MailboxDTO;

    constructor(origin: MailboxSaveResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Delete
export class MailboxDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<MailboxDeleteRequest>) {
        if (!origin.id) throw new Error("Mailbox id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: any) {
        return new MailboxDeleteRequest(unsafe);
    }
}

export class MailboxDeleteResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: MailboxDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Addresses: declared mailboxes ∪ addresses derived from received traffic
export class MailboxAddressesRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<MailboxAddressesRequest>) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: any) {
        return new MailboxAddressesRequest(unsafe);
    }
}

export interface DerivedAddress {
    address: string;
    count: number;
    last_time: number;
}

export class MailboxAddressesResponse implements BaseResponse<{ declared: MailboxDTO[]; derived: DerivedAddress[] }> {
    public success: boolean;
    public message: string;
    public data?: { declared: MailboxDTO[]; derived: DerivedAddress[] };

    constructor(origin: MailboxAddressesResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Regenerate the push API key
export class MailboxRegenerateKeyRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<MailboxRegenerateKeyRequest>) {
        if (!origin.id) throw new Error("Mailbox id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: any) {
        return new MailboxRegenerateKeyRequest(unsafe);
    }
}

export class MailboxRegenerateKeyResponse implements BaseResponse<{ api_key: string }> {
    public success: boolean;
    public message: string;
    public data?: { api_key: string };

    constructor(origin: MailboxRegenerateKeyResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Trigger an IMAP sync now
export class MailboxSyncRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<MailboxSyncRequest>) {
        if (!origin.id) throw new Error("Mailbox id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: any) {
        return new MailboxSyncRequest(unsafe);
    }
}

export class MailboxSyncResponse implements BaseResponse<{ imported: number; scanned: number }> {
    public success: boolean;
    public message: string;
    public data?: { imported: number; scanned: number };

    constructor(origin: MailboxSyncResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Test an IMAP connection (uses stored credential when id is given,
// otherwise the supplied fields — lets the UI verify before saving)
export class MailboxTestRequest implements BaseRequest {
    public auth?: string;
    public id?: string;
    public provider?: string;
    public imap_host?: string;
    public imap_port?: number;
    public imap_tls?: number;
    public address?: string;
    public password?: string;

    constructor(origin: Partial<MailboxTestRequest>) {
        origin.auth && (this.auth = origin.auth);
        origin.id && (this.id = origin.id);
        this.provider = origin.provider;
        this.imap_host = origin.imap_host;
        this.imap_port = origin.imap_port;
        this.imap_tls = origin.imap_tls;
        this.address = origin.address;
        this.password = origin.password;
    }
    static self(unsafe: any) {
        return new MailboxTestRequest(unsafe);
    }
}

export class MailboxTestResponse implements BaseResponse<{ ok: boolean; message: string }> {
    public success: boolean;
    public message: string;
    public data?: { ok: boolean; message: string };

    constructor(origin: MailboxTestResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// IMAP provider presets (for the create/edit form)
export class MailboxProvidersRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<MailboxProvidersRequest>) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: any) {
        return new MailboxProvidersRequest(unsafe);
    }
}

export interface ProviderPresetDTO {
    key: string;
    label: string;
    host: string;
    port: number;
    tls: boolean;
    authHint: string;
}

export class MailboxProvidersResponse implements BaseResponse<{ presets: ProviderPresetDTO[] }> {
    public success: boolean;
    public message: string;
    public data?: { presets: ProviderPresetDTO[] };

    constructor(origin: MailboxProvidersResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}
