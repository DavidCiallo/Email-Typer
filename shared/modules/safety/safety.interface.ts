import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { SafetyEntity } from "./safety.entity";

export type SafetyDTO = Pick<SafetyEntity, "id" | "type" | "value" | "note">;

// List
export class SafetyListRequest implements BaseRequest {
    public auth?: string;
    public type?: string;

    constructor(origin: Partial<SafetyListRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.type = origin.type;
    }
    static self(unsafe: SafetyListRequest) {
        return new SafetyListRequest(unsafe);
    }
}

export class SafetyListResponse implements BaseResponse<SafetyDTO[]> {
    public success: boolean;
    public message: string;
    public data?: { list: SafetyDTO[] };

    constructor(origin: SafetyListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Save (create or update)
export class SafetySaveRequest implements BaseRequest {
    public auth?: string;
    public entry: Partial<SafetyDTO> & { id?: string };

    constructor(origin: Partial<SafetySaveRequest>) {
        if (!origin.entry) throw new Error("Safety entry is required");
        origin.auth && (this.auth = origin.auth);
        this.entry = origin.entry;
    }
    static self(unsafe: SafetySaveRequest) {
        return new SafetySaveRequest(unsafe);
    }
}

export class SafetySaveResponse implements BaseResponse<SafetyDTO> {
    public success: boolean;
    public message: string;

    constructor(origin: SafetySaveResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Delete
export class SafetyDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<SafetyDeleteRequest>) {
        if (!origin.id) throw new Error("Safety id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: SafetyDeleteRequest) {
        return new SafetyDeleteRequest(unsafe);
    }
}

export class SafetyDeleteResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: SafetyDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}
