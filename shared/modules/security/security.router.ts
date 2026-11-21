import {
    SecurityEventsRequest, SecurityEventsResponse,
    SecurityLockStatusRequest, SecurityLockStatusResponse,
    SecurityUnlockRequest, SecurityUnlockResponse,
} from "./security.interface";

export const securityRoutes = {
    base: "/api",
    prefix: "/security",
    events: { path: "/events", request: {} as SecurityEventsRequest, response: {} as SecurityEventsResponse },
    lockStatus: { path: "/lock-status", request: {} as SecurityLockStatusRequest, response: {} as SecurityLockStatusResponse },
    unlock: { path: "/unlock", request: {} as SecurityUnlockRequest, response: {} as SecurityUnlockResponse },
} as const;
