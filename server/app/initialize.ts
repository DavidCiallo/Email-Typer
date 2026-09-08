import { AccountService } from "../modules/account/account.service";
import { SettingsService } from "../modules/settings/settings.service";
import { EmailService, startEmailWatcher } from "../modules/email/email.service";
import { MailboxSyncWorker } from "../modules/mailbox/sync.worker";
import { config } from "dotenv";
config();

export async function initialize() {
    // Load settings from DB into memory cache
    await SettingsService.loadFromDb();

    // Create default admin account from env
    if (process.env.ADMIN_NAME && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const exist = await AccountService.findByEmail(process.env.ADMIN_EMAIL);
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

    // Settings are loaded from DB above (env fallback); maildir_path is
    // configurable on the settings page, though a running watcher only
    // picks it up after a restart.
    const maildirPath = SettingsService.get("maildir_path");
    // Link legacy rows to their eml archive before the watcher starts, so
    // its known-paths set is complete and no body is ever re-derived late.
    await EmailService.migrateEmlIndex();
    if (maildirPath) {
        startEmailWatcher(maildirPath);
    }

    // Schedule IMAP sync workers for configured external mailboxes
    await MailboxSyncWorker.startAll();
}
