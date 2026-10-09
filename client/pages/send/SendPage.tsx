import { useEffect, useState } from "react";
import { EmailRouter, MailboxRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { X, Paperclip, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "../../methods/notify";
import { textColor } from "../../methods/text";
import { inTauthSession } from "../../methods/tauth";
import SendHistoryDialog from "./SendHistoryDialog";

/** Searchable sender picker over the managed mailboxes. */
function SenderSelect({ value, options, onChange }: {
    value: string;
    options: string[];
    onChange: (addr: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const filtered = options.filter((a) => a.toLowerCase().includes(q.trim().toLowerCase()));

    return (
        <div className="relative md:w-80">
            <Button
                type="button"
                variant="outline"
                className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
                onClick={() => { setOpen(!open); setQ(""); }}
            >
                {value || "选择发件邮箱"}
                <ChevronDown className="size-4 opacity-50" />
            </Button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="bg-popover absolute z-50 mt-1 w-full rounded-md border shadow-md">
                        <div className="p-2 pb-0">
                            <Input autoFocus placeholder="搜索邮箱…" value={q} onChange={(e) => setQ(e.target.value)} />
                        </div>
                        <div className="max-h-60 overflow-y-auto p-1">
                            {filtered.length === 0 ? (
                                <div className="text-muted-foreground py-4 text-center text-sm">没有匹配的邮箱</div>
                            ) : (
                                filtered.map((addr) => (
                                    <button
                                        key={addr}
                                        type="button"
                                        className={cn(
                                            "hover:bg-muted w-full rounded-sm px-3 py-2 text-left text-sm",
                                            addr === value && "bg-muted font-medium",
                                        )}
                                        onClick={() => { onChange(addr); setOpen(false); }}
                                    >
                                        {addr}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/** Type a query, or tick addresses from the pool filtered by address/tag/note. */
function RecipientPicker({ value, options, onChange }: {
    value: string[];
    options: any[];
    onChange: (list: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const query = q.trim().toLowerCase();

    function add(addr: string) {
        const a = addr.trim().toLowerCase();
        if (!a || value.includes(a)) return;
        onChange([...value, a]);
    }

    const filtered = options.filter((o) => {
        if (value.includes(o.address)) return false;
        if (!query) return true;
        return o.address.toLowerCase().includes(query)
            || (o.labels || []).some((l: string) => l.toLowerCase().includes(query))
            || (o.note || "").toLowerCase().includes(query);
    }).slice(0, 50);

    function pick(addr: string) {
        add(addr);
        setQ("");
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
                {value.map((addr) => (
                    <span key={addr} className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                        {/* keep the native email keyboard/validation on the chip input */}
                        <input
                            className="pointer-events-none w-0 border-0 bg-transparent p-0"
                            tabIndex={-1}
                            value={addr}
                            readOnly
                        />
                        <span className="max-w-48 truncate">{addr}</span>
                        <button type="button" aria-label={`移除 ${addr}`} onClick={() => onChange(value.filter((a) => a !== addr))}>
                            <X className="size-3.5" />
                        </button>
                    </span>
                ))}
                <div className="relative min-w-40 flex-1">
                    <Input
                        id="send-to"
                        className="border-0 px-1.5 shadow-none focus-visible:ring-0"
                        placeholder={value.length ? "继续添加收件人…" : "搜索或输入收件人邮箱…"}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onFocus={() => setOpen(true)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                if (filtered.length > 0 && query) { pick(filtered[0].address); return; }
                                if (query.includes("@")) { add(query); setQ(""); }
                            }
                            if (e.key === "Backspace" && !q && value.length) {
                                onChange(value.slice(0, -1));
                            }
                        }}
                    />
                </div>
            </div>
            {open && (
                <div className="bg-popover max-h-56 overflow-y-auto rounded-md border shadow-md">
                    {filtered.length === 0 ? (
                        <div className="text-muted-foreground py-4 text-center text-sm">
                            {query.includes("@") ? `回车添加 ${query}` : "没有匹配的收件人"}
                        </div>
                    ) : (
                        filtered.map((o) => (
                            <button
                                key={o.address}
                                type="button"
                                className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                                onClick={() => pick(o.address)}
                            >
                                <span className="min-w-0 flex-1 truncate">{o.address}</span>
                                {(o.labels || []).length > 0 && (
                                    <span className="flex shrink-0 gap-1">
                                        {o.labels.map((l: string) => (
                                            <Badge key={l} variant="outline" className="text-[10px]" style={textColor(l)}>{l}</Badge>
                                        ))}
                                    </span>
                                )}
                                {o.note && <span className="text-muted-foreground max-w-32 shrink-0 truncate text-xs">{o.note}</span>}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

const SenderPage = () => {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState<string[]>([]);
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("");
    const [justSend, setJustSend] = useState(false);
    const [senders, setSenders] = useState<string[]>([]);
    const [recipientPool, setRecipientPool] = useState<any[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [sendBlocked, setSendBlocked] = useState(false);

    function addFiles(list: FileList | null) {
        if (!list) return;
        setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
    }

    function fileToBase64(f: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = reject;
            reader.readAsDataURL(f);
        });
    }

    useEffect(() => {
        if (inTauthSession()) {
            // 临时授权会话：发件人锁定为被授权的邮箱
            MailboxRouter.tauthInfo({}, (res: any) => {
                const info = res?.data || res;
                if (info?.address) {
                    setSenders([info.address]);
                    setFrom(info.address);
                }
                setSendBlocked(info?.can_send !== 1);
            });
            return;
        }
        // 发信只能用已管理的邮箱地址
        MailboxRouter.list({}, (res: any) => {
            const result = res?.data || res;
            const list = result?.list || [];
            // server already returns newest-created first
            setSenders(list.map((b: any) => b.address));
        });
        MailboxRouter.recipients({}, (res: any) => {
            const result = res?.data || res;
            setRecipientPool(result?.list || []);
        });
    }, [])

    async function sendEmail() {
        if (sendBlocked) return toast({ title: "该授权不允许发信", color: "danger" });
        if (!from) return toast({ title: "请选择发件邮箱", color: "danger" });
        if (to.length === 0) return toast({ title: "请填写收件人", color: "danger" });
        if (to.some((a) => !a.includes("@"))) return toast({ title: "请填写正确的邮箱地址", color: "danger" });
        if (!subject.length) return toast({ title: "请填写邮件标题", color: "danger" });
        if (!html.length) return toast({ title: "请填写邮件内容", color: "danger" });
        if (justSend) return toast({ title: "发送频率过高，请稍等", color: "danger" });
        setJustSend(true);
        // one message per recipient: the server paces them, so allow for the gap
        setTimeout(() => setJustSend(false), to.length * 1100 + 3000);
        const attachments = await Promise.all(files.map(async (f) => ({
            filename: f.name,
            content: await fileToBase64(f),
        })));
        EmailRouter.send({ email: { from, to, subject, html, attachments } }, (res: any) => {
            if (res.success) {
                const result = res.data || {};
                const failed = result.failed || 0;
                const label = `${result.total ?? to.length} 个收件人`;
                toast({
                    title: failed === 0
                        ? (result.status === "pending" ? `${label}已存入发件历史，等待外部通道发送` : `${label}发送成功`)
                        : `${label}：成功 ${result.sent ?? 0}，失败 ${failed}`,
                    description: failed > 0 ? result.errors?.join("；") : undefined,
                    color: failed === 0 ? "success" : "warning",
                });
                setTo([]);
                setSubject("");
                setHtml("");
                setFiles([]);
            } else {
                toast({ title: res.message || "发送失败", color: "danger" });
            }
        })
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <Card>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 md:flex-row">
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="send-to">收件人</Label>
                            <RecipientPicker value={to} options={recipientPool} onChange={setTo} />
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="send-subject">主题</Label>
                            <Input
                                id="send-subject"
                                placeholder="请输入主题"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="send-content">内容</Label>
                        <Textarea
                            id="send-content"
                            placeholder="请输入内容"
                            value={html}
                            rows={10}
                            className="min-h-[270px] field-sizing-fixed"
                            onChange={(e) => setHtml(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>
            <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer">
                    <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                    />
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
                        <Paperclip className="size-4" />
                        添加附件
                    </span>
                </label>
                {files.map((f, idx) => (
                    <span key={`${f.name}-${idx}`} className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                        <Paperclip className="size-3" />
                        <span className="max-w-48 truncate">{f.name}</span>
                        <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => setFiles(files.filter((_, i) => i !== idx))} aria-label="移除附件">
                            <X className="size-3.5" />
                        </button>
                    </span>
                ))}
            </div>

            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between">
                <Button variant="outline" onClick={() => setHistoryOpen(true)} className="md:w-32">
                    查看历史
                </Button>
                <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
                    <SenderSelect value={from} options={senders} onChange={setFrom} />
                    <Button onClick={sendEmail} disabled={justSend || sendBlocked} className="md:w-32">
                        {sendBlocked ? "禁止发信" : "发送邮件"}
                    </Button>
                </div>
            </div>

            <SendHistoryDialog isOpen={historyOpen} onOpenChange={setHistoryOpen} />

        </div>
    )
};


export default SenderPage;
