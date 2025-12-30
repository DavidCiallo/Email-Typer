import {
  StrategyBodyRequest,
  StrategyDeleteRequest,
  StrategyDeleteResponse,
  StrategyListQuery,
  StrategyListResponse,
  StrategyRouterInstance,
  StrategySaveResponse,
} from "../../shared/router/StrategyRouter";
import { inject, injectws } from "../lib/inject";
import { verifytoken } from "../service/auth.service";
import {
  deleteStrategy,
  getStrategyList,
  saveStrategy,
} from "../service/strategy.service";

async function queryStrategyList(
  query: StrategyListQuery
): Promise<StrategyListResponse> {
  if (!query.auth || !query.page) {
    return { list: [], total: 0 };
  }
  const email = verifytoken(query.auth);
  if (!email) {
    return { list: [], total: 0 };
  }
  const list = await getStrategyList();
  return { list, total: list.length };
}

async function requestSaveStrategy(
  query: StrategyBodyRequest
): Promise<StrategySaveResponse> {
  if (!query.auth) {
    return { success: false };
  }
  const verify = verifytoken(query.auth);
  if (!verify) return { success: false };
  if (!query.email.includes("@")) {
    query.email = query.email + "@" + process.env.FROM_HOST;
  }
  query.email = query.email.toLocaleLowerCase();
  const result = await saveStrategy(
    query.email,
    query.forward,
    query.callback,
    query.comment,
    verify
  );
  return { success: result };
}

async function requestDeleteStrategy(
  query: StrategyDeleteRequest
): Promise<StrategyDeleteResponse> {
  if (!query.auth) {
    return { success: false };
  }
  const verify = verifytoken(query.auth);
  if (!verify) return { success: false };
  const result = await deleteStrategy(query.email, verify);
  return { success: result };
}

export const strategyController = new StrategyRouterInstance(inject, {
  queryStrategyList,
  requestSaveStrategy,
  requestDeleteStrategy,
});
