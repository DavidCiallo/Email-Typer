const KEY = "tauth";
const KEY_ADDR = "tauth_address";

export function getTauth(): string {
    return localStorage.getItem(KEY) || "";
}

export function getTauthAddress(): string {
    return localStorage.getItem(KEY_ADDR) || "";
}

export function setTauth(token: string, address = ""): void {
    localStorage.setItem(KEY, token);
    localStorage.setItem(KEY_ADDR, address);
}

export function clearTauth(): void {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_ADDR);
}

export function inTauthSession(): boolean {
    return !!getTauth();
}
