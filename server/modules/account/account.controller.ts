import {
    AccountListRequest,
    AccountCreateRequest,
    AccountUpdateRequest,
    AccountDeleteRequest,
} from "../../../shared/modules/account/account.interface";
import { accountRoutes } from "../../../shared/modules/account/account.router";
import { AccountService } from "./account.service";
import { requireAdmin } from "../auth/auth.service";

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

export const accountMount = {
    routes: accountRoutes,
    handlers: { list, create, update, delete: deleteAccount },
};
