import {
    AccountListRequest, AccountListResponse,
    AccountCreateRequest, AccountCreateResponse,
    AccountUpdateRequest, AccountUpdateResponse,
    AccountDeleteRequest, AccountDeleteResponse,
} from "./account.interface";

export const accountRoutes = {
    base: "/api",
    prefix: "/account",
    list:   { path: "/list",   request: {} as AccountListRequest,   response: {} as AccountListResponse },
    create: { path: "/create", request: {} as AccountCreateRequest, response: {} as AccountCreateResponse },
    update: { path: "/update", request: {} as AccountUpdateRequest, response: {} as AccountUpdateResponse },
    delete: { path: "/delete", request: {} as AccountDeleteRequest, response: {} as AccountDeleteResponse },
} as const;
