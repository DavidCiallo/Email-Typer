/**
 * Reconnecting WebSocket client for server push notifications.
 * The server broadcasts `{ name, data }` frames on /ws; each frame is
 * re-dispatched as a window CustomEvent so any component can listen.
 */
let ws: WebSocket | null = null;
let retry = 0;
let started = false;

export function connectLive(): void {
    if (started) return;
    started = true;
    open();
}

function open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    try {
        ws = new WebSocket(`${proto}//${location.host}/ws`);
    } catch {
        scheduleRetry();
        return;
    }

    ws.onopen = () => {
        retry = 0;
    };

    ws.onmessage = (event: MessageEvent) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg?.name) {
                window.dispatchEvent(new CustomEvent(msg.name, { detail: msg.data }));
            }
        } catch {
            /* ignore malformed frames */
        }
    };

    ws.onclose = () => {
        ws = null;
        scheduleRetry();
    };

    ws.onerror = () => {
        ws?.close();
    };
}

function scheduleRetry() {
    const delay = Math.min(1000 * 2 ** retry, 10000);
    retry++;
    setTimeout(() => open(), delay);
}
