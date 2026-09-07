import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { MailboxEntity } from "./mailbox.entity";
import { MailboxGrantEntity } from "./mailbox-grant.entity";

export type MailboxDTO = Pick<
    MailboxEntity,
    | "id" | "name" | "type" | "address" | "domain" | "local_part"
    | "provider" | "imap_host" | "imap_port" | "imap_tls" | "sync_interval"
    | "status" | "forward_enabled" | "sync_error" | "last_sync_time" | "note"
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
    public forward_enabled: number; // api/imap only: 1 = imported mail also matches forward strategies

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
        this.forward_enabled = origin.forward_enabled ? 1 : 0;
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

// ---- temporary mailbox access grants (tauth) ----

export class MailboxGrantGetRequest implements BaseRequest {
    public auth?: string;
    public mailbox_id: string;

    constructor(origin: Partial<MailboxGrantGetRequest>) {
        if (!origin.mailbox_id) throw new Error("mailbox_id is required");
        origin.auth && (this.auth = origin.auth);
        this.mailbox_id = origin.mailbox_id;
    }
    static self(unsafe: MailboxGrantGetRequest) {
        return new MailboxGrantGetRequest(unsafe);
    }
}

export class MailboxGrantGetResponse implements BaseResponse<{ grant: MailboxGrantEntity | null }> {
    public success: boolean;
    public message: string;
    public data?: { grant: MailboxGrantEntity | null };

    constructor(origin: MailboxGrantGetResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class MailboxGrantSaveRequest implements BaseRequest {
    public auth?: string;
    public mailbox_id: string;
    /** validity in days, counted from creation moment */
    public days: number;
    public note?: string;

    constructor(origin: Partial<MailboxGrantSaveRequest>) {
        if (!origin.mailbox_id) throw new Error("mailbox_id is required");
        origin.auth && (this.auth = origin.auth);
        this.mailbox_id = origin.mailbox_id;
        this.days = Number(origin.days) || 7;
        this.note = origin.note || "";
    }
    static self(unsafe: MailboxGrantSaveRequest) {
        return new MailboxGrantSaveRequest(unsafe);
    }
}

export class MailboxGrantSaveResponse implements BaseResponse<{ token: string; grant: MailboxGrantEntity }> {
    public success: boolean;
    public message: string;
    public data?: { token: string; grant: MailboxGrantEntity };

    constructor(origin: MailboxGrantSaveResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class MailboxGrantRevokeRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<MailboxGrantRevokeRequest>) {
        if (!origin.id) throw new Error("id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: MailboxGrantRevokeRequest) {
        return new MailboxGrantRevokeRequest(unsafe);
    }
}

export class MailboxGrantRevokeResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: MailboxGrantRevokeResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

export class MailboxTauthInfoRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<MailboxTauthInfoRequest>) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: MailboxTauthInfoRequest) {
        return new MailboxTauthInfoRequest(unsafe);
    }
}

export class MailboxTauthInfoResponse implements BaseResponse<{ address: string; start_time: number; end_time: number }> {
    public success: boolean;
    public message: string;
    public data?: { address: string; start_time: number; end_time: number };

    constructor(origin: MailboxTauthInfoResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class MailboxGrantListRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<MailboxGrantListRequest>) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: MailboxGrantListRequest) {
        return new MailboxGrantListRequest(unsafe);
    }
}

export class MailboxGrantListResponse implements BaseResponse<{ list: MailboxGrantEntity[] }> {
    public success: boolean;
    public message: string;
    public data?: { list: MailboxGrantEntity[] };

    constructor(origin: MailboxGrantListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}
