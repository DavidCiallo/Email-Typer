import {
    StrategyListRequest, StrategyListResponse,
    StrategySaveRequest, StrategySaveResponse,
    StrategyDeleteRequest, StrategyDeleteResponse,
} from "./strategy.interface";

export const strategyRoutes = {
    base: "/api",
    prefix: "/strategy",
    list:   { path: "/list",   request: {} as StrategyListRequest,   response: {} as StrategyListResponse },
    save:   { path: "/save",   request: {} as StrategySaveRequest,   response: {} as StrategySaveResponse },
    delete: { path: "/delete", request: {} as StrategyDeleteRequest, response: {} as StrategyDeleteResponse },
} as const;
