import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { ThirdpartyEntity } from "./thirdparty.entity";

export type ThirdpartyDTO = Pick<ThirdpartyEntity, "email" | "password" | "login_site" | "link_email" | "remark"> & { id?: string };

// List
export class ThirdpartyListRequest implements BaseRequest {
    public auth?: string;
    public limit?: number;
    public offset?: number;

    constructor(origin: Partial<ThirdpartyListRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.limit = origin.limit;
        this.offset = origin.offset;
    }
    static self(unsafe: ThirdpartyListRequest) {
        return new ThirdpartyListRequest(unsafe);
    }
}

export class ThirdpartyListResponse implements BaseResponse<ThirdpartyDTO[]> {
    public success: boolean;
    public message: string;
    public data?: { list: ThirdpartyDTO[]; total: number };

    constructor(origin: ThirdpartyListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Create / Update body
export class ThirdpartySaveBody {
    public email: string;
    public password: string;
    public login_site?: string;
    public link_email?: string;
    public remark?: string;

    constructor(origin: any) {
        if (!origin.email || !origin.password) {
            throw new Error("Email and password are required");
        }
        this.email = origin.email;
        this.password = origin.password;
        this.login_site = origin.login_site || "";
        this.link_email = origin.link_email || "";
        this.remark = origin.remark || "";
    }
    static self(unsafe: ThirdpartySaveBody) {
        return new ThirdpartySaveBody(unsafe);
    }
}

// Save (create/update)
export class ThirdpartySaveRequest implements BaseRequest {
    public auth?: string;
    public id?: string;
    public thirdparty: ThirdpartySaveBody;

    constructor(origin: Partial<ThirdpartySaveRequest>) {
        if (!origin.thirdparty) throw new Error("Thirdparty data is required");
        origin.auth && (this.auth = origin.auth);
        origin.id && (this.id = origin.id);
        this.thirdparty = ThirdpartySaveBody.self(origin.thirdparty);
    }
    static self(unsafe: ThirdpartySaveRequest) {
        return new ThirdpartySaveRequest(unsafe);
    }
}

export class ThirdpartySaveResponse implements BaseResponse<ThirdpartyDTO> {
    public success: boolean;
    public message: string;

    constructor(origin: ThirdpartySaveResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Delete
export class ThirdpartyDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<ThirdpartyDeleteRequest>) {
        if (!origin.id) throw new Error("Thirdparty id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: ThirdpartyDeleteRequest) {
        return new ThirdpartyDeleteRequest(unsafe);
    }
}

export class ThirdpartyDeleteResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: ThirdpartyDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}
