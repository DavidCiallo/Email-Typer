import {
    SettingsListRequest,
    SettingsSaveRequest,
} from "../../../shared/modules/settings/settings.interface";
import { settingsRoutes } from "../../../shared/modules/settings/settings.router";
import { SettingsService } from "./settings.service";
import { requireAdmin } from "../auth/auth.service";

async function list(request: SettingsListRequest) {
    request = SettingsListRequest.self(request);
    await requireAdmin(request.auth);
    const settings = SettingsService.getAll();
    const entries = Object.entries(settings).map(([key, value]) => ({ key, value }));
    return { entries };
}

async function save(request: SettingsSaveRequest) {
    request = SettingsSaveRequest.self(request);
    await requireAdmin(request.auth);
    const entries: Record<string, string> = {};
    for (const entry of request.entries) {
        entries[entry.key] = entry.value;
    }
    await SettingsService.setMany(entries);
    return {};
}

export const settingsMount = {
    routes: settingsRoutes,
    handlers: { list, save },
};
