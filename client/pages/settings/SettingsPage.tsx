import { Header } from "../../components/header/Header";
import { useEffect, useState } from "react";
import { SettingsRouter, AccountRouter } from "../../api/instance";
import { SettingsEntry } from "../../../shared/modules/settings/settings.interface";
import { Button, Card, CardBody, Input } from "@heroui/react";
import { toast } from "../../methods/notify";

const FIELD_LABELS: Record<string, string> = {
    allow_register: "允许注册（1=开启, 0=关闭）",
    resend_api_key: "Resend API Key（默认）",
    resend_api_keys: "Resend API Keys（多域名，格式：domain1:key1,domain2:key2）",
    allowed_domains: "允许注册的域名",
    allowed_from_domains: "允许发件的域名",
    client_url: "客户端地址",
};

export default function SettingsPage() {
    const [entries, setEntries] = useState<SettingsEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

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
                toast({ title: "保存成功", color: "primary" });
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
            toast({ title: "导出成功", color: "primary" });
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
                        toast({ title: `导入成功 (${counts})`, color: "primary" });
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

    return (
        <div className="max-w-screen">
            <Header name="系统设置" />
            <div className="w-full flex flex-col flex-wrap px-[5vw] pt-6">
                <div className="w-full flex flex-row justify-end items-center mb-4 gap-2">
                    <Button size="sm" color="primary" variant="bordered" onPress={handleExport}>
                        导出数据
                    </Button>
                    <Button size="sm" color="warning" variant="bordered" onPress={handleImport}>
                        导入数据
                    </Button>
                </div>
                {loading ? (
                    <div className="text-center text-gray-400 py-8">加载中...</div>
                ) : (
                    <>
                        <Card>
                            <CardBody className="flex flex-col gap-4">
                                {entries.map(e => (
                                    <div key={e.key} className="flex flex-col gap-1">
                                        <label className="text-sm font-medium text-gray-600">
                                            {FIELD_LABELS[e.key] || e.key}
                                        </label>
                                        <Input
                                            size="sm"
                                            variant="bordered"
                                            value={e.value}
                                            onValueChange={(val) => updateEntry(e.key, val)}
                                        />
                                    </div>
                                ))}
                            </CardBody>
                        </Card>
                        <div className="flex items-center gap-4 mt-4">
                            <Button size="sm" color="primary" isLoading={saving} onPress={handleSave}>
                                保存设置
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
