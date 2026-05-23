import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { AccountEntity } from "./account.entity";

export type AccountDTO = Pick<AccountEntity, "name" | "email" | "is_admin"> & { id?: string };

export class AccountCreateBody {
    public name: string;
    public email: string;
    public password: string;
    public is_admin?: number;

    constructor(origin: any) {
        if (!origin.name || !origin.email || !origin.password) {
            throw new Error("Name, email and password are required");
        }
        this.name = origin.name;
        this.email = origin.email;
        this.password = origin.password;
        this.is_admin = origin.is_admin || 0;
    }

    static self(unsafe: AccountCreateBody) {
        return new AccountCreateBody(unsafe);
    }
}

export class AccountUpdateBody {
    public name?: string;
    public email?: string;
    public password?: string;
    public is_admin?: number;

    constructor(origin: any) {
        this.name = origin.name;
        this.email = origin.email;
        this.password = origin.password;
        this.is_admin = origin.is_admin;
    }

    static self(unsafe: AccountUpdateBody) {
        return new AccountUpdateBody(unsafe);
    }
}

// List
export class AccountListRequest implements BaseRequest {
    public auth?: string;
    public limit?: number;
    public offset?: number;

    constructor(origin: Partial<AccountListRequest>) {
        origin.auth && (this.auth = origin.auth);
        this.limit = origin.limit;
        this.offset = origin.offset;
    }
    static self(unsafe: AccountListRequest) {
        return new AccountListRequest(unsafe);
    }
}

export class AccountListResponse implements BaseResponse<AccountDTO[]> {
    public success: boolean;
    public message: string;
    public data?: { list: AccountDTO[]; total: number };

    constructor(origin: AccountListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Create
export class AccountCreateRequest implements BaseRequest {
    public auth?: string;
    public account: AccountCreateBody;

    constructor(origin: Partial<AccountCreateRequest>) {
        if (!origin.account) throw new Error("Account data is required");
        origin.auth && (this.auth = origin.auth);
        this.account = AccountCreateBody.self(origin.account);
    }
    static self(unsafe: AccountCreateRequest) {
        return new AccountCreateRequest(unsafe);
    }
}

export class AccountCreateResponse implements BaseResponse<AccountDTO> {
    public success: boolean;
    public message: string;

    constructor(origin: AccountCreateResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Update
export class AccountUpdateRequest implements BaseRequest {
    public auth?: string;
    public id: string;
    public account: AccountUpdateBody;

    constructor(origin: Partial<AccountUpdateRequest>) {
        if (!origin.id) throw new Error("Account id is required");
        if (!origin.account) throw new Error("Account data is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
        this.account = AccountUpdateBody.self(origin.account);
    }
    static self(unsafe: AccountUpdateRequest) {
        return new AccountUpdateRequest(unsafe);
    }
}

export class AccountUpdateResponse implements BaseResponse<AccountDTO> {
    public success: boolean;
    public message: string;

    constructor(origin: AccountUpdateResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Delete
export class AccountDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<AccountDeleteRequest>) {
        if (!origin.id) throw new Error("Account id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: AccountDeleteRequest) {
        return new AccountDeleteRequest(unsafe);
    }
}

export class AccountDeleteResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: AccountDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}
