import { AuthRouterInstance } from "../../shared/router/AuthRouter";
import { EmailRouterInstance } from "../../shared/router/EmailRouter";
import { StrategyRouterInstance } from "../../shared/router/StrategyRouter";
import { inject } from "../lib/inject";

export const AuthRouter = new AuthRouterInstance(inject);
export const EmailRouter = new EmailRouterInstance(inject);
export const StrategyRouter = new StrategyRouterInstance(inject);
