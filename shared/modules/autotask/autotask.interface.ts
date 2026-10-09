import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { AutoTaskEntity } from "./autotask.entity";

export class AutoTaskListRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<AutoTaskListRequest>) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: any) {
        return new AutoTaskListRequest(unsafe);
    }
}

export type AutoTaskDTO = Omit<AutoTaskEntity, "id" | "delete_time"> & {
    id: string;
    next_run_at: number | null;
};

export class AutoTaskListResponse implements BaseResponse<{ list: AutoTaskDTO[] }> {
    public success: boolean;
    public message: string;
    public data?: { list: AutoTaskDTO[] };

    constructor(origin: AutoTaskListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class AutoTaskSaveRequest implements BaseRequest {
    public auth?: string;
    public id?: string;
    public name: string;
    public enabled: boolean;
    public kind: string;
    public time_of_day: string;
    public weekdays: string[];
    public month_day: number;
    public time_zone: string;
    public action: string;
    public params: Record<string, any>;

    constructor(origin: Partial<AutoTaskSaveRequest>) {
        if (!origin.name || !origin.name.trim()) throw new Error("name is required");
        origin.auth && (this.auth = origin.auth);
        origin.id && (this.id = origin.id);
        this.name = origin.name.trim();
        this.enabled = origin.enabled !== false;
        this.kind = origin.kind || "daily";
        this.time_of_day = origin.time_of_day || "08:00";
        this.weekdays = origin.weekdays || [];
        this.month_day = origin.month_day || 1;
        this.time_zone = origin.time_zone || "Asia/Shanghai";
        this.action = origin.action || "archive";
        this.params = origin.params || {};
    }
    static self(unsafe: any) {
        return new AutoTaskSaveRequest(unsafe);
    }
}

export class AutoTaskSaveResponse implements BaseResponse<AutoTaskDTO> {
    public success: boolean;
    public message: string;
    public data?: AutoTaskDTO;

    constructor(origin: AutoTaskSaveResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class AutoTaskDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<AutoTaskDeleteRequest>) {
        if (!origin.id) throw new Error("id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: any) {
        return new AutoTaskDeleteRequest(unsafe);
    }
}

export class AutoTaskDeleteResponse implements BaseResponse<Record<string, never>> {
    public success: boolean;
    public message: string;
    public data?: Record<string, never>;

    constructor(origin: AutoTaskDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class AutoTaskRunNowRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<AutoTaskRunNowRequest>) {
        if (!origin.id) throw new Error("id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: any) {
        return new AutoTaskRunNowRequest(unsafe);
    }
}

export class AutoTaskRunNowResponse implements BaseResponse<{ status: string; message: string }> {
    public success: boolean;
    public message: string;
    public data?: { status: string; message: string };

    constructor(origin: AutoTaskRunNowResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}
