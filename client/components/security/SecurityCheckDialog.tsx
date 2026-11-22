import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { SecurityRouter, StrategyRouter } from "../../api/instance";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../../components/ui/dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { toast } from "../../methods/notify";

function fmtTime(ts: number) {
    if (!ts) return "-";
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function actionLabel(action: string) {
    if (action === "send") return "转发";
    if (action === "webhook") return "回调";
    if (action === "archive") return "归档";
    return action;
}

/**
 * 四步人工解锁：看触发详情 → 逐条审查策略 → 勾选确认 + 输入密码 → 解除。
 * 熔断后不允许自动恢复，所以这个弹窗是唯一的出口。
 */
export default function SecurityCheckDialog(params: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUnlocked?: () => void;
}) {
    const { open, onOpenChange, onUnlocked } = params;
    const [loading, setLoading] = useState(false);
    const [locked, setLocked] = useState(false);
    const [event, setEvent] = useState<any>(null);
    const [reviews, setReviews] = useState<any[]>([]);
    const [fullRows, setFullRows] = useState<Record<string, any>>({});
    const [confirmed, setConfirmed] = useState(false);
    const [trust, setTrust] = useState(true);
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setConfirmed(false);
        setPassword("");
        setTrust(true);
        setLoading(true);
        SecurityRouter.lockStatus({}, (res: any) => {
            const data = res?.data || res;
            setLocked(!!data?.locked);
            setEvent(data?.event || null);
            setReviews(data?.reviews || []);
            setLoading(false);
        });
        // 审查列表里要提供「停用」按钮，需要一个能回写的完整策略对象
        StrategyRouter.list({}, (res: any) => {
            const list = res?.data?.list || [];
            const map: Record<string, any> = {};
            for (const row of list) map[row.id] = row;
            setFullRows(map);
        });
    }, [open]);

    function disableStrategy(id: string) {
        const full = fullRows[id];
        if (!full) {
            toast({ title: "无法停用", description: "该策略已被删除，或列表尚未加载完成", color: "danger" });
            return;
        }
        StrategyRouter.save({ strategy: { ...full, enabled: 0 } }, (res: any) => {
            if (res?.success === false) {
                toast({ title: "停用失败", description: res?.message || "", color: "danger" });
                return;
            }
            toast({ title: "已停用", description: "该策略不会再匹配新邮件", color: "success" });
            setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: 0 } : r)));
        });
    }

    function submit() {
        if (!confirmed || !password) return;
        setSubmitting(true);
        SecurityRouter.unlock({ password, confirmed, trust_ruleset: trust }, (res: any) => {
            setSubmitting(false);
            if (res?.success === false) {
                toast({ title: "解除失败", description: res?.message || "请检查密码", color: "danger" });
                return;
            }
            toast({ title: "已解除限制", description: "新到的邮件会恢复正常转发", color: "success" });
            setPassword("");
            onOpenChange(false);
            onUnlocked?.();
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
                showCloseButton={false}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="size-5 text-red-500" />
                        安全检查
                    </DialogTitle>
                </DialogHeader>

                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    转发已自动暂停。正常情况下不会出现这个提示，说明有一封邮件同时命中了过多条转发策略。
                </div>

                {loading ? (
                    <div className="text-muted-foreground py-6 text-center text-sm">加载中…</div>
                ) : (
                    <>
                        <div className="flex flex-col gap-1 text-sm">
                            <div>
                                <span className="text-muted-foreground">触发邮件：</span>
                                {event?.subject || "（已删除）"}
                            </div>
                            <div className="text-muted-foreground text-xs">
                                {event?.from || "-"} · {fmtTime(Number(event?.create_time || 0))}
                            </div>
                            <div>
                                <span className="text-muted-foreground">命中策略：</span>
                                <span className="font-semibold text-red-600">{event?.hit_count ?? 0}</span> 条
                            </div>
                        </div>

                        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                            {reviews.length === 0 ? (
                                <div className="text-muted-foreground py-4 text-center text-sm">没有可审查的策略</div>
                            ) : (
                                reviews.map((r) => (
                                    <div
                                        key={r.id}
                                        className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5 text-sm">
                                                <span className="truncate font-medium">{r.name || r.id}</span>
                                                <Badge variant="outline" className="shrink-0">
                                                    {actionLabel(r.action)}
                                                </Badge>
                                                <span className="text-muted-foreground truncate font-mono text-xs">
                                                    {r.from_pattern || "*"} → {r.forward_to || r.webhook_url || "-"}
                                                </span>
                                            </div>
                                            <div className="text-muted-foreground mt-0.5 text-xs">
                                                创建于 {fmtTime(Number(r.create_time || 0))}
                                            </div>
                                            {r.hints?.length > 0 && (
                                                <div
                                                    className={
                                                        r.risk === "high"
                                                            ? "mt-1 text-xs font-medium text-red-600"
                                                            : "mt-1 text-xs text-amber-600"
                                                    }
                                                >
                                                    {r.risk === "high" ? "⚠ " : "· "}
                                                    {r.hints.join(" · ")}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="shrink-0"
                                            onClick={() => disableStrategy(r.id)}
                                        >
                                            停用
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex flex-col gap-3 border-t pt-3">
                            <label className="flex items-start gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="accent-primary mt-0.5 size-4 shrink-0"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                />
                                <span>我已检查上述策略，确认均为我本人添加</span>
                            </label>
                            <label className="text-muted-foreground flex items-start gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="accent-primary mt-0.5 size-4 shrink-0"
                                    checked={trust}
                                    onChange={(e) => setTrust(e.target.checked)}
                                />
                                <span>
                                    信任当前规则配置（规则不变时，同样的命中只警告、不再熔断）
                                </span>
                            </label>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="security-password">管理员密码</Label>
                                <Input
                                    id="security-password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="用于二次确认"
                                />
                            </div>
                        </div>
                    </>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        稍后处理
                    </Button>
                    <Button
                        disabled={!confirmed || !password || submitting || !locked}
                        onClick={submit}
                    >
                        <ShieldCheck className="size-4" />
                        {submitting ? "解除中…" : "解除限制并恢复转发"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
