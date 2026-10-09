import {
    StrategyListRequest, StrategyListResponse,
    StrategySaveRequest, StrategySaveResponse,
    StrategyDeleteRequest, StrategyDeleteResponse,
    StrategyTemplateListRequest, StrategyTemplateListResponse,
    StrategyTemplateSaveRequest, StrategyTemplateSaveResponse,
    StrategyTemplateDeleteRequest, StrategyTemplateDeleteResponse,
} from "./strategy.interface";

export const strategyRoutes = {
    base: "/api",
    prefix: "/strategy",
    list:   { path: "/list",   request: {} as StrategyListRequest,   response: {} as StrategyListResponse },
    save:   { path: "/save",   request: {} as StrategySaveRequest,   response: {} as StrategySaveResponse },
    delete: { path: "/delete", request: {} as StrategyDeleteRequest, response: {} as StrategyDeleteResponse },
} as const;

export const strategyTemplateRoutes = {
    base: "/api",
    prefix: "/strategy-template",
    list:   { path: "/list",   request: {} as StrategyTemplateListRequest,   response: {} as StrategyTemplateListResponse },
    save:   { path: "/save",   request: {} as StrategyTemplateSaveRequest,   response: {} as StrategyTemplateSaveResponse },
    delete: { path: "/delete", request: {} as StrategyTemplateDeleteRequest, response: {} as StrategyTemplateDeleteResponse },
} as const;
