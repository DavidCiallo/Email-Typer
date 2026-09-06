import { useEffect, useRef, useState } from "react";
import { EmailRouter, StrategyRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Pagination } from "../../components/ui/pagination";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { Archive, RotateCw, Search, ShieldAlert } from "lucide-react";
import { cn } from "../../lib/utils";
import EmailContentModal from "./InboxContent";
import StrategyFormModal from "../strategy/StrategyFormModal";
import ArchivedDialog from "./ArchivedDialog";
import { toast } from "../../methods/notify";
import InboxTable from "./InboxTable";
import InboxList from "./InboxList";

const PAGE_SIZE = 10;

const EmailPage = () => {
    const [allEmailList, setAllEmailList] = useState<any[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [accounts, setAccounts] = useState<string[]>([]);
    const [page, setPage] = useState(1);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [accountFilter, setAccountFilter] = useState("all");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [blockedOnly, setBlockedOnly] = useState(false);

    const [focusEmail, setFocusEmail] = useState<any | null>(null);
    const [isEmailContentOpen, setEmailContentOpen] = useState(false);
    const [isStrategyOpen, setStrategyOpen] = useState(false);

    // Archived emails live in a dialog, opened from a small toolbar button
    const [isArchivedOpen, setArchivedOpen] = useState(false);

    const [refreshing, setRefreshing] = useState(false);
    const [newIds, setNewIds] = useState<Set<string>>(new Set());
    const maxTimeRef = useRef<number | null>(null);

    // Keep latest values accessible inside interval / ws handlers
    const stateRef = useRef({ search, accountFilter, sourceFilter, page, blockedOnly });
    stateRef.current = { search, accountFilter, sourceFilter, page, blockedOnly };

    function submitAddStrategy(body: any) {
        StrategyRouter.save({ strategy: body }, () => {
            toast({ title: "添加成功", color: "primary" });
            setStrategyOpen(false);
        });
    }

    // Prefetched pages keyed by "<filters>|<page>" — paging renders instantly
    // from the cache while the next page is fetched in the background.
    const pageCacheRef = useRef(new Map<string, any>());
    const inflightRef = useRef(new Set<string>());
    const filtersKeyRef = useRef<string | null>(null);

    function listParams(page: number) {
        const s = stateRef.current;
        return {
            offset: (page - 1) * PAGE_SIZE,
            limit: PAGE_SIZE,
            account_id: s.accountFilter !== "all" ? s.accountFilter : undefined,
            q: s.search || undefined,
            blocked: s.blockedOnly,
            source: s.sourceFilter !== "all" ? s.sourceFilter : undefined,
        };
    }

    function applyEmails(result: any) {
        const list = result.list || [];
        setTotal(result.total || 0);
        if (result.accounts) setAccounts(result.accounts);

        // Highlight rows newer than anything seen before
        const maxPrev = maxTimeRef.current;
        if (maxPrev !== null) {
            const fresh = list
                .filter((e: any) => Number(e.time) > maxPrev)
                .map((e: any) => e.id);
            if (fresh.length) {
                setNewIds((prev) => new Set([...prev, ...fresh]));
            }
        }
        const maxNow = list.reduce((m: number, e: any) => Math.max(m, Number(e.time) || 0), 0);
        if (maxNow > (maxTimeRef.current ?? 0)) maxTimeRef.current = maxNow;

        setAllEmailList(list);
        setRefreshing(false);
    }

    function cacheResult(key: string, result: any) {
        pageCacheRef.current.set(key, result);
        if (pageCacheRef.current.size > 30) {
            const oldest = pageCacheRef.current.keys().next().value;
            if (oldest !== undefined) pageCacheRef.current.delete(oldest);
        }
    }

    /** Fetch page+1 into the cache so clicking "next" needs no network round trip. */
    function prefetchPage(page: number) {
        const key = `${filterKey()}|${page + 1}`;
        if (pageCacheRef.current.has(key) || inflightRef.current.has(key)) return;
        inflightRef.current.add(key);
        EmailRouter.list(listParams(page + 1), (data: any) => {
            inflightRef.current.delete(key);
            cacheResult(key, data.data || data);
        });
    }

    function filterKey() {
        const s = stateRef.current;
        return `${s.search}|${s.accountFilter}|${s.sourceFilter}|${s.blockedOnly}`;
    }

    function queryEmails(overrides?: Partial<{ page: number; silent: boolean; cache: boolean }>) {
        const page = overrides?.page ?? stateRef.current.page;
        const key = `${filterKey()}|${page}`;
        if (overrides?.cache !== false && pageCacheRef.current.has(key)) {
            applyEmails(pageCacheRef.current.get(key));
            setRefreshing(false);
            prefetchPage(page);
            return;
        }
        if (inflightRef.current.has(key)) return;
        if (!overrides?.silent) setRefreshing(true);
        inflightRef.current.add(key);
        EmailRouter.list(listParams(page), (data: any) => {
            inflightRef.current.delete(key);
            const result = data.data || data;
            cacheResult(key, result);
            applyEmails(result);
            setRefreshing(false);
            prefetchPage(page);
        });
    }

    function openArchived() {
        setArchivedOpen(true);
    }

    // Refetch whenever page / search / filters change (also covers initial load).
    // Search / filter switches invalidate prefetched pages; plain page moves reuse them.
    useEffect(() => {
        const fk = filterKey();
        if (filtersKeyRef.current !== fk) {
            pageCacheRef.current.clear();
            filtersKeyRef.current = fk;
        }
        queryEmails({ page });
    }, [page, search, accountFilter, sourceFilter, blockedOnly]);

    // Debounce the search input
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    // Silent poll while the page is visible
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") {
                queryEmails({ silent: true });
            }
        }, 10000);
        return () => clearInterval(timer);
    }, []);

    // Real-time push from the server
    useEffect(() => {
        const onNewEmail = () => queryEmails({ silent: true });
        window.addEventListener("email:new", onNewEmail);
        return () => window.removeEventListener("email:new", onNewEmail);
    }, []);

    function openEmail(email: any) {
        setFocusEmail(email);
        setEmailContentOpen(true);
        setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(email.id);
            return next;
        });
    }

    function archiveEmail(id: string) {
        EmailRouter.delete({ id }, () => {
            toast({
                title: "已归档",
                color: "primary",
                action: { label: "撤销", onClick: () => EmailRouter.restore({ id }, () => queryEmails({ cache: false })) },
            });
            queryEmails({ cache: false });
        });
    }

    function restoreEmail(id: string) {
        EmailRouter.restore({ id }, () => {
            toast({ title: "已恢复到收件箱", color: "success" });
            queryEmails({ cache: false });
        });
    }

    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative min-w-48 flex-1">
                    <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                    <Input
                        className="pl-8"
                        placeholder="搜索发件人 / 收件人 / 主题…"
                        value={searchInput}
                        onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                    />
                </div>

                {/* Account filter */}
                <Select
                    value={accountFilter}
                    onValueChange={(v) => { setAccountFilter(v); setPage(1); }}
                >
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="全部账号" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部账号</SelectItem>
                        {accounts.map((a) => (
                            <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Source filter */}
                <Select
                    value={sourceFilter}
                    onValueChange={(v) => { setSourceFilter(v); setPage(1); }}
                >
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder="全部来源" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部来源</SelectItem>
                        <SelectItem value="maildir">收信</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                        <SelectItem value="imap">IMAP</SelectItem>
                        <SelectItem value="receive">接口</SelectItem>
                    </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant={blockedOnly ? "default" : "ghost"}
                        size="icon"
                        aria-label="只看已拦截"
                        aria-pressed={blockedOnly}
                        title="只看已拦截"
                        onClick={() => { setBlockedOnly(!blockedOnly); setPage(1); }}
                    >
                        <ShieldAlert className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="已归档"
                        title="已归档"
                        onClick={openArchived}
                    >
                        <Archive className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="刷新"
                        title="刷新"
                        onClick={() => queryEmails({ cache: false })}
                    >
                        <RotateCw className={cn("size-4", refreshing && "animate-spin")} />
                    </Button>
                    <Button variant="outline" onClick={() => setStrategyOpen(true)}>
                        新建策略
                    </Button>
                </div>
            </div>

            <div className={cn("transition-opacity", refreshing && "opacity-60")}>
                <div className="hidden w-full md:block">
                    <InboxTable
                        emailList={allEmailList}
                        newIds={newIds}
                        onOpen={openEmail}
                        onArchive={archiveEmail}
                    />
                </div>
                <div className="block w-full md:hidden">
                    <InboxList
                        emailList={allEmailList}
                        newIds={newIds}
                        onOpen={openEmail}
                        onArchive={archiveEmail}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">共 {total} 封</span>
                <Pagination
                    page={page}
                    total={Math.ceil(total / PAGE_SIZE)}
                    onChange={(newPage: number) => setPage(newPage)}
                />
            </div>

            {focusEmail && (
                <EmailContentModal email={focusEmail} isOpen={isEmailContentOpen} onOpenChange={setEmailContentOpen} />
            )}
            <StrategyFormModal
                isOpen={isStrategyOpen}
                onOpenChange={setStrategyOpen}
                onSubmit={submitAddStrategy}
            />
            <ArchivedDialog
                isOpen={isArchivedOpen}
                onOpenChange={setArchivedOpen}
                onRestore={restoreEmail}
                onOpen={openEmail}
            />
        </div>
    );
};

export default EmailPage;
