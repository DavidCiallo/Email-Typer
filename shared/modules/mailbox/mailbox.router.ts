import {
    MailboxListRequest, MailboxListResponse,
    MailboxSaveRequest, MailboxSaveResponse,
    MailboxDeleteRequest, MailboxDeleteResponse,
    MailboxAddressesRequest, MailboxAddressesResponse,
    MailboxRegenerateKeyRequest, MailboxRegenerateKeyResponse,
    MailboxSyncRequest, MailboxSyncResponse,
    MailboxTestRequest, MailboxTestResponse,
    MailboxProvidersRequest, MailboxProvidersResponse,
} from "./mailbox.interface";

export const mailboxRoutes = {
    base: "/api",
    prefix: "/mailbox",
    list:          { path: "/list",           request: {} as MailboxListRequest,          response: {} as MailboxListResponse },
    save:          { path: "/save",           request: {} as MailboxSaveRequest,          response: {} as MailboxSaveResponse },
    delete:        { path: "/delete",         request: {} as MailboxDeleteRequest,        response: {} as MailboxDeleteResponse },
    addresses:     { path: "/addresses",      request: {} as MailboxAddressesRequest,     response: {} as MailboxAddressesResponse },
    regenerateKey: { path: "/regenerate-key", request: {} as MailboxRegenerateKeyRequest, response: {} as MailboxRegenerateKeyResponse },
    sync:          { path: "/sync",           request: {} as MailboxSyncRequest,          response: {} as MailboxSyncResponse },
    test:          { path: "/test",           request: {} as MailboxTestRequest,          response: {} as MailboxTestResponse },
    providers:     { path: "/providers",      request: {} as MailboxProvidersRequest,     response: {} as MailboxProvidersResponse },
} as const;
