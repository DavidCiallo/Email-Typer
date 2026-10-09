import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { StrategyEntity } from "./strategy.entity";

export type StrategyDTO = Pick<StrategyEntity, "id" | "name" | "from_pattern" | "to_pattern" | "subject_pattern" | "forward_to" | "action" | "webhook_url" | "enabled" | "account_id" | "scope" | "grant_id"> & { creator_name?: string; creator_email?: string };

// List
export class StrategyListRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<StrategyListRequest>) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: StrategyListRequest) {
        return new StrategyListRequest(unsafe);
    }
}

export class StrategyListResponse implements BaseResponse<StrategyDTO[]> {
    public success: boolean;
    public message: string;
    public data?: { list: StrategyDTO[] };

    constructor(origin: StrategyListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

// Save (create or update)
export class StrategySaveRequest implements BaseRequest {
    public auth?: string;
    public strategy: Partial<StrategyDTO> & { id?: string };

    constructor(origin: Partial<StrategySaveRequest>) {
        if (!origin.strategy) throw new Error("Strategy data is required");
        origin.auth && (this.auth = origin.auth);
        this.strategy = origin.strategy;
    }
    static self(unsafe: StrategySaveRequest) {
        return new StrategySaveRequest(unsafe);
    }
}

export class StrategySaveResponse implements BaseResponse<StrategyDTO> {
    public success: boolean;
    public message: string;

    constructor(origin: StrategySaveResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Delete
export class StrategyDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<StrategyDeleteRequest>) {
        if (!origin.id) throw new Error("Strategy id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: StrategyDeleteRequest) {
        return new StrategyDeleteRequest(unsafe);
    }
}

export class StrategyDeleteResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: StrategyDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}

// Templates — shared by admins and tauth holders. The recipient is not part of
// a template; it is chosen when the strategy is created.
export type StrategyTemplateDTO = Pick<
    StrategyEntity,
    "id" | "name" | "from_pattern" | "subject_pattern" | "action" | "forward_to" | "webhook_url"
> & { note: string };

export class StrategyTemplateListRequest implements BaseRequest {
    public auth?: string;

    constructor(origin: Partial<StrategyTemplateListRequest>) {
        origin.auth && (this.auth = origin.auth);
    }
    static self(unsafe: StrategyTemplateListRequest) {
        return new StrategyTemplateListRequest(unsafe);
    }
}

export class StrategyTemplateListResponse implements BaseResponse<{ list: StrategyTemplateDTO[] }> {
    public success: boolean;
    public message: string;
    public data?: { list: StrategyTemplateDTO[] };

    constructor(origin: StrategyTemplateListResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class StrategyTemplateSaveRequest implements BaseRequest {
    public auth?: string;
    public template: Partial<StrategyTemplateDTO>;

    constructor(origin: Partial<StrategyTemplateSaveRequest>) {
        if (!origin.template?.name?.trim()) throw new Error("Template name is required");
        origin.auth && (this.auth = origin.auth);
        this.template = origin.template;
    }
    static self(unsafe: StrategyTemplateSaveRequest) {
        return new StrategyTemplateSaveRequest(unsafe);
    }
}

export class StrategyTemplateSaveResponse implements BaseResponse<StrategyTemplateDTO> {
    public success: boolean;
    public message: string;
    public data?: StrategyTemplateDTO;

    constructor(origin: StrategyTemplateSaveResponse) {
        this.success = origin.success;
        this.message = origin.message;
        this.data = origin.data;
    }
}

export class StrategyTemplateDeleteRequest implements BaseRequest {
    public auth?: string;
    public id: string;

    constructor(origin: Partial<StrategyTemplateDeleteRequest>) {
        if (!origin.id) throw new Error("Template id is required");
        origin.auth && (this.auth = origin.auth);
        this.id = origin.id;
    }
    static self(unsafe: StrategyTemplateDeleteRequest) {
        return new StrategyTemplateDeleteRequest(unsafe);
    }
}

export class StrategyTemplateDeleteResponse implements BaseResponse<null> {
    public success: boolean;
    public message: string;

    constructor(origin: StrategyTemplateDeleteResponse) {
        this.success = origin.success;
        this.message = origin.message;
    }
}
