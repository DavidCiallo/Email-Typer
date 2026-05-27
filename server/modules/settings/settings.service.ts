import Repository from "../../lib/repository";
import { SettingsEntity } from "../../../shared/modules/settings/settings.entity";

const settingsRepo: Repository<SettingsEntity> = Repository.instance("Settings");

const cache = new Map<string, string>();

const SETTING_KEYS: Record<string, string> = {
    "resend_api_key": "RESEND_API_KEY",
    "allowed_domains": "ALLOWED_DOMAINS",
};

export class SettingsService {
    static async loadFromDb(): Promise<void> {
        cache.clear();
        const rows = await settingsRepo.find({});
        for (const row of rows) {
            cache.set(row.key, row.value);
        }
        for (const [key, envKey] of Object.entries(SETTING_KEYS)) {
            if (!cache.has(key)) {
                const envVal = process.env[envKey];
                if (envVal !== undefined) {
                    cache.set(key, envVal);
                }
            }
        }
    }

    static get(key: string): string {
        return cache.get(key) || "";
    }

    static getAll(): Record<string, string> {
        const result: Record<string, string> = {};
        for (const key of Object.keys(SETTING_KEYS)) {
            result[key] = cache.get(key) || "";
        }
        return result;
    }

    static async set(key: string, value: string): Promise<void> {
        cache.set(key, value);
        const existing = await settingsRepo.findOne({ key } as any);
        if (existing) {
            await settingsRepo.update({ key } as any, { value } as any);
        } else {
            await settingsRepo.insert({ key, value } as any);
        }
    }

    static async setMany(entries: Record<string, string>): Promise<void> {
        for (const [key, value] of Object.entries(entries)) {
            if (key in SETTING_KEYS) {
                await SettingsService.set(key, value);
            }
        }
    }
}
