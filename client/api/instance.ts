import { HttpClientService } from "../lib/webhttp";
import { authRoutes } from "../../shared/modules/auth/auth.router";
import { emailRoutes } from "../../shared/modules/email/email.router";
import { strategyRoutes } from "../../shared/modules/strategy/strategy.router";

type RouteDef = { path: string; request: any; response: any };

function buildApiClient(routes: Record<string, RouteDef>, http: HttpClientService) {
    const client: Record<string, Function> = {};

    for (const [name, route] of Object.entries(routes)) {
        if (name === "base" || name === "prefix") continue;

        const url = routes.base + routes.prefix + (route as RouteDef).path;

        // All routes use POST as the method (body-based requests)
        client[name] = async (body: Record<string, any>, callback?: Function) => {
            if (callback) {
                window.addEventListener(name, (event) => {
                    const detail = (event as CustomEvent)["detail"];
                    callback(detail);
                }, { once: true });
            }
            http.post(name, url, body);
        };
    }

    return client;
}

const http = HttpClientService.getInstance();

export const AuthRouter = buildApiClient(authRoutes as any, http);
export const EmailRouter = buildApiClient(emailRoutes as any, http);
export const StrategyRouter = buildApiClient(strategyRoutes as any, http);
