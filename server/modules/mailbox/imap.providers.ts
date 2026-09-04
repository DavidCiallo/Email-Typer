export interface ProviderPreset {
    label: string;
    host: string;
    port: number;
    tls: boolean;
    /** login hint shown in the UI ("授权码" for CN providers, app password elsewhere) */
    authHint: string;
}

/**
 * IMAP presets for auth-code (授权码) providers. These providers issue a
 * dedicated client password — plain LOGIN with that code over TLS just works.
 * OAuth2-only providers (personal Microsoft, Gmail without app passwords)
 * will live behind a separate connector later.
 */
export const IMAP_PROVIDERS: Record<string, ProviderPreset> = {
    "163":      { label: "网易 163",   host: "imap.163.com",          port: 993, tls: true,  authHint: "在网页端 设置 → POP3/IMAP/SMTP 开启 IMAP 并获取授权码" },
    "126":      { label: "网易 126",   host: "imap.126.com",          port: 993, tls: true,  authHint: "在网页端 设置 → POP3/IMAP/SMTP 开启 IMAP 并获取授权码" },
    "yeah":     { label: "网易 yeah",  host: "imap.yeah.net",         port: 993, tls: true,  authHint: "在网页端 设置 → POP3/IMAP/SMTP 开启 IMAP 并获取授权码" },
    "qq":       { label: "QQ 邮箱",    host: "imap.qq.com",           port: 993, tls: true,  authHint: "网页端 设置 → 账户 → 开启 IMAP/SMTP 服务并生成授权码" },
    "foxmail":  { label: "Foxmail",    host: "imap.qq.com",           port: 993, tls: true,  authHint: "同 QQ 邮箱，使用 QQ 域账号授权码" },
    "sina":     { label: "新浪邮箱",   host: "imap.sina.com",         port: 993, tls: true,  authHint: "网页端 设置 → 客户端 POP3/IMAP/SMTP 开启并获取授权码" },
    "outlook":  { label: "Outlook",    host: "outlook.office365.com", port: 993, tls: true,  authHint: "需要账户密码或应用密码（OAuth2 连接器规划中）" },
    "custom":   { label: "自定义",     host: "",                      port: 993, tls: true,  authHint: "自行填写 IMAP 服务器地址与端口" },
};

export function resolveProvider(key: string): ProviderPreset | null {
    return IMAP_PROVIDERS[key] || null;
}
