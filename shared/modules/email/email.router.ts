import {
    EmailListRequest, EmailListResponse,
    EmailDetailRequest, EmailDetailResponse,
    EmailSendRequest, EmailSendResponse,
    EmailReceiveRequest, EmailReceiveResponse,
    EmailScanRequest, EmailScanResponse,
    EmailDeleteRequest, EmailDeleteResponse,
} from "./email.interface";

export const emailRoutes = {
    base: "/api",
    prefix: "/email",
    list:    { path: "/list",    request: {} as EmailListRequest,    response: {} as EmailListResponse },
    detail:  { path: "/detail",  request: {} as EmailDetailRequest,  response: {} as EmailDetailResponse },
    send:    { path: "/send",    request: {} as EmailSendRequest,    response: {} as EmailSendResponse },
    receive: { path: "/receive", request: {} as EmailReceiveRequest, response: {} as EmailReceiveResponse },
    scan:    { path: "/scan",    request: {} as EmailScanRequest,    response: {} as EmailScanResponse },
    delete:  { path: "/delete",  request: {} as EmailDeleteRequest,  response: {} as EmailDeleteResponse },
} as const;
