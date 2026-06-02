import {
    AccountListRequest,
    AccountCreateRequest,
    AccountUpdateRequest,
    AccountDeleteRequest,
    AccountExportRequest,
    AccountImportRequest,
} from "../../../shared/modules/account/account.interface";
import { accountRoutes } from "../../../shared/modules/account/account.router";
import { AccountService } from "./account.service";
import { requireAdmin } from "../auth/auth.service";
import Repository from "../../lib/repository";
import { EmailEntity } from "../../../shared/modules/email/email.entity";

async function list(request: AccountListRequest) {
    request = AccountListRequest.self(request);
    await requireAdmin(request.auth);
    const result = await AccountService.findList({ limit: request.limit, offset: request.offset });
    return result;
}

async function create(request: AccountCreateRequest) {
    request = AccountCreateRequest.self(request);
    await requireAdmin(request.auth);
    const account = await AccountService.create(request.account);
    return account;
}

async function update(request: AccountUpdateRequest) {
    request = AccountUpdateRequest.self(request);
    await requireAdmin(request.auth);
    const result = await AccountService.update(request.id, request.account);
    if (!result) throw "Account not found";
    return {};
}

async function deleteAccount(request: AccountDeleteRequest) {
    request = AccountDeleteRequest.self(request);
    await requireAdmin(request.auth);
    const result = await AccountService.delete(request.id);
    if (!result) throw "Account not found";
    return {};
}

// ========== Export / Import ==========

async function exportData(request: AccountExportRequest) {
    await requireAdmin(request.auth);

    const accountRepo = Repository.instance("Account");
    const emailRepo = Repository.instance<EmailEntity>("Email");
    const strategyRepo = Repository.instance("Strategy");
    const settingsRepo = Repository.instance("Settings");

    const accounts = await accountRepo.findAllIgnoreDelete();
    const strategies = await strategyRepo.findAllIgnoreDelete();
    const settings = await settingsRepo.findAllIgnoreDelete();
    const emails: EmailEntity[] = [];
    for await (const batch of emailRepo.findAllIgnoreDeleteBatch(2000)) {
        for (const row of batch) emails.push(row);
    }

    return {
        version: 1,
        exported_at: Date.now(),
        data: { accounts, emails, strategies, settings },
    };
}

async function importData(request: AccountImportRequest) {
    await requireAdmin(request.auth);

    const { data } = request.data;
    const imported: Record<string, number> = {};

    const tables: { repo: Repository<any>; items: any[] | undefined; name: string }[] = [
        { repo: Repository.instance("Account"), items: data.accounts, name: "accounts" },
        { repo: Repository.instance("Email"), items: data.emails, name: "emails" },
        { repo: Repository.instance("Strategy"), items: data.strategies, name: "strategies" },
        { repo: Repository.instance("Settings"), items: data.settings, name: "settings" },
    ];

    for (const { repo, items, name } of tables) {
        if (!items || items.length === 0) continue;
        await repo.truncate();
        for (let i = 0; i < items.length; i += 1000) {
            const chunk = items.slice(i, i + 1000);
            imported[name] = (imported[name] || 0) + await repo.batchInsert(chunk);
        }
    }

    return { imported };
}

export const accountMount = {
    routes: accountRoutes,
    handlers: { list, create, update, delete: deleteAccount, export: exportData, import: importData },
};
