import {
    SafetyListRequest,
    SafetySaveRequest,
    SafetyDeleteRequest,
} from "../../../shared/modules/safety/safety.interface";
import { safetyRoutes } from "../../../shared/modules/safety/safety.router";
import { SafetyService } from "./safety.service";
import { requireAdmin } from "../auth/auth.service";

async function list(request: SafetyListRequest) {
    request = SafetyListRequest.self(request);
    await requireAdmin(request.auth);

    const where: Record<string, any> = {};
    if (request.type) {
        where.type = request.type;
    }

    const rows = await SafetyService.findList(where);
    const list = rows.map(e => ({
        id: e.id,
        type: e.type,
        value: e.value,
        note: e.note,
    }));
    return { list };
}

async function save(request: SafetySaveRequest) {
    request = SafetySaveRequest.self(request);
    await requireAdmin(request.auth);

    await SafetyService.save(request.entry);
    return {};
}

async function deleteEntry(request: SafetyDeleteRequest) {
    request = SafetyDeleteRequest.self(request);
    await requireAdmin(request.auth);

    const result = await SafetyService.delete(request.id);
    if (!result) throw "Safety entry not found";
    return {};
}

export const safetyMount = {
    routes: safetyRoutes,
    handlers: { list, save, delete: deleteEntry },
};
