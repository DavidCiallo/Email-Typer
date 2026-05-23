export class HttpClientService {
    private static instance: HttpClientService;
    private constructor() {}

    public static getInstance(): HttpClientService {
        if (!HttpClientService.instance) {
            HttpClientService.instance = new HttpClientService();
        }
        return HttpClientService.instance;
    }

    public async get(name: string, url: string, query: Record<string, any> = {}) {
        const params = new URLSearchParams();
        for (const [key, val] of Object.entries(query)) {
            if (val !== undefined && val !== null) {
                params.set(key, String(val));
            }
        }
        const finalUrl = url + "?" + params.toString();
        try {
            const res = await fetch(finalUrl, {
                method: "GET",
                headers: { "token": localStorage.getItem("token") || "" }
            });
            const data = await res.json();
            const event = new CustomEvent(name, { detail: data, bubbles: true });
            window.dispatchEvent(event);
        } catch (e) {
            console.error("HTTP GET error:", e);
        }
    }

    public async post(name: string, url: string, body: any) {
        try {
            const res = await fetch(url, {
                method: "POST",
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/json",
                    "token": localStorage.getItem("token") || ""
                }
            });
            const data = await res.json();
            const event = new CustomEvent(name, { detail: data, bubbles: true });
            window.dispatchEvent(event);
        } catch (e) {
            console.error("HTTP POST error:", e);
        }
    }
}
