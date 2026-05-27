import {
    ThirdpartyListRequest, ThirdpartyListResponse,
    ThirdpartySaveRequest, ThirdpartySaveResponse,
    ThirdpartyDeleteRequest, ThirdpartyDeleteResponse,
} from "./thirdparty.interface";

export const thirdpartyRoutes = {
    base: "/api",
    prefix: "/thirdparty",
    list:   { path: "/list",   request: {} as ThirdpartyListRequest,   response: {} as ThirdpartyListResponse },
    save:   { path: "/save",   request: {} as ThirdpartySaveRequest,   response: {} as ThirdpartySaveResponse },
    delete: { path: "/delete", request: {} as ThirdpartyDeleteRequest, response: {} as ThirdpartyDeleteResponse },
} as const;
