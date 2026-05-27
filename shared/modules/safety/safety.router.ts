import {
    SafetyListRequest, SafetyListResponse,
    SafetySaveRequest, SafetySaveResponse,
    SafetyDeleteRequest, SafetyDeleteResponse,
} from "./safety.interface";

export const safetyRoutes = {
    base: "/api",
    prefix: "/safety",
    list:   { path: "/list",   request: {} as SafetyListRequest,   response: {} as SafetyListResponse },
    save:   { path: "/save",   request: {} as SafetySaveRequest,   response: {} as SafetySaveResponse },
    delete: { path: "/delete", request: {} as SafetyDeleteRequest, response: {} as SafetyDeleteResponse },
} as const;
