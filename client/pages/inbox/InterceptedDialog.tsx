import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Badge } from "../../components/ui/badge";
import { Pagination } from "../../components/ui/pagination";
import { EmailRouter } from "../../api/instance";
import { formatEmail, blockLabel } from "../../methods/format";

const PAGE_SIZE = 20;

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onOpen: (email: any) => void;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

/** Safety-rule intercepted mail — stored but hidden from the inbox list. */
const InterceptedDialog = ({ isOpen, onOpenChange, onOpen }: Props) => {
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [list, setList] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
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
        EmailRouter.list({ blocked: true, offset: next * PAGE_SIZE - PAGE_SIZE, limit: PAGE_SIZE }, (data: any) => {
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
        EmailRouter.list({ blocked: true, offset: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE }, (data: any) => {
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

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>已拦截邮件</DialogTitle>
                    <DialogDescription>共 {total} 封，命中安全规则入站即被拦截；点击行可查看内容</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
                            <Loader2 className="size-4 animate-spin" />
                            加载中…
                        </div>
                    ) : list.length === 0 ? (
                        <div className="text-muted-foreground py-10 text-center text-sm">暂无拦截邮件</div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {list.map((email) => (
                                <div
                                    key={email.id}
                                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
                                    onClick={() => onOpen(email)}
                                >
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
                                            <Badge variant="destructive" className="shrink-0" title={`命中规则：${email.block_rule}`}>
                                                拦截·{blockLabel(email.blocked_by)}
                                            </Badge>
                                            <span className="truncate" title={email.subject}>
                                                {email.subject}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                                        {formatTime(Number(email.time))}
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

export default InterceptedDialog;
