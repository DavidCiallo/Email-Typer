import { useEffect, useState } from "react";
import { EmailRouter, MailboxRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { ChevronDown, Paperclip, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "../../methods/notify";
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

const SenderPage = () => {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("");
    const [justSend, setJustSend] = useState(false);
    const [senders, setSenders] = useState<string[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [files, setFiles] = useState<File[]>([]);

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
            });
            return;
        }
        // 发信只能用已管理的邮箱地址
        MailboxRouter.list({}, (res: any) => {
            const result = res?.data || res;
            const list = result?.list || [];
            setSenders(list.map((b: any) => b.address).sort());
        });
    }, [])

    async function sendEmail() {
        if (!from) return toast({ title: "请选择发件邮箱", color: "danger" });
        if (to.length < 2 || !to.includes("@")) return toast({ title: "请填写正确的邮箱地址", color: "danger" });
        if (!subject.length) return toast({ title: "请填写邮件标题", color: "danger" });
        if (!html.length) return toast({ title: "请填写邮件内容", color: "danger" });
        if (justSend) return toast({ title: "发送频率过高，请稍等", color: "danger" });
        setJustSend(true);
        setTimeout(() => setJustSend(false), 5000);
        const attachments = await Promise.all(files.map(async (f) => ({
            filename: f.name,
            content: await fileToBase64(f),
        })));
        EmailRouter.send({ email: { from, to, subject, html, attachments } }, (res: any) => {
            if (res.success) {
                toast({
                    title: res.data?.status === "pending" ? "已存入发件历史，等待外部通道发送" : "发送成功",
                    color: "success",
                });
                setTo("");
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
                            <Input
                                id="send-to"
                                placeholder="请输入邮箱"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                            />
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
                    <Button onClick={sendEmail} disabled={justSend} className="md:w-32">
                        发送邮件
                    </Button>
                </div>
            </div>

            <SendHistoryDialog isOpen={historyOpen} onOpenChange={setHistoryOpen} />

        </div>
    )
};


export default SenderPage;
