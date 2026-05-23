import { BaseRequest, BaseResponse } from "../../lib/default/decorator";
import { StrategyEntity } from "./strategy.entity";

export type StrategyDTO = Pick<StrategyEntity, "id" | "name" | "from_pattern" | "to_pattern" | "subject_pattern" | "forward_to" | "enabled" | "account_id">;

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
