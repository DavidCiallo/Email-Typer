import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Pagination } from "../../components/ui/pagination";
import { EmailRouter } from "../../api/instance";
import { formatEmail, blockLabel } from "../../methods/format";

const PAGE_SIZE = 20;

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onRestore: (id: string) => void;
    onOpen: (email: any) => void;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

/** Two-step destructive button: first click arms it, second click fires, blur resets. */
function ConfirmPurgeButton({ onConfirm }: { onConfirm: () => void }) {
    const [armed, setArmed] = useState(false);
    return (
        <Button
            size="sm"
            variant={armed ? "destructive" : "outline"}
            className="shrink-0"
            title="彻底删除（不可恢复）"
            onClick={(e) => {
                e.stopPropagation();
                if (armed) {
                    setArmed(false);
                    onConfirm();
                } else {
                    setArmed(true);
                }
            }}
            onBlur={() => setArmed(false)}
        >
            <Trash2 className="size-3.5" />
            {armed ? "确认删除" : "彻底删除"}
        </Button>
    );
}

const ArchivedDialog = ({ isOpen, onOpenChange, onRestore, onOpen }: Props) => {
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [list, setList] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [purging, setPurging] = useState(false);
    const [armed, setArmed] = useState(false);
    // Prefetched pages so flipping to the next page renders instantly
    const cacheRef = useRef(new Map<number, any>());
    const inflightRef = useRef(new Set<number>());

    function apply(result: any) {
        setList(result.list || []);
        setTotal(result.total || 0);
        setLoading(false);
    }

    function prefetch(page: number) {
        const next = page + 1;
        if (cacheRef.current.has(next) || inflightRef.current.has(next)) return;
        inflightRef.current.add(next);
        EmailRouter.list({ archived: true, offset: next * PAGE_SIZE - PAGE_SIZE, limit: PAGE_SIZE }, (data: any) => {
            inflightRef.current.delete(next);
            cacheRef.current.set(next, data.data || data);
        });
    }

    function fetchPage(p: number, { cache = true, silent = false } = {}) {
        const cached = cacheRef.current.get(p);
        if (cache && cached) {
            apply(cached);
            prefetch(p);
            return;
        }
        if (inflightRef.current.has(p)) return;
        if (!silent) setLoading(true);
        inflightRef.current.add(p);
        EmailRouter.list({ archived: true, offset: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE }, (data: any) => {
            inflightRef.current.delete(p);
            const result = data.data || data;
            cacheRef.current.set(p, result);
            apply(result);
            prefetch(p);
        });
    }

    useEffect(() => {
        if (isOpen) {
            cacheRef.current.clear();
            setPage(1);
            fetchPage(1);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) fetchPage(page);
    }, [page, isOpen]);

    function handleRestore(e: React.MouseEvent, id: string) {
        e.stopPropagation();
        onRestore(id);
        fetchPage(page, { cache: false });
    }

    function handlePurge(id: string) {
        EmailRouter.purge({ id }, () => {
            cacheRef.current.clear();
            setSelected((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            fetchPage(page, { cache: false });
        });
    }

    function toggle(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const allOnPage = list.length > 0 && list.every((e) => selected.has(e.id));

    function toggleAll() {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allOnPage) list.forEach((e) => next.delete(e.id));
            else list.forEach((e) => next.add(e.id));
            return next;
        });
    }

    function purgeSelected() {
        const ids = [...selected];
        if (!ids.length) return;
        setPurging(true);
        EmailRouter.purge({ ids } as any, () => {
            setPurging(false);
            setArmed(false);
            setSelected(new Set());
            cacheRef.current.clear();
            fetchPage(1, { cache: false });
            setPage(1);
        });
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>已归档邮件</DialogTitle>
                    <DialogDescription>共 {total} 封，点击行可查看内容；彻底删除不可恢复</DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            className="size-4 accent-current"
                            checked={allOnPage}
                            onChange={toggleAll}
                        />
                        全选本页
                    </label>
                    <span className="text-muted-foreground text-sm">已选 {selected.size} 封</span>
                    <Button
                        size="sm"
                        variant={armed ? "destructive" : "outline"}
                        disabled={purging || selected.size === 0}
                        title="彻底删除选中的邮件（不可恢复）"
                        onClick={() => (armed ? purgeSelected() : setArmed(true))}
                        onBlur={() => setArmed(false)}
                    >
                        <Trash2 className="size-3.5" />
                        {armed ? `确认删除 ${selected.size} 封` : "批量彻底删除"}
                    </Button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
                            <Loader2 className="size-4 animate-spin" />
                            加载中…
                        </div>
                    ) : list.length === 0 ? (
                        <div className="text-muted-foreground py-10 text-center text-sm">暂无归档邮件</div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {list.map((email) => (
                                <div
                                    key={email.id}
                                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
                                    onClick={() => onOpen(email)}
                                >
                                    <input
                                        type="checkbox"
                                        className="size-4 shrink-0 accent-current"
                                        checked={selected.has(email.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => toggle(email.id)}
                                    />
                                    <div className="w-40 min-w-0">
                                        <div className="truncate" title={formatEmail(email.from).name}>
                                            {formatEmail(email.from).name}
                                        </div>
                                        {formatEmail(email.from).email && (
                                            <div className="text-muted-foreground truncate text-xs">{formatEmail(email.from).email}</div>
                                        )}
                                    </div>
                                    <div className="w-40 min-w-0">
                                        <div className="truncate" title={formatEmail(email.to).name}>
                                            {formatEmail(email.to).name}
                                        </div>
                                        {formatEmail(email.to).email && (
                                            <div className="text-muted-foreground truncate text-xs">{formatEmail(email.to).email}</div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            {email.blocked === 1 && (
                                                <Badge variant="destructive" className="shrink-0" title={`命中规则：${email.block_rule}`}>
                                                    拦截·{blockLabel(email.blocked_by)}
                                                </Badge>
                                            )}
                                            <span className="truncate" title={email.subject}>
                                                {email.subject}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                                        {formatTime(Number(email.time))}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => handleRestore(e, email.id)}
                                        >
                                            <ArchiveRestore className="size-3.5" />
                                            恢复
                                        </Button>
                                        <ConfirmPurgeButton onConfirm={() => handlePurge(email.id)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <Pagination page={page} total={totalPages} onChange={setPage} />
            </DialogContent>
        </Dialog>
    );
};

export default ArchivedDialog;
