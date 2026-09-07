import Repository from "../../lib/repository";
import { SettingsEntity } from "../../../shared/modules/settings/settings.entity";

const settingsRepo: Repository<SettingsEntity> = Repository.instance("Settings");

const cache = new Map<string, string>();

const SETTING_KEYS: Record<string, string> = {
    "allow_register": "ALLOW_REGISTER",
    "resend_api_key": "RESEND_API_KEY",
    "resend_api_keys": "RESEND_API_KEYS",
    "allowed_domains": "ALLOWED_DOMAINS",
    "allowed_from_domains": "ALLOWED_FROM_DOMAINS",
    "client_url": "CLIENT_URL",
    "mailbox_sync_interval": "MAILBOX_SYNC_INTERVAL",
    "attachment_max_size": "ATTACHMENT_MAX_SIZE",
    // Runtime config surfaced in the settings UI. `loadFromDb()` falls back
    // to env when no row exists, so these are optional at boot.
    "email_receive_api_key": "EMAIL_RECEIVE_API_KEY",
    "push_rate_limit_per_min": "PUSH_RATE_LIMIT_PER_MIN",
    "maildir_path": "MAILDIR_PATH",
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
        // Saving an empty value clears any DB override and falls back to the
        // env default — a row in the store always means "explicit override",
        // so a cleared key can't shadow .env / built-in defaults after restart.
        if (value === "") {
            await settingsRepo.hardDelete({ key } as any);
            cache.set(key, process.env[SETTING_KEYS[key] || ""] || "");
            return;
        }
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
