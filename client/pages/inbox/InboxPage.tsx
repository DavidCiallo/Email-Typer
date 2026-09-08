import { useEffect, useRef, useState } from "react";
import { EmailRouter, MailboxRouter } from "../../api/instance";
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
import { inTauthSession } from "../../methods/tauth";
import EmailContentModal from "./InboxContent";
import ArchivedDialog from "./ArchivedDialog";
import InterceptedDialog from "./InterceptedDialog";
import { SearchableSelect, type SearchOption } from "./SearchableSelect";
import { toast } from "../../methods/notify";
import InboxTable from "./InboxTable";
import InboxList from "./InboxList";

const PAGE_SIZE = 10;

const EmailPage = () => {
    const [allEmailList, setAllEmailList] = useState<any[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [page, setPage] = useState(1);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    // "all" | "mailbox:<address>" | "acct:<localpart>"
    const [accountFilter, setAccountFilter] = useState("all");
    // "all" | "code" | "links" | "attachments"
    const [contentFilter, setContentFilter] = useState("all");
    const [mailboxes, setMailboxes] = useState<any[]>([]);

    // row selection (checkboxes) + bulk actions
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [archivingSelection, setArchivingSelection] = useState(false);

    const [focusEmail, setFocusEmail] = useState<any | null>(null);
    const [isEmailContentOpen, setEmailContentOpen] = useState(false);

    // Archived / intercepted emails live in dialogs, opened from toolbar buttons
    const [isArchivedOpen, setArchivedOpen] = useState(false);
    const [isInterceptedOpen, setInterceptedOpen] = useState(false);

    const [refreshing, setRefreshing] = useState(false);
    const [newIds, setNewIds] = useState<Set<string>>(new Set());
    const maxTimeRef = useRef<number | null>(null);

    // Keep latest values accessible inside interval / ws handlers
    const stateRef = useRef({ search, accountFilter, contentFilter, page });
    stateRef.current = { search, accountFilter, contentFilter, page };

    // Prefetched pages keyed by "<filters>|<page>" — paging renders instantly
    // from the cache while the next page is fetched in the background.
    const pageCacheRef = useRef(new Map<string, any>());
    const inflightRef = useRef(new Set<string>());
    const filtersKeyRef = useRef<string | null>(null);

    function listParams(page: number) {
        const s = stateRef.current;
        const acct = s.accountFilter;
        return {
            offset: (page - 1) * PAGE_SIZE,
            limit: PAGE_SIZE,
            to: acct.startsWith("to:") ? acct.slice(3) : undefined,
            q: s.search || undefined,
            blocked: false,
            has_code: s.contentFilter === "code" || undefined,
            has_links: s.contentFilter === "links" || undefined,
            has_attachments: s.contentFilter === "attachments" || undefined,
        };
    }

    function applyEmails(result: any) {
        const list = result.list || [];
        // guard against stale/raced responses without a usable total
        if (typeof result.total === "number" && result.total >= 0) setTotal(result.total);

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

    function filterKey() {
        const s = stateRef.current;
        return `${s.search}|${s.accountFilter}|${s.contentFilter}`;
    }

    function queryEmails(overrides?: Partial<{ page: number; silent: boolean; cache: boolean }>) {
        const page = overrides?.page ?? stateRef.current.page;
        const key = `${filterKey()}|${page}`;
        if (overrides?.cache !== false && pageCacheRef.current.has(key)) {
            applyEmails(pageCacheRef.current.get(key));
            setRefreshing(false);
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
        });
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
    }, [page, search, accountFilter, contentFilter]);

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

    // Mailbox / address options for the account filter (admin sessions only —
    // tauth sessions are already scoped to a single address). Declared
    // mailboxes come first, then addresses derived from received traffic.
    useEffect(() => {
        if (inTauthSession()) return;
        MailboxRouter.addresses({}, (data: any) => {
            const result = data?.data || data;
            setMailboxes([
                ...(result?.declared || []).map((b: any) => ({ address: b.address, name: b.name, note: b.note })),
                ...(result?.derived || []).map((d: any) => ({ address: d.address, name: "", note: `${d.count} 封`, derived: true })),
            ]);
        });
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

    // ---------- selection ----------

    function toggleSelect(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleSelectAll() {
        setSelected((prev) => {
            const allSelected = allEmailList.length > 0 && allEmailList.every((e) => prev.has(e.id));
            if (allSelected) {
                const next = new Set(prev);
                allEmailList.forEach((e) => next.delete(e.id));
                return next;
            }
            return new Set([...prev, ...allEmailList.map((e) => e.id)]);
        });
    }

    function clearSelection() {
        setSelected(new Set());
    }

    function archiveSelected() {
        const ids = [...selected];
        if (ids.length === 0 || archivingSelection) return;
        setArchivingSelection(true);
        let done = 0;
        ids.forEach((id) => {
            EmailRouter.delete({ id }, () => {
                done++;
                if (done === ids.length) {
                    setArchivingSelection(false);
                    clearSelection();
                    toast({
                        title: `已归档 ${ids.length} 封`,
                        color: "primary",
                        action: {
                            label: "撤销",
                            onClick: () => {
                                ids.forEach((rid) => EmailRouter.restore({ rid }, () => { }));
                                toast({ title: "已全部恢复到收件箱", color: "success" });
                                setTimeout(() => queryEmails({ cache: false }), 300);
                            },
                        },
                    });
                    queryEmails({ cache: false });
                }
            });
        });
    }

    // ---------- end selection ----------

    function restoreEmail(id: string) {
        EmailRouter.restore({ id }, () => {
            toast({ title: "已恢复到收件箱", color: "success" });
            queryEmails({ cache: false });
        });
    }

    // Account filter options — every entry filters by recipient address
    // (`to` contains), declared mailboxes first, then derived addresses.
    const accountOptions: SearchOption[] = mailboxes.map((b) => {
        const hint = b.derived ? (b.note || undefined) : ([b.name, b.note].filter(Boolean).join(" · ") || undefined);
        return { value: `to:${b.address}`, label: b.address, hint, keywords: `${b.name || ""} ${b.note || ""}` };
    });

    return (
        <div className="mx-auto flex w-full flex-col gap-4">
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

                {/* Mailbox / account filter (admin only — tauth is scoped to one address) */}
                {!inTauthSession() && (
                    <SearchableSelect
                        className="min-w-44 flex-1"
                        value={accountFilter}
                        options={accountOptions}
                        allLabel="全部账号"
                        searchPlaceholder="搜索邮箱 / 地址 / 备注…"
                        onChange={(v) => { setAccountFilter(v); setPage(1); clearSelection(); }}
                    />
                )}

                {/* Content filter */}
                <Select
                    value={contentFilter}
                    onValueChange={(v) => { setContentFilter(v); setPage(1); clearSelection(); }}
                >
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder="全部内容" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部内容</SelectItem>
                        <SelectItem value="code">携带验证码</SelectItem>
                        <SelectItem value="links">携带链接</SelectItem>
                        <SelectItem value="attachments">携带附件</SelectItem>
                    </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="已拦截"
                        title="已拦截"
                        onClick={() => setInterceptedOpen(true)}
                    >
                        <ShieldAlert className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="已归档"
                        title="已归档"
                        onClick={() => setArchivedOpen(true)}
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
                </div>
            </div>

            {/* Selection actions — mobile only; desktop hosts them in the table header */}
            {selected.size > 0 && (
                <div className="bg-muted/60 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 md:hidden">
                    <span className="text-sm font-medium">已选 {selected.size} 项</span>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={archivingSelection}
                        onClick={archiveSelected}
                    >
                        <Archive className="size-3.5" />
                        归档选中
                    </Button>
                </div>
            )}

            <div className={cn("transition-opacity", refreshing && "opacity-60")}>
                <div className="hidden w-full md:block">
                    <InboxTable
                        emailList={allEmailList}
                        newIds={newIds}
                        selected={selected}
                        onToggleSelect={toggleSelect}
                        onSelectAll={toggleSelectAll}
                        onArchiveSelected={archiveSelected}
                        archivingSelection={archivingSelection}
                        onOpen={openEmail}
                    />
                </div>
                <div className="block w-full md:hidden">
                    <InboxList
                        emailList={allEmailList}
                        newIds={newIds}
                        selected={selected}
                        onToggleSelect={toggleSelect}
                        onSelectAll={toggleSelectAll}
                        onOpen={openEmail}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">共 {total} 封</span>
                <Pagination
                    page={page}
                    total={Math.ceil(total / PAGE_SIZE)}
                    onChange={(newPage: number) => { setPage(newPage); clearSelection(); }}
                />
            </div>

            {focusEmail && (
                <EmailContentModal email={focusEmail} isOpen={isEmailContentOpen} onOpenChange={setEmailContentOpen} />
            )}
            <ArchivedDialog
                isOpen={isArchivedOpen}
                onOpenChange={setArchivedOpen}
                onRestore={restoreEmail}
                onOpen={openEmail}
            />
            <InterceptedDialog
                isOpen={isInterceptedOpen}
                onOpenChange={setInterceptedOpen}
                onOpen={openEmail}
            />
        </div>
    );
};

export default EmailPage;
