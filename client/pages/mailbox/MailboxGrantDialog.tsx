import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { MailboxRouter } from "../../api/instance";
import { copytext } from "../../methods/text";
import { toast } from "../../methods/notify";

function fmtTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    mailbox: any | null;
}

/** Admin dialog: create / view / revoke the temporary access grant (tauth). */
const MailboxGrantDialog = ({ isOpen, onOpenChange, mailbox }: Props) => {
    const [grant, setGrant] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [days, setDays] = useState(7);
    const [note, setNote] = useState("");
    const [createdLink, setCreatedLink] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (isOpen && mailbox) {
            setGrant(null);
            setCreatedLink("");
            setDays(7);
            setNote("");
            setLoading(true);
            MailboxRouter.grantGet({ mailbox_id: mailbox.id }, (res: any) => {
                const result = res?.data || res;
                setGrant(result?.grant || null);
                setLoading(false);
            });
        }
    }, [isOpen, mailbox?.id]);

    function create() {
        if (!mailbox) return;
        setBusy(true);
        MailboxRouter.grantCreate({ mailbox_id: mailbox.id, days, note }, (res: any) => {
            setBusy(false);
            if (!res.success) return toast({ title: res.message || "生成失败", color: "danger" });
            const result = res?.data || res;
            setGrant(result.grant);
            setCreatedLink(`${location.origin}/tauth=${result.token}`);
            toast({ title: "授权链接已生成", color: "success" });
        });
    }

    function revoke() {
        if (!grant) return;
        MailboxRouter.grantRevoke({ id: grant.id }, () => {
            toast({ title: "授权已吊销", color: "primary" });
            setGrant(null);
            setCreatedLink("");
        });
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>临时授权 — {mailbox?.address}</DialogTitle>
                </DialogHeader>
                {loading ? (
                    <p className="text-muted-foreground text-sm">加载中…</p>
                ) : grant ? (
                    <div className="flex flex-col gap-3 text-sm">
                        <p className="text-muted-foreground">
                            有效窗口：{fmtTime(grant.start_time)} ~ {fmtTime(grant.end_time)}
                        </p>
                        {createdLink ? (
                            <div className="bg-muted flex items-center gap-2 rounded-md px-3 py-2">
                                <code className="flex-1 truncate font-mono text-xs">{createdLink}</code>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { copytext(createdLink); toast({ title: "链接已复制", color: "success" }); }}
                                >
                                    复制
                                </Button>
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-xs">
                                授权链接仅在生成时展示一次（出于安全存储哈希），如需再次分发请吊销后重新生成。
                            </p>
                        )}
                        <p className="text-muted-foreground text-xs">
                            持有者在窗口内可查看该邮箱的收信与发件记录、以该邮箱发信、配置临时转发策略；吊销后立即失效，临时策略自动停用。
                        </p>
                        <DialogFooter>
                            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={revoke}>
                                吊销授权
                            </Button>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 text-sm">
                        <div className="flex flex-col gap-2">
                            <Label>有效期（天）</Label>
                            <div className="flex items-center gap-2">
                                {[1, 3, 7, 30].map((d) => (
                                    <Button
                                        key={d}
                                        size="sm"
                                        variant={days === d ? "default" : "outline"}
                                        onClick={() => setDays(d)}
                                    >
                                        {d} 天
                                    </Button>
                                ))}
                                <Input
                                    type="number"
                                    min={1}
                                    className="w-24"
                                    value={days}
                                    onChange={(e) => setDays(Number(e.target.value) || 0)}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="grant-note">备注</Label>
                            <Input
                                id="grant-note"
                                placeholder="授权给谁、用途（可选）"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                        <p className="text-muted-foreground text-xs">
                            生成后得到一条 tauth 链接，持有者在有效期内可查看该邮箱窗口开启之后的收信与发件记录、以该邮箱发信、配置临时转发策略；窗口之前的旧邮件不可见。
                        </p>
                        <DialogFooter>
                            <Button onClick={create} disabled={busy || days <= 0}>生成授权链接</Button>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default MailboxGrantDialog;
