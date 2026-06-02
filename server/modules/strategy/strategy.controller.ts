import {
    StrategyListRequest,
    StrategySaveRequest,
    StrategyDeleteRequest,
} from "../../../shared/modules/strategy/strategy.interface";
import { strategyRoutes } from "../../../shared/modules/strategy/strategy.router";
import { StrategyService } from "./strategy.service";
import { getIdentifyByVerify } from "../auth/auth.service";
import Repository from "../../lib/repository";
import { AccountEntity } from "../../../shared/modules/account/account.entity";

const accountRepo = Repository.instance<AccountEntity>("Account");

async function list(request: StrategyListRequest) {
    request = StrategyListRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const strategies = await StrategyService.findList();
    const accountMap = new Map<string, { name?: string; email?: string }>();
    await accountRepo.findEach((a) => {
        accountMap.set(a.id!, { name: a.name, email: a.email });
    });

    const list = strategies.map(s => ({
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
    }));
    return { list };
}

async function save(request: StrategySaveRequest) {
    request = StrategySaveRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    // Auto-fill account_id from current user
    const account = await accountRepo.findOne({ email });
    if (account) {
        request.strategy.account_id = account.id;
    }

    const strategy = await StrategyService.save(request.strategy);
    return strategy;
}

async function deleteStrategy(request: StrategyDeleteRequest) {
    request = StrategyDeleteRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const result = await StrategyService.delete(request.id);
    if (!result) throw "Strategy not found";
    return {};
}

export const strategyMount = {
    routes: strategyRoutes,
    handlers: { list, save, delete: deleteStrategy },
};
