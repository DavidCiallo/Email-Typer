import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { SecurityEventEntity, SecurityReviewItem } from "./security.entity";

// 安全事件列表
export class SecurityEventsRequest implements BaseRequest {
    public auth?: string;
    public kind?: string;
    public severity?: string;
    public limit?: number;
    public offset?: number;

    constructor(origin: Partial<SecurityEventsRequest> = {}) {
        origin.auth && (this.auth = origin.auth);
        this.kind = origin.kind;
        this.severity = origin.severity;
        this.limit = origin.limit;
        this.offset = origin.offset;
    }
    static self(unsafe: SecurityEventsRequest = {}) {
        return new SecurityEventsRequest(unsafe);
    }
}

export class SecurityEventsResponse implements BaseResponse<SecurityEventEntity[]> {
    public success: boolean;
    public message: string;
    public data?: { list: SecurityEventEntity[]; total: number };

    constructor(origin: SecurityEventsResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// 锁状态 + 触发详情 + 待审查策略
export class SecurityLockStatusRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<SecurityLockStatusRequest> = {}) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: SecurityLockStatusRequest = {}) {
        return new SecurityLockStatusRequest(unsafe);
    }
}

export class SecurityLockStatusResponse implements BaseResponse<Record<string, any>> {
    public success: boolean;
    public message: string;
    public data?: {
        locked: boolean;
        is_admin: number;
        warn_at: number;
        lock_at: number;
        event?: Record<string, any>;
        reviews?: SecurityReviewItem[];
        fingerprint?: string;
    };

    constructor(origin: SecurityLockStatusResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// 人工解锁（勾选确认 + 管理员密码）
export class SecurityUnlockRequest implements BaseRequest {
    public auth?: string;
    public password: string;
    public confirmed: boolean;
    public trust_ruleset?: boolean;

    constructor(origin: Partial<SecurityUnlockRequest>) {
        if (!origin.password) throw new Error("password is required");
        origin.auth && (this.auth = origin.auth);
        this.password = origin.password;
        this.confirmed = !!origin.confirmed;
        this.trust_ruleset = origin.trust_ruleset;
    }
    static self(unsafe: SecurityUnlockRequest) {
        return new SecurityUnlockRequest(unsafe);
    }
}

export class SecurityUnlockResponse implements BaseResponse<Record<string, any>> {
    public success: boolean;
    public message: string;

    constructor(origin: SecurityUnlockResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}
