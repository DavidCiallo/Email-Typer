import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { EmailRouter } from "../../api/instance";
import { cn } from "../../lib/utils";
import { copytext } from "../../methods/text";
import { toast } from "../../methods/notify";

const STATUS_META: Record<string, { label: string; className: string }> = {
    pending: { label: "待发送", className: "bg-amber-100 text-amber-700 border-transparent" },
    sent: { label: "已发送", className: "bg-emerald-100 text-emerald-700 border-transparent" },
    failed: { label: "失败", className: "bg-red-100 text-red-700 border-transparent" },
};

const CHANNEL_LABEL: Record<string, string> = {
    resend: "Resend",
    external: "外部通道",
};

function fmtTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

const SendHistoryDialog = ({ isOpen, onOpenChange }: Props) => {
    const [list, setList] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState<any | null>(null);

    function refresh() {
        setLoading(true);
        EmailRouter.sendLogList({ limit: 50 }, (res: any) => {
            const result = res?.data || res;
            setList(result?.list || []);
            setTotal(result?.total || 0);
            setLoading(false);
        });
    }

    useEffect(() => {
        if (isOpen) {
            setDetail(null);
            refresh();
        }
    }, [isOpen]);

    function markSent(id: string) {
        EmailRouter.sendLogUpdate({ id, status: "sent" }, () => {
            toast({ title: "已标记完成", color: "success" });
            setDetail((d: any) => (d && d.id === id ? { ...d, status: "sent" } : d));
            refresh();
        });
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    {detail && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="absolute top-2 left-2 h-7 w-7 p-0"
                            onClick={() => setDetail(null)}
                        >
                            <ArrowLeft className="size-4" />
                        </Button>
                    )}
                    <DialogTitle className={cn(detail && "pl-8")}>
                        {detail ? "发件任务详情" : "发件历史"}
                    </DialogTitle>
                </DialogHeader>

                {detail ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn(STATUS_META[detail.status]?.className)}>
                                {STATUS_META[detail.status]?.label || detail.status}
                            </Badge>
                            <Badge variant="outline">{CHANNEL_LABEL[detail.channel] || detail.channel}</Badge>
                            <span className="text-muted-foreground ml-auto text-xs">ID: {detail.id}</span>
                        </div>
                        <div className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5 text-sm">
                            <span className="text-muted-foreground">发件人</span>
                            <span className="break-all">{detail.from}</span>
                            <span className="text-muted-foreground">收件人</span>
                            <span className="break-all">{detail.to}</span>
                            <span className="text-muted-foreground">主题</span>
                            <span className="break-all">{detail.subject || "（无）"}</span>
                            <span className="text-muted-foreground">时间</span>
                            <span>{fmtTime(Number(detail.create_time))}</span>
                            {detail.status === "failed" && detail.error && (
                                <>
                                    <span className="text-destructive">失败原因</span>
                                    <span className="text-destructive break-all">{detail.error}</span>
                                </>
                            )}
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-medium">HTML 内容</span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => { copytext(detail.html); toast({ title: "HTML 已复制", color: "success" }); }}
                                >
                                    复制
                                </Button>
                            </div>
                            <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap break-all">
                                {detail.html || "（空）"}
                            </pre>
                        </div>
                        {detail.status === "pending" && (
                            <Button variant="outline" onClick={() => markSent(detail.id)}>
                                标记已完成（外部通道已发送）
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {loading ? (
                            <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
                                <Loader2 className="size-4 animate-spin" />
                                加载中…
                            </div>
                        ) : list.length === 0 ? (
                            <div className="text-muted-foreground py-10 text-center text-sm">暂无发件记录</div>
                        ) : (
                            <div className="flex max-h-[55vh] flex-col divide-y overflow-y-auto">
                                {list.map((item) => {
                                    const meta = STATUS_META[item.status] || { label: item.status, className: "" };
                                    return (
                                        <div
                                            key={item.id}
                                            className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
                                            onClick={() => setDetail(item)}
                                        >
                                            <Badge variant="outline" className={cn("shrink-0", meta.className)}>
                                                {meta.label}
                                            </Badge>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate" title={item.subject}>
                                                    <span className="text-muted-foreground">{item.from}</span>
                                                    <span className="text-muted-foreground"> → </span>
                                                    {item.to}
                                                    <span className="text-muted-foreground"> · {item.subject}</span>
                                                </div>
                                                {item.status === "failed" && item.error && (
                                                    <div className="text-destructive text-xs">{item.error}</div>
                                                )}
                                            </div>
                                            <span className="text-muted-foreground w-32 shrink-0 text-xs tabular-nums">
                                                {fmtTime(Number(item.create_time))}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <span className="text-muted-foreground text-xs">共 {total} 条，点击行查看任务详情</span>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default SendHistoryDialog;
