import { useEffect, useState } from "react";
import { MailboxRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { toast } from "../../methods/notify";

export interface ProviderPreset {
    key: string;
    label: string;
    host: string;
    port: number;
    tls: boolean;
    authHint: string;
}

const TYPE_LABEL: Record<string, string> = {
    catchall: "本地地址",
    api: "API 推送",
    imap: "IMAP 同步",
};

const MailboxFormModal = (params: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    editing: any | null;
    domains: string[];
    providers: ProviderPreset[];
    onSaved: (row: any) => void;
}) => {
    const { isOpen, onOpenChange, editing, domains, providers, onSaved } = params;

    const [formType, setFormType] = useState("catchall");
    const [formName, setFormName] = useState("");
    const [formLocal, setFormLocal] = useState("");
    const [formDomain, setFormDomain] = useState("");
    const [formAddress, setFormAddress] = useState("");
    const [formProvider, setFormProvider] = useState("163");
    const [formPassword, setFormPassword] = useState("");
    const [formHost, setFormHost] = useState("");
    const [formPort, setFormPort] = useState(993);
    const [formTls, setFormTls] = useState(true);
    const [formInterval, setFormInterval] = useState(0);
    const [formNote, setFormNote] = useState("");
    const [formForward, setFormForward] = useState(false);
    const [testing, setTesting] = useState(false);

    const preset = providers.find((p) => p.key === formProvider);

    // (Re)initialize the form whenever the dialog opens
    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            const [local, domain] = String(editing.address || "").split("@");
            setFormType(editing.type);
            setFormName(editing.name || "");
            setFormLocal(local || "");
            setFormDomain(domain || "");
            setFormAddress(editing.address || "");
            setFormProvider(editing.provider || "custom");
            setFormPassword("");
            setFormHost(editing.imap_host || "");
            setFormPort(editing.imap_port || 993);
            setFormTls(editing.imap_tls !== 0);
            setFormInterval(editing.sync_interval || 0);
            setFormNote(editing.note || "");
            setFormForward(editing.forward_enabled === 1);
        } else {
            setFormType("catchall");
            setFormName("");
            setFormLocal("");
            setFormDomain(domains[0] || "");
            setFormAddress("");
            setFormProvider("163");
            setFormPassword("");
            setFormHost("");
            setFormPort(993);
            setFormTls(true);
            setFormInterval(0);
            setFormNote("");
            setFormForward(false);
        }
    }, [isOpen, editing]);

    function applyProvider(key: string) {
        setFormProvider(key);
        const p = providers.find((x) => x.key === key);
        if (p && p.host) {
            setFormHost(p.host);
            setFormPort(p.port);
            setFormTls(p.tls);
        }
    }

    function buildAddress(): string {
        if (formType !== "catchall") return formAddress.trim().toLowerCase();
        return `${formLocal.trim().toLowerCase()}@${(formDomain || "").trim().toLowerCase()}`;
    }

    function buildPayload() {
        const address = buildAddress();
        const mailbox: any = {
            type: formType,
            address,
            name: formName.trim(),
            note: formNote.trim(),
        };
        if (formType === "imap") {
            mailbox.provider = formProvider;
            mailbox.imap_host = formHost.trim();
            mailbox.imap_port = Number(formPort) || 993;
            mailbox.imap_tls = formTls ? 1 : 0;
            mailbox.sync_interval = Number(formInterval) || 0;
            if (formPassword) mailbox.password = formPassword;
        }
        if (formType !== "catchall") {
            mailbox.forward_enabled = formForward ? 1 : 0;
        }
        return mailbox;
    }

    function validate(): string | null {
        if (formType === "imap") {
            if (!/^([^\s@]+)@([^\s@]+)$/.test(formAddress.trim())) return "请填写完整的外部邮箱地址";
            if (!formHost.trim()) return "请填写 IMAP 服务器地址";
            if (!editing && !formPassword) return "请填写授权码";
            return null;
        }
        if (formType === "api") {
            if (!/^([^\s@]+)@([^\s@]+)$/.test(formAddress.trim())) return "请填写完整的推送地址（任意域名均可，如 ci@yeah.net）";
            return null;
        }
        if (!formLocal.trim()) return "请填写地址名称";
        if (!formDomain) return "请选择域名";
        return null;
    }

    function submitSave() {
        const err = validate();
        if (err) return toast({ title: err, color: "danger" });

        const body: any = { mailbox: buildPayload() };
        if (editing) body.id = editing.id;

        MailboxRouter.save(body, (data: any) => {
            toast({ title: editing ? "修改成功" : "创建成功", color: "primary" });
            onOpenChange(false);
            const result = data?.data?.data || data?.data || data;
            onSaved(result);
        });
    }

    function submitTest() {
        const err = validate();
        if (err) return toast({ title: err, color: "danger" });
        if (formType !== "imap") return;

        const mailbox = buildPayload();
        setTesting(true);
        MailboxRouter.test(
            {
                provider: mailbox.provider,
                imap_host: mailbox.imap_host,
                imap_port: mailbox.imap_port,
                imap_tls: mailbox.imap_tls,
                address: mailbox.address,
                password: mailbox.password || "",
            },
            (data: any) => {
                setTesting(false);
                const result = data?.data?.data || data?.data || data;
                if (result?.ok) {
                    toast({ title: result.message || "连接成功", color: "success" });
                } else {
                    toast({ title: result?.message || "连接失败", color: "danger" });
                }
            },
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>{editing ? "编辑邮箱" : "新建邮箱"}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label>邮箱类型</Label>
                        <Select
                            value={formType}
                            onValueChange={setFormType}
                            disabled={!!editing}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(TYPE_LABEL).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs">
                            {formType === "catchall" && "本地域名下的地址，邮件即来即收。"}
                            {formType === "api" && "登记一个供外部系统推送邮件的目标地址；域名可任填（如 yeah.net）。"}
                            {formType === "imap" && "凭服务商授权码，定时同步网易 / QQ 等外部邮箱的收件箱。"}
                        </p>
                    </div>

                    {formType === "imap" ? (
                        <>
                            <div className="flex flex-col gap-2">
                                <Label>服务商</Label>
                                <Select value={formProvider} onValueChange={applyProvider} disabled={!!editing}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="选择服务商" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {providers.map((p) => (
                                            <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {preset?.authHint && (
                                    <p className="text-muted-foreground text-xs">{preset.authHint}</p>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>邮箱地址</Label>
                                <Input
                                    placeholder="someone@163.com"
                                    value={formAddress}
                                    onChange={(e) => setFormAddress(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>授权码 {editing && <span className="text-muted-foreground">(留空则保持不变)</span>}</Label>
                                <Input
                                    type="password"
                                    placeholder={editing ? "不修改请留空" : "服务商生成的授权码"}
                                    value={formPassword}
                                    onChange={(e) => setFormPassword(e.target.value)}
                                />
                            </div>
                            <details className="rounded-lg border px-3 py-2">
                                <summary className="text-muted-foreground cursor-pointer text-sm">高级设置</summary>
                                <div className="mt-3 flex flex-col gap-3">
                                    <div className="flex gap-2">
                                        <div className="flex flex-1 flex-col gap-1.5">
                                            <Label htmlFor="mb-host">服务器</Label>
                                            <Input id="mb-host" placeholder="imap.example.com" value={formHost} onChange={(e) => setFormHost(e.target.value)} />
                                        </div>
                                        <div className="flex w-28 flex-col gap-1.5">
                                            <Label htmlFor="mb-port">端口</Label>
                                            <Input id="mb-port" type="number" value={formPort} onChange={(e) => setFormPort(Number(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="mb-tls">TLS (993 端口需开启)</Label>
                                        <Switch id="mb-tls" checked={formTls} onCheckedChange={setFormTls} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="mb-interval">同步间隔（秒，0 为默认 60s）</Label>
                                        <Input id="mb-interval" type="number" min={0} value={formInterval} onChange={(e) => setFormInterval(Number(e.target.value))} />
                                    </div>
                                </div>
                            </details>
                        </>
                    ) : formType === "api" ? (
                        <div className="flex flex-col gap-2">
                            <Label>推送地址</Label>
                            <Input
                                placeholder="ci@yeah.net"
                                value={formAddress}
                                onChange={(e) => setFormAddress(e.target.value)}
                            />
                            <p className="text-muted-foreground text-xs">
                                域名可任填，仅用于区分这批推送邮件的归属。
                            </p>
                        </div>
                    ) : formType === "catchall" ? (
                        <div className="flex flex-col gap-2">
                            <Label>地址</Label>
                            <div className="flex gap-2">
                                <Input
                                    className="flex-1"
                                    placeholder="localpart"
                                    value={formLocal}
                                    onChange={(e) => setFormLocal(e.target.value)}
                                />
                                <span className="text-muted-foreground flex items-center">@</span>
                                <Select value={formDomain} onValueChange={setFormDomain}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="选择域名" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {domains.map((d) => (
                                            <SelectItem key={d} value={d}>{d}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {domains.length === 0 && (
                                <p className="text-destructive text-xs">尚未发现可接收的域名：请先在「系统设置 → 注册与域名」里配置，或确认收信目录中已有该域名的邮件。</p>
                            )}
                            <p className="text-muted-foreground text-xs">
                                只能选择系统实际接收的域名，地址名可自定义。
                            </p>
                        </div>
                    ) : null}

                    {formType !== "catchall" && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                            <div className="min-w-0">
                                <Label htmlFor="mb-forward">参与策略转发</Label>
                                    <p className="text-muted-foreground mt-0.5 text-xs">
                                        默认导入邮件仅留存不外发；开启后才会命中策略转发。
                                    </p>
                            </div>
                            <Switch id="mb-forward" checked={formForward} onCheckedChange={setFormForward} />
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="mb-name">显示名称（可选）</Label>
                        <Input id="mb-name" placeholder="默认使用地址" value={formName} onChange={(e) => setFormName(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="mb-note">备注（可选）</Label>
                        <Input id="mb-note" placeholder="备注说明" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    {formType === "imap" && (
                        <Button variant="secondary" onClick={submitTest} disabled={testing}>
                            {testing ? "测试中…" : "测试连接"}
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={submitSave}>保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default MailboxFormModal;
