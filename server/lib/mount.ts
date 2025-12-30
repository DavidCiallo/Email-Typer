import { Express, Request, Response } from "express";
import { BaseRouterInstance, BaseWebsocketInstance, WSMessage } from "../../shared/lib/decorator";
import { Server } from "ws";
import { WebSocketServerService } from "./webscoket";

export function mounthttp(expressApp: Express, controllers: BaseRouterInstance[]) {
    const interfaceList: Array<{ base: string; prefix: string; path: string; method: string }> = [];
    for (const controller of controllers) {
        console.log(`Controller ${controller.prefix} is registering with ${controller.router.length} routes.`);
        const { base, prefix, router } = controller;
        for (const item of router) {
            const { path, method, handler } = item;
            if (interfaceList.some((item) => item.prefix === prefix && item.path === path && item.method === method)) {
                throw new Error(`Duplicate route found: ${prefix}${path} with method ${method}`);
            } else {
                interfaceList.push({ base, prefix, path, method });
            }
            if (!handler || typeof handler !== "function") {
                throw new Error(`Handler method "${method}" for route ${prefix}${path} is not valid.`);
            }
            if (!(method === "get" || method === "post" || method === "put" || method === "delete")) {
                throw new Error(
                    `Invalid method ${method} for route ${prefix}${path}. Supported methods are: get, post, put, delete.`,
                );
            }
            expressApp[method](`${base}${prefix}${path}`, async (req: Request, res: Response) => {
                const auth = req.headers["token"];
                switch (method) {
                    case "get":
                        res.send(await handler({ ...req.query, auth }));
                        break;
                    case "post":
                        res.send(await handler({ ...req.body, auth }));
                        break;
                }
            });
        }
    }
}
