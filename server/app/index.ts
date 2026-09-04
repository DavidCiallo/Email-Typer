import { config } from "dotenv";
config();

import { fileURLToPath } from "url";
import path from "path";
import { initialize } from "./initialize";

const __filename = fileURLToPath(import.meta.url);
const staticPath = path.resolve(path.dirname(__filename), "../../dist");

import { mounthttp, mountstatic, mountws, wshandler } from "../lib/mount";
import { authMount } from "../modules/auth/auth.controller";
import { emailMount } from "../modules/email/email.controller";
import { strategyMount } from "../modules/strategy/strategy.controller";
import { accountMount } from "../modules/account/account.controller";
import { settingsMount } from "../modules/settings/settings.controller";
import { safetyMount } from "../modules/safety/safety.controller";
import { thirdpartyMount } from "../modules/thirdparty/thirdparty.controller";
import { mailboxMount } from "../modules/mailbox/mailbox.controller";

const PORT = parseInt(process.env.SERVER_PORT || "3300");

await initialize();

// @ts-ignore
Bun.serve({
    port: PORT,
    idleTimeout: 255,
    async fetch(req: Request, server: any) {
        // WebSocket upgrade for live notifications (/ws)
        if (mountws(req, server)) return true;

        const url = new URL(req.url);
        const pathName = url.pathname;

        const apiResponse = await mounthttp(req, [
            authMount,
            emailMount,
            strategyMount,
            accountMount,
            settingsMount,
            safetyMount,
            thirdpartyMount,
            mailboxMount,
        ]);
        if (apiResponse) return apiResponse;

        const staticResponse = await mountstatic(staticPath, pathName);
        if (staticResponse) return staticResponse;

        return new Response("Not Found", { status: 404 });
    },
    websocket: wshandler,
});

console.log(`\nServer is running at http://localhost:${PORT}`);
