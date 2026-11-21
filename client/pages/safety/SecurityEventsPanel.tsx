import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";

import { SecurityRouter } from "../../api/instance";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/utils";

const KIND_META: Record<string, { label: string; className: string }> = {
    forward_burst: { label: "转发警告", className: "bg-amber-100 text-amber-700 border-transparent" },
    forward_lock: { label: "熔断锁定", className: "bg-red-100 text-red-700 border-transparent" },
    forward_unlock: { label: "人工解除", className: "bg-emerald-100 text-emerald-700 border-transparent" },
    ruleset_trust: { label: "规则信任", className: "bg-sky-100 text-sky-700 border-transparent" },
};

const KIND_FILTERS = [
    { value: "all", label: "全部类型" },
    { value: "forward_burst", label: "转发警告" },
    { value: "forward_lock", label: "熔断锁定" },
    { value: "forward_unlock", label: "人工解除" },
    { value: "ruleset_trust", label: "规则信任" },
];

function fmtTime(ts: number) {
    if (!ts) return "-";
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 安全事件：谁在什么时候触发熔断、谁解除的，全部可查。 */
export default function SecurityEventsPanel() {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState("all");
    const [list, setList] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    function fetchList() {
        setLoading(true);
        SecurityRouter.events({ kind: kind === "all" ? "" : kind, limit: 50 }, (res: any) => {
            const data = res?.data || res;
            setList(data?.list || []);
            setTotal(data?.total || 0);
            setLoading(false);
        });
    }

    useEffect(() => {
        if (open) fetchList();
    }, [open, kind]);

    return (
        <div className="flex flex-col gap-2">
            <button
                className="flex w-full items-center gap-2 border-t pt-4 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <ShieldAlert className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">安全事件</span>
                <span className="text-muted-foreground text-xs">熔断、解除与规则信任的审计记录</span>
            </button>

            {open && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Select value={kind} onValueChange={setKind}>
                            <SelectTrigger className="h-8 w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {KIND_FILTERS.map((f) => (
                                    <SelectItem key={f.value} value={f.value}>
                                        {f.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-muted-foreground text-xs">共 {total} 条</span>
                        <Button size="sm" variant="outline" className="ml-auto" onClick={fetchList}>
                            刷新
                        </Button>
                    </div>

                    <div className="overflow-hidden rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-36">时间</TableHead>
                                    <TableHead className="w-24">类型</TableHead>
                                    <TableHead className="w-20">命中</TableHead>
                                    <TableHead className="w-20">外发</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead className="w-28">操作人</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-muted-foreground h-16 text-center text-sm">
                                            加载中…
                                        </TableCell>
                                    </TableRow>
                                ) : list.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-muted-foreground h-16 text-center text-sm">
                                            暂无安全事件
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    list.map((row) => {
                                        const meta = KIND_META[row.kind] || {
                                            label: row.kind,
                                            className: "",
                                        };
                                        return (
                                            <TableRow key={row.id}>
                                                <TableCell className="text-muted-foreground text-xs tabular-nums">
                                                    {fmtTime(Number(row.create_time))}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn("shrink-0", meta.className)}>
                                                        {meta.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    {row.kind === "ruleset_trust" ? "-" : row.hit_count}
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    {row.kind === "ruleset_trust" ? "-" : row.send_count}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {row.status === "open" ? (
                                                        <span className="font-medium text-red-600">待处理</span>
                                                    ) : (
                                                        <span className="text-muted-foreground">已处理</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {row.acked_by_name || row.acked_by || "-"}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
}
