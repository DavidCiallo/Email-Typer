import { useEffect, useMemo, useState } from "react";
import { MailboxRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Pagination } from "../../components/ui/pagination";
import { Badge } from "../../components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import { toast } from "../../methods/notify";
import { RefreshCw, Plus, Inbox, Search } from "lucide-react";
import MailboxFormModal, { ProviderPreset } from "./MailboxFormModal";

const DERIVED_PAGE_SIZE = 10;

const TYPE_LABEL: Record<string, string> = {
    catchall: "本地地址",
    api: "API 推送",
    imap: "IMAP 同步",
};

function StatusBadge({ row }: { row: any }) {
    if (row.status === "error") {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge variant="destructive">异常</Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 break-all">{row.sync_error || "同步出错"}</TooltipContent>
            </Tooltip>
        );
    }
    if (row.status === "disabled") {
        return <Badge variant="secondary">已停用</Badge>;
    }
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">正常</Badge>;
}

function formatSyncTime(ts: number | null): string {
    if (!ts) return "从未同步";
    const d = new Date(ts);
    const date = d.toLocaleDateString("zh-CN");
    const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
}

function formatDerivedTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return `今天 ${time}`;
    const date = `${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
    return `${date} ${time}`;
}

const MailboxPage = () => {
    const [activeTab, setActiveTab] = useState<"managed" | "derived">("managed");
    const [boxes, setBoxes] = useState<any[]>([]);
    const [domains, setDomains] = useState<string[]>([]);
    const [providers, setProviders] = useState<ProviderPreset[]>([]);
    const [derived, setDerived] = useState<any[]>([]);
    const [derivedSearch, setDerivedSearch] = useState("");
    const [derivedPage, setDerivedPage] = useState(1);

    const [domainFilter, setDomainFilter] = useState("all");
    const domainList = useMemo(() => Array.from(new Set(boxes.map((b) => b.domain))).sort(), [boxes]);
    const filteredBoxes = useMemo(
        () => (domainFilter === "all" ? boxes : boxes.filter((b) => b.domain === domainFilter)),
        [boxes, domainFilter],
    );

    const filteredDerived = useMemo(() => {
        const q = derivedSearch.trim().toLowerCase();
        return q ? derived.filter((d) => d.address.toLowerCase().includes(q)) : derived;
    }, [derived, derivedSearch]);
    const derivedTotalPages = Math.max(1, Math.ceil(filteredDerived.length / DERIVED_PAGE_SIZE));
    const pagedDerived = filteredDerived.slice((Math.min(derivedPage, derivedTotalPages) - 1) * DERIVED_PAGE_SIZE, Math.min(derivedPage, derivedTotalPages) * DERIVED_PAGE_SIZE);

    const [isFormOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [adopting, setAdopting] = useState<string | null>(null);

    function refreshList() {
        MailboxRouter.list({}, (data: any) => {
            const result = data?.data || data;
            setBoxes(result?.list || []);
            setDomains(result?.domains || []);
        });
        MailboxRouter.addresses({}, (data: any) => {
            const result = data?.data || data;
            setDerived(result?.derived || []);
        });
    }

    function refreshProviders() {
        MailboxRouter.providers({}, (data: any) => {
            const result = data?.data || data;
            setProviders(result?.presets || []);
        });
    }

    useEffect(() => {
        refreshList();
        refreshProviders();
    }, []);

    function openCreate() {
        setEditing(null);
        setFormOpen(true);
    }

    function openEdit(row: any) {
        setEditing(row);
        setFormOpen(true);
    }

    function submitDelete(row: any) {
        MailboxRouter.delete({ id: row.id }, () => {
            toast({ title: "删除成功", color: "primary" });
            refreshList();
        });
    }

    function syncNow(row: any) {
        setSyncingId(row.id);
        MailboxRouter.sync({ id: row.id }, (data: any) => {
            setSyncingId(null);
            const result = data?.data || data;
            toast({
                title: `同步完成：拉取 ${result?.scanned ?? 0} 封，入库 ${result?.imported ?? 0} 封`,
                color: "success",
            });
            refreshList();
        });
    }

    function adopt(address: string) {
        setAdopting(address);
        MailboxRouter.save(
            { mailbox: { type: "catchall", address, name: address } },
            () => {
                setAdopting(null);
                toast({ title: `已收编 ${address}`, color: "success" });
                refreshList();
                setActiveTab("managed");
            },
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <p className="text-muted-foreground text-sm">
                管理系统的收件地址：本地地址即来即收；API 邮箱供外部系统推送邮件；IMAP 邮箱定时同步网易 / QQ
                等外部邮箱。未知地址收到信后会出现在「未管理地址」，可一键收编。
            </p>

            <div className="flex flex-row items-center justify-between">
                <div className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab("managed")}
                        className={cn(
                            "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all",
                            activeTab === "managed"
                                ? "bg-background text-foreground shadow-xs"
                                : "hover:text-foreground",
                        )}
                    >
                        已管理邮箱 ({boxes.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("derived")}
                        className={cn(
                            "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all",
                            activeTab === "derived"
                                ? "bg-background text-foreground shadow-xs"
                                : "hover:text-foreground",
                        )}
                    >
                        未管理地址 ({derived.length})
                    </button>
                </div>
                <Button variant="outline" onClick={openCreate}>
                    <Plus className="size-4" />
                    新建邮箱
                </Button>
            </div>

            {activeTab === "managed" ? (
                <div className="flex flex-col gap-3">
                {boxes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[{ domain: "all", count: boxes.length }, ...domainList.map((d) => ({ domain: d, count: boxes.filter((b) => b.domain === d).length }))].map(({ domain, count }) => (
                            <button
                                key={domain}
                                onClick={() => setDomainFilter(domain)}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs transition-colors",
                                    domainFilter === domain
                                        ? "bg-foreground text-background border-transparent"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {domain === "all" ? `全部域名 (${count})` : `${domain} (${count})`}
                            </button>
                        ))}
                    </div>
                )}
                <div className="rounded-lg border bg-card shadow-xs">
                    <Table className="table-fixed min-w-[760px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead>名称</TableHead>
                                <TableHead className="w-28">类型</TableHead>
                                <TableHead className="w-64">地址</TableHead>
                                <TableHead className="w-24">状态</TableHead>
                                <TableHead className="w-40">最近同步</TableHead>
                                <TableHead className="w-56 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredBoxes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                                        暂无邮箱，点击右上角「新建邮箱」创建
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredBoxes.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            <div className="truncate" title={row.name}>{row.name}</div>
                                            {row.note && (
                                                <div className="text-muted-foreground truncate text-xs" title={row.note}>{row.note}</div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{TYPE_LABEL[row.type] || row.type}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="truncate" title={row.address}>{row.address}</div>
                                        </TableCell>
                                        <TableCell><StatusBadge row={row} /></TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {row.type === "imap" ? formatSyncTime(row.last_sync_time) : "-"}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-row justify-end gap-2">
                                                {row.type === "imap" && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={syncingId === row.id}
                                                        onClick={() => syncNow(row)}
                                                    >
                                                        <RefreshCw className={cn("size-3.5", syncingId === row.id && "animate-spin")} />
                                                        {syncingId === row.id ? "同步中" : "同步"}
                                                    </Button>
                                                )}
                                                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => submitDelete(row)}
                                                >
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                <div className="relative w-full md:w-80">
                    <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                    <Input
                        className="pl-8"
                        placeholder="搜索地址…"
                        value={derivedSearch}
                        onChange={(e) => { setDerivedSearch(e.target.value); setDerivedPage(1); }}
                    />
                </div>
                <div className="rounded-lg border bg-card shadow-xs">
                    <Table className="table-fixed">
                        <TableHeader>
                            <TableRow>
                                <TableHead>地址</TableHead>
                                <TableHead className="w-24">邮件数</TableHead>
                                <TableHead className="w-48">最近收到</TableHead>
                                <TableHead className="w-44 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pagedDerived.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                                        <span className="inline-flex items-center gap-2">
                                            <Inbox className="size-4" />
                                            {derivedSearch ? "没有匹配的地址" : "暂未发现未管理的地址"}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pagedDerived.map((item) => (
                                    <TableRow key={item.address}>
                                        <TableCell>
                                            <div className="truncate" title={item.address}>{item.address}</div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{item.count}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {formatDerivedTime(item.last_time)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-row justify-end">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={adopting === item.address}
                                                    onClick={() => adopt(item.address)}
                                                >
                                                    <Plus className="size-3.5" />
                                                    收编为本地邮箱
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">共 {filteredDerived.length} 个地址</span>
                    <Pagination page={derivedPage} total={derivedTotalPages} onChange={setDerivedPage} />
                </div>
                </div>
            )}

            <MailboxFormModal
                isOpen={isFormOpen}
                onOpenChange={setFormOpen}
                editing={editing}
                domains={domains}
                providers={providers}
                onSaved={() => refreshList()}
            />

        </div>
    );
};

export default MailboxPage;
