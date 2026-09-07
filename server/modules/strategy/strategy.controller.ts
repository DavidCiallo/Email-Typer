import {
    StrategyListRequest,
    StrategySaveRequest,
    StrategyDeleteRequest,
} from "../../../shared/modules/strategy/strategy.interface";
import { strategyRoutes } from "../../../shared/modules/strategy/strategy.router";
import { StrategyService } from "./strategy.service";
import { getIdentifyByVerify } from "../auth/auth.service";
import { GrantService, TauthSession } from "../mailbox/grant.service";
import { MailboxGrantEntity } from "../../../shared/modules/mailbox/mailbox-grant.entity";
import Repository from "../../lib/repository";
import { AccountEntity } from "../../../shared/modules/account/account.entity";

const accountRepo = Repository.instance<AccountEntity>("Account");

/** Login token for admins, or a tauth token (x-tauth header) for grant holders. */
async function resolveIdentity(request: any): Promise<{ admin: boolean; email: string; tauth: TauthSession | null }> {
    const tauth = await GrantService.resolveTauth(
        String(request.__headers?.["x-tauth"] || "").trim() || undefined,
    );
    if (tauth) return { admin: false, email: "", tauth };
    const email = getIdentifyByVerify(request.auth || "");
    if (email) {
        const account = await accountRepo.findOne({ email });
        return { admin: !!account?.is_admin, email, tauth: null };
    }
    throw "Unauthorized";
}

function grantWindow(grant?: MailboxGrantEntity | null) {
    if (!grant) return { grant_address: "", grant_start: 0, grant_end: 0, grant_active: false };
    const now = Date.now();
    return {
        grant_address: grant.address || "",
        grant_start: grant.start_time,
        grant_end: grant.end_time,
        // revoked grants keep their window visible for audit, but are never active
        grant_active: !grant.delete_time && now >= grant.start_time && now <= grant.end_time,
    };
}

async function list(request: StrategyListRequest) {
    const identity = await resolveIdentity(request);
    request = StrategyListRequest.self(request);

    const strategies = await StrategyService.findList();
    const accountMap = new Map<string, { name?: string; email?: string }>();
    if (identity.admin) {
        await accountRepo.findEach((a) => {
            accountMap.set(a.id!, { name: a.name, email: a.email });
        });
    }
    const grants = await GrantService.findList();
    const grantMap = new Map(grants.map((g) => [g.id, g]));

    // grant holders only ever see their own grant's temp strategies
    const scoped = identity.tauth
        ? strategies.filter((s) => s.scope === "temp" && s.grant_id === identity.tauth!.grant.id)
        : strategies;

    const now = Date.now();
    const list = scoped.map(s => {
        const grant = s.scope === "temp" ? grantMap.get(s.grant_id || "") : undefined;
        return {
            id: s.id,
            name: s.name,
            from_pattern: s.from_pattern,
            to_pattern: s.to_pattern,
            subject_pattern: s.subject_pattern,
            forward_to: s.forward_to,
            enabled: s.enabled,
            account_id: s.account_id,
            creator_name: accountMap.get(s.account_id)?.name || "",
            creator_email: accountMap.get(s.account_id)?.email || "",
            scope: s.scope || "persistent",
            grant_id: s.grant_id || "",
            ...grantWindow(grant),
            grant_expired: s.scope === "temp" && (!grant || !!grant.delete_time || now > (grant.end_time || 0)),
        };
    });
    return { list };
}

async function save(request: StrategySaveRequest) {
    const identity = await resolveIdentity(request);
    request = StrategySaveRequest.self(request);

    if (identity.tauth) {
        // grant holders only create/edit their own grant-scoped strategies;
        // scope, grant binding and recipient stay server-controlled
        const t = identity.tauth;
        request.strategy.scope = "temp";
        request.strategy.grant_id = t.grant.id;
        request.strategy.to_pattern = t.address;
        request.strategy.account_id = "";
        request.strategy.from_pattern = request.strategy.from_pattern || "*";
        request.strategy.subject_pattern = request.strategy.subject_pattern || "*";
        if (request.strategy.id) {
            const existing = await StrategyService.findById(request.strategy.id);
            if (!existing || existing.scope !== "temp" || existing.grant_id !== t.grant.id) throw "Strategy not found";
        }
        return await StrategyService.save(request.strategy);
    }

    // admin save — temp strategies keep their grant binding and recipient
    if (request.strategy.id) {
        const existing = await StrategyService.findById(request.strategy.id);
        if (existing?.scope === "temp") {
            request.strategy.scope = "temp";
            request.strategy.grant_id = existing.grant_id;
            request.strategy.to_pattern = existing.to_pattern;
        }
    }

    // Auto-fill account_id from current user
    const account = identity.email ? await accountRepo.findOne({ email: identity.email }) : null;
    if (account) {
        request.strategy.account_id = account.id;
    }

    const strategy = await StrategyService.save(request.strategy);
    return strategy;
}

async function deleteStrategy(request: StrategyDeleteRequest) {
    const identity = await resolveIdentity(request);
    request = StrategyDeleteRequest.self(request);

    if (identity.tauth) {
        const existing = await StrategyService.findById(request.id);
        if (!existing || existing.scope !== "temp" || existing.grant_id !== identity.tauth.grant.id) throw "Strategy not found";
    }

    const result = await StrategyService.delete(request.id);
    if (!result) throw "Strategy not found";
    return {};
}

export const strategyMount = {
    routes: strategyRoutes,
    handlers: { list, save, delete: deleteStrategy },
};
