import { hashGenerate } from "../methods/crypto";
import { AccountService } from "../modules/account/account.service";
import { SettingsService } from "../modules/settings/settings.service";
import { startEmailWatcher } from "../modules/email/email.service";
import { config } from "dotenv";
config();

export async function initialize() {
    // Load settings from DB into memory cache
    await SettingsService.loadFromDb();

    // Create default admin account from env
    if (process.env.ADMIN_NAME && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const exist = await AccountService.findByEmail(process.env.ADMIN_EMAIL);
        console.log(process.env.ADMIN_PASSWORD, hashGenerate(process.env.ADMIN_PASSWORD));
        if (!exist || exist.delete_time) {
            await AccountService.create({
                name: process.env.ADMIN_NAME,
                email: process.env.ADMIN_EMAIL,
                password: process.env.ADMIN_PASSWORD,
                is_admin: 1,
            });
            console.log(`[Init] Admin account created: ${process.env.ADMIN_EMAIL}`);
        }
    }

    // Start email file watcher if MAILDIR_PATH is configured
    const maildirPath = process.env.MAILDIR_PATH;
    if (maildirPath) {
        startEmailWatcher(maildirPath);
    }
}
