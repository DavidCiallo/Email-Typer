import {
    AutoTaskListRequest, AutoTaskListResponse,
    AutoTaskSaveRequest, AutoTaskSaveResponse,
    AutoTaskDeleteRequest, AutoTaskDeleteResponse,
    AutoTaskRunNowRequest, AutoTaskRunNowResponse,
} from "./autotask.interface";

export const autotaskRoutes = {
    base: "/api",
    prefix: "/autotask",
    list:    { path: "/list",     request: {} as AutoTaskListRequest,     response: {} as AutoTaskListResponse },
    save:    { path: "/save",     request: {} as AutoTaskSaveRequest,     response: {} as AutoTaskSaveResponse },
    delete:  { path: "/delete",   request: {} as AutoTaskDeleteRequest,   response: {} as AutoTaskDeleteResponse },
    runNow:  { path: "/run-now",  request: {} as AutoTaskRunNowRequest,   response: {} as AutoTaskRunNowResponse },
} as const;
