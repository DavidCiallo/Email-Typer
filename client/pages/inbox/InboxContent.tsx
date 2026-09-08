import { useEffect, useState } from "react";
import { formatEmail, blockLabel, sourceLabel, formatSize } from "../../methods/format";
import { copytext } from "../../methods/text";
import { extractCodes } from "../../methods/verifycode";
import { toast } from "../../methods/notify";
import { downloadAttachment } from "../../methods/download";
import { EmailRouter } from "../../api/instance";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Paperclip, ShieldAlert } from "lucide-react";

interface props {
    email: any,
    isOpen: boolean,
    onOpenChange: any,
}

// ---------- Body rendering ----------
// HTML emails render as-is (their links are already proper <a> tags —
// rewriting URLs in raw HTML would corrupt attributes, e.g. GitHub mails).
// Plain-text bodies get HTML-escaped first, then URLs are linkified.

const IMG_EXT_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?|$)/i;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const CLEAN_URL_RE = /[.,;:!?)\]}>]+$/;

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Escape plain text, keep it safe as HTML, and make bare URLs clickable. */
export function linkifyText(raw: string): string {
    if (!raw) return "";
    let out = "";
    let last = 0;
    for (const m of raw.matchAll(URL_RE)) {
        const url = m[0];
        const clean = url.replace(CLEAN_URL_RE, "");
        const trailing = url.slice(clean.length);
        const start = m.index ?? 0;
        out += escapeHtml(raw.slice(last, start));
        const attr = escapeHtml(clean);
        if (IMG_EXT_RE.test(clean)) {
            out += `<img src="${attr}" alt="" style="max-width:100%;height:auto;display:block;margin:8px 0;" referrerpolicy="no-referrer" />`;
        } else {
            const jsUrl = clean.replace(/'/g, "\\'");
            out += `<a href="${attr}" target="_blank" rel="noopener noreferrer" class="text-primary break-all underline">${attr}</a>`;
            out += ` <a href="#" class="text-primary cursor-pointer text-xs underline" onclick="event.preventDefault();navigator.clipboard.writeText('${jsUrl}');this.textContent='已复制';setTimeout(()=>this.textContent='复制',1500)">复制</a>`;
        }
        out += escapeHtml(trailing);
        last = start + url.length;
    }
    out += escapeHtml(raw.slice(last));
    return out;
}

const InboxContentModal = ({
    email,
    isOpen,
    onOpenChange,
}: props) => {
    // Bodies live in the server-side eml archive — hydrate them via detail
    // on open; the list row carries metadata only.
    const [body, setBody] = useState<{ html: string; text: string } | null>(null);
    const [attachments, setAttachments] = useState<any[] | null>(null);

    // The list row only carries counts — fetch full metadata (attachment list) on open
    useEffect(() => {
        if (!isOpen || !email?.id) return;
        setAttachments(null);
        setBody(null);
        EmailRouter.detail({ id: email.id }, (data: any) => {
            const result = data?.data || data;
            const detail = result?.data || result;
            setAttachments(Array.isArray(detail?.attachments) ? detail.attachments : []);
            setBody({ html: detail?.html || "", text: detail?.text || "" });
        });
    }, [isOpen, email?.id]);

    const isHtml = !!(body?.html && String(body.html).trim());
    const bodyHtml = isHtml ? body!.html : linkifyText(body?.text || "");

    const AttachmentsSection = () => {
        if (attachments === null) return null;
        if (attachments.length === 0) return null;
        return (
            <div className="mt-3 flex flex-col items-start">
                <Badge variant="outline">附件 ({attachments.length})</Badge>
                <div className="border-border mt-2 w-full overflow-hidden rounded-lg border">
                    {attachments.map((att: any, i: number) => (
                        <div
                            key={i}
                            className="hover:bg-muted/40 flex items-center gap-2 border-border border-b px-3 py-2 last:border-b-0"
                        >
                            <Paperclip className="text-muted-foreground size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate text-sm" title={att.filename}>
                                {att.filename}
                                {att.inline && <span className="text-muted-foreground ml-1.5 text-xs">（内嵌）</span>}
                            </span>
                            <span className="text-muted-foreground shrink-0 text-xs">{formatSize(att.size)}</span>
                            {att.skipped ? (
                                <span className="text-destructive shrink-0 text-xs">超过限制未存储</span>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => downloadAttachment(email.id, i, att.filename)}
                                >
                                    下载
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const ModalBodyContent = () => {
        return (
            <div className="flex flex-col">
                <div className="flex flex-col md:flex-row md:items-center md:justify-start">
                    <div className="flex items-center gap-1.5 overflow-x-hidden">
                        <Badge variant="outline">发件人</Badge>
                        <span className="text-sm">
                            {formatEmail(email.from).name || formatEmail(email.from).email}
                        </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 overflow-x-hidden md:mt-0 md:ml-5">
                        <Badge variant="outline">收件人</Badge>
                        <span className="text-sm">
                            {formatEmail(email.to).name || formatEmail(email.to).email}
                        </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 md:mt-0 md:ml-5">
                        <Badge variant="outline">时间</Badge>
                        <span className="w-32 text-sm">
                            {new Date(Number(email.time)).toLocaleDateString() + " "}
                            {new Date(Number(email.time)).toLocaleTimeString()?.slice(0, -3)}
                        </span>
                    </div>
                    {email.source && (
                        <div className="mt-1 flex items-center gap-1.5 md:mt-0 md:ml-5">
                            <Badge variant="outline">来源</Badge>
                            <span className="text-sm">{sourceLabel(email.source)}</span>
                        </div>
                    )}
                </div>
                <div className="mt-3">
                    <div className="flex items-center gap-1.5">
                        <Badge variant="outline">标题</Badge>
                        <div className="text-sm">{email.subject}</div>
                    </div>
                    <div className="mt-3 flex flex-col items-start">
                        <Badge variant="outline">正文</Badge>
                        <div
                            className={`border-border mt-2 min-h-20 w-full overflow-auto rounded-lg border p-2 ${isHtml ? "" : "whitespace-pre-wrap break-words"}`}
                            dangerouslySetInnerHTML={{ __html: bodyHtml }}
                        />
                    </div>
                    <AttachmentsSection />
                </div>
            </div>
        )
    }

    const codes = extractCodes(body?.text, body?.html);
    const ModalFooterContent = () => {
        return (<>
            {
                codes.map((code: string) => {
                        return (
                            <Button
                                key={code} variant="secondary" size="sm"
                                onClick={() => {
                                    copytext(code);
                                    toast({ color: "success", title: `验证码：${code} 复制成功` })
                                }}
                            >
                                验证码：{code}
                            </Button>
                        )
                    })
            }
        </>)
    }
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>邮件详情</DialogTitle>
                </DialogHeader>
                {email.blocked === 1 && (
                    <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border border-destructive/20 px-3 py-2 text-sm">
                        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                        <span>
                            此邮件在收信时被安全规则拦截（{blockLabel(email.blocked_by)}：{email.block_rule}），已入库存档，未执行转发。
                        </span>
                    </div>
                )}
                <div className="overflow-y-auto">
                    <ModalBodyContent />
                </div>
                <DialogFooter>
                    <ModalFooterContent />
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};


export default InboxContentModal;
