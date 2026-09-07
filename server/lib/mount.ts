import path from "path";

export interface RouteMount {
    routes: { base: string; prefix: string; [key: string]: any };
    handlers: Record<string, Function>;
}

export async function mounthttp(req: Request, mounts: RouteMount[]): Promise<Response | null> {
    const url = new URL(req.url);
    const pathName = url.pathname;
    const method = req.method.toLowerCase();

    // CORS preflight — must short-circuit before route dispatch (routes are
    // matched by path only, so OPTIONS would otherwise hit business handlers)
    if (method === "options") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, token, Authorization, x-api-key",
                "Access-Control-Max-Age": "86400",
            },
        });
    }

    for (const mount of mounts) {
        const { routes, handlers } = mount;
        for (const [key, val] of Object.entries(routes)) {
            if (key === "base" || key === "prefix") continue;
            const route = val as any;
            const fullPath = `${routes.base}${routes.prefix}${route.path}`;

            if (pathName !== fullPath) continue;

            const handler = handlers[key];
            if (!handler) continue;

            const auth = req.headers.get("token") || req.headers.get("x-api-key") || req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
            // headers are mounted first so body-less requests (auth via
            // x-api-key / x-tauth headers only) still reach handlers intact
            const __headers: Record<string, string> = Object.fromEntries((req.headers as any).entries());
            let requestBody: Record<string, any> = {};
            try {
                const contentType = req.headers.get("content-type") || "";
                const rawBody = await req.text();
                if (contentType.includes("application/json")) {
                    requestBody = rawBody ? JSON.parse(rawBody) : {};
                } else if (contentType.includes("application/x-www-form-urlencoded")) {
                    requestBody = Object.fromEntries(new URLSearchParams(rawBody).entries());
                } else if (rawBody) {
                    try {
                        requestBody = JSON.parse(rawBody);
                    } catch {
                        requestBody = Object.fromEntries(new URLSearchParams(rawBody).entries());
                    }
                }
            } catch (e) {
                console.error("[mount] failed to parse request body:", e);
            }
            (requestBody as any).__raw_body = (requestBody as any).__raw_body ?? "";
            (requestBody as any).__headers = __headers;
            let requertQuery: Record<string, string> | null = {};
            try {
                requertQuery = Object.fromEntries(url.searchParams.entries());
            } catch {
                requertQuery = {};
            }
            try {
                const result = handler && (await handler({ ...requertQuery, ...requestBody, auth }));

                if (result instanceof Response || (result && result.constructor?.name === "Response")) {
                    return result as any;
                }

                if (route.raw) {
                    return new Response(JSON.stringify(result), {
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                            "Access-Control-Allow-Headers": "Content-Type, token, Authorization",
                        },
                    });
                }

                return new Response(JSON.stringify({
                    success: true,
                    data: result,
                }), {
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, token, Authorization",
                    },
                });
            } catch (error: any) {
                console.error(`Error in handler for ${fullPath}:`, error);
                return new Response(JSON.stringify({
                    success: false,
                    message: error?.message || error?.toString() || "Internal server error",
                    data: null
                }), {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, token, Authorization",
                    },
                });
            }
        }
    }

    return null;
}

const validStaticFiles = new Set<string>();

export async function mountstatic(staticPath: string, pathName: string) {
    if (pathName.endsWith(".mjs")) {
        return new Response("Forbidden", { status: 403 });
    }

    if (pathName.includes("..")) {
        return new Response("Forbidden", { status: 403 });
    }

    let filePath = path.join(staticPath, pathName);
    if (pathName === "/") {
        filePath = path.join(staticPath, "index.html");
    }

    if (!filePath.startsWith(staticPath)) {
        return new Response("Forbidden", { status: 403 });
    }

    if (!validStaticFiles.has(filePath)) {
        // @ts-ignore
        const file = Bun.file(filePath);
        if (await file.exists()) {
            validStaticFiles.add(filePath);
            return new Response(file);
        }
    } else {
        // @ts-ignore
        const file = Bun.file(filePath);
        return new Response(file);
    }

    if (!pathName.startsWith("/api")) {
        // @ts-ignore
        return new Response(Bun.file(path.join(staticPath, "index.html")));
    }

    return null;
}

export const activeSockets = new Set<any>();

export function mountws(req: Request, server: any): boolean {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
        return server.upgrade(req);
    }
    return false;
}

export const wshandler = {
    open(ws: any) {
        activeSockets.add(ws);
    },
    message(_ws: any, _message: any) { },
    close(ws: any, _code: number, _message: string) {
        activeSockets.delete(ws);
    },
};

export function broadcastWsMessage(message: any) {
    const msgString = JSON.stringify(message);
    for (const ws of activeSockets) {
        try {
            ws.send(msgString);
        } catch (e) {
            console.error("Failed to send WebSocket message", e);
        }
    }
}
