import { useEffect, useState } from "react";
import { SettingsRouter, AccountRouter } from "../../api/instance";
import { SettingsEntry } from "../../../shared/modules/settings/settings.interface";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { TagInput, KeyValueList } from "./editors";
import { cn } from "../../lib/utils";
import { toast } from "../../methods/notify";

const FIELD_LABELS: Record<string, string> = {
    allow_register: "允许注册",
    resend_api_key: "Resend API Key（默认）",
    resend_api_keys: "Resend API Keys（按域名）",
    allowed_domains: "允许注册的域名",
    allowed_from_domains: "允许发件的域名",
    client_url: "客户端地址",
    email_receive_api_key: "推送/收信 API Key",
    push_rate_limit_per_min: "推送频率上限（次/分钟，0 = 不限）",
    maildir_path: "邮件存储目录（.eml）",
    mailbox_sync_interval: "邮箱同步间隔（秒）",
    attachment_max_size: "附件大小上限（字节）",
};

/** Display order & section grouping for known keys; unknown keys go to "其他". */
const SECTIONS: { title: string; keys: string[] }[] = [
    { title: "注册与域名", keys: ["allow_register", "allowed_domains", "client_url"] },
    { title: "邮件发送", keys: ["resend_api_key", "resend_api_keys", "allowed_from_domains"] },
    { title: "服务器", keys: ["email_receive_api_key", "push_rate_limit_per_min", "maildir_path", "mailbox_sync_interval", "attachment_max_size"] },
];

const ENV_ONLY_HINT = "端口、管理员账号、SECRET、DATA_DIR 仍只支持 .env 配置";

export default function SettingsPage() {
    const [entries, setEntries] = useState<SettingsEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState("");

    const fetchSettings = async () => {
        setLoading(true);
        SettingsRouter.list({}, (res: any) => {
            if (res.success && res.data) {
                setEntries(res.data.entries || []);
            }
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        SettingsRouter.save({ entries }, (res: any) => {
            if (res.success) {
                toast({ title: "保存成功", color: "success" });
            } else {
                toast({ title: "保存失败", color: "danger" });
            }
            setSaving(false);
        });
    };

    const updateEntry = (key: string, value: string) => {
        setEntries(prev => prev.map(e => e.key === key ? { ...e, value } : e));
    };

    const handleExport = () => {
        AccountRouter.export({}, (res: any) => {
            if (!res.success) return toast({ title: "导出失败", color: "danger" });
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cfrs-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: "导出成功", color: "success" });
        });
    };

    const handleImport = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                AccountRouter.import({ data }, (res: any) => {
                    if (res.success) {
                        const counts = Object.entries(res.data?.imported || {})
                            .map(([k, v]) => `${k}: ${v}`).join(", ");
                        toast({ title: `导入成功 (${counts})`, color: "success" });
                    } else {
                        toast({ title: "导入失败", color: "danger" });
                    }
                });
            } catch {
                toast({ title: "文件格式错误", color: "danger" });
            }
        };
        input.click();
    };

    const renderEditor = (e: SettingsEntry) => {
        if (e.key === "allow_register") {
            return (
                <div className="flex items-center gap-2 pt-1">
                    <Switch
                        checked={e.value === "1"}
                        onCheckedChange={(checked) => updateEntry(e.key, checked ? "1" : "0")}
                    />
                    <span className="text-muted-foreground text-sm">
                        {e.value === "1" ? "开启" : "关闭"}
                    </span>
                </div>
            );
        }
        if (e.key === "allowed_domains" || e.key === "allowed_from_domains") {
            return (
                <TagInput
                    value={e.value}
                    onChange={(v) => updateEntry(e.key, v)}
                    placeholder="输入域名后回车，如 example.com"
                />
            );
        }
        if (e.key === "resend_api_keys") {
            return <KeyValueList value={e.value} onChange={(v) => updateEntry(e.key, v)} />;
        }
        return (
            <Input
                value={e.value}
                onChange={(ev) => updateEntry(e.key, ev.target.value)}
            />
        );
    };

    // Group entries by section, keeping the section order above; only
    // sections with at least one entry become visible tabs. Keys not listed
    // anywhere land in a dynamic "其他" tab (shown only when such a key exists).
    const knownKeys = SECTIONS.flatMap((s) => s.keys);
    const grouped = SECTIONS
        .map((s) => ({
            title: s.title,
            entries: entries.filter((e) => s.keys.includes(e.key)),
        }))
        .filter((s) => s.entries.length > 0);
    const extraEntries = entries.filter((e) => !knownKeys.includes(e.key));
    if (extraEntries.length > 0) {
        grouped.push({ title: "其他", entries: extraEntries });
    }

    // Fall back to the first visible tab until the list arrives (and after
    // an unknown key leaves the active tab empty).
    const active = grouped.some((s) => s.title === activeTab) ? activeTab : (grouped[0]?.title || "");
    const current = grouped.find((s) => s.title === active) || { title: active, entries: [] as SettingsEntry[] };

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="flex w-full flex-row justify-end gap-2">
                <Button size="sm" variant="outline" onClick={handleExport}>
                    导出数据
                </Button>
                <Button size="sm" variant="outline" onClick={handleImport}>
                    导入数据
                </Button>
            </div>
            {loading ? (
                <div className="text-muted-foreground py-8 text-center">加载中...</div>
            ) : (
                <>
                    <div className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1">
                        {grouped.map(({ title }) => (
                            <button
                                key={title}
                                onClick={() => setActiveTab(title)}
                                className={cn(
                                    "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all",
                                    active === title
                                        ? "bg-background text-foreground shadow-xs"
                                        : "hover:text-foreground"
                                )}
                            >
                                {title}
                            </button>
                        ))}
                    </div>
                    <Card key={current.title}>
                        <CardHeader>
                            <CardTitle>{current.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            {current.title === "服务器" && (
                                <p className="text-muted-foreground text-xs">{ENV_ONLY_HINT}</p>
                            )}
                            {current.entries.map(e => (
                                <div key={e.key} className="flex flex-col gap-2">
                                    <Label htmlFor={`setting-${e.key}`}>
                                        {FIELD_LABELS[e.key] || e.key}
                                    </Label>
                                    {renderEditor(e)}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                    <div className="flex items-center gap-4">
                        <Button disabled={saving} onClick={handleSave}>
                            保存设置
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
