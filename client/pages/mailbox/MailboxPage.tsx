import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { textColor } from "../../methods/text";
import { Plus, Inbox, Search, Clock, X, Pencil, Trash2 } from "lucide-react";
import MailboxFormModal, { ProviderPreset } from "./MailboxFormModal";
import MailboxGrantDialog from "./MailboxGrantDialog";

const DERIVED_PAGE_SIZE = 10;
const MANAGED_PAGE_SIZE = 10;

const TYPE_LABEL: Record<string, string> = {
    catchall: "本地地址",
    api: "API 推送",
    imap: "IMAP 同步",
};

/** Tag editor for one mailbox: each tag reveals an × on hover, the + adds one. */
function LabelCell({ row, labels, onChanged }: { row: any; labels: string[]; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const owned: string[] = row.labels || [];
    const suggestions = labels.filter((l) => !owned.includes(l) && l.includes(draft.trim()));

    function add(label: string) {
        const value = label.trim();
        if (!value) return;
        MailboxRouter.labelSave({ id: row.id, label: value }, (res: any) => {
            if (res?.success === false) return toast({ title: res.message || "添加标签失败", color: "danger" });
            setOpen(false);
            setDraft("");
            onChanged();
        });
    }

    function remove(label: string) {
        MailboxRouter.labelRemove({ id: row.id, label }, (res: any) => {
            if (res?.success === false) return toast({ title: res.message || "删除标签失败", color: "danger" });
            onChanged();
        });
    }

    return (
        <div className="flex flex-wrap items-center gap-1">
            {owned.map((label) => (
                <Badge key={label} variant="outline" className="group/tag max-w-full gap-0" style={textColor(label)}>
                    {/* the × replaces this spacer on hover, so the text never shifts */}
                    <span className=" shrink-0" aria-hidden />
                    <span className="truncate">{label}</span>
                    <button
                        type="button"
                        aria-label={`删除标签 ${label}`}
                        className="relative w-0 shrink-0 overflow-hidden opacity-0 transition-opacity group-hover/tag:w-2.5 group-hover/tag:opacity-100"
                        onClick={() => remove(label)}
                    >
                        <X className="size-3" />
                    </button>
                </Badge>
            ))}
            {open ? (
                <div
                    className="relative"
                    // a suggestion click fires after blur; the delay lets it land first
                    onBlur={() => window.setTimeout(() => { setOpen(false); setDraft(""); }, 150)}
                >
                    <Input
                        autoFocus
                        className="h-7 w-24 px-2 text-sm"
                        placeholder="输入标签"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") add(draft);
                            if (e.key === "Escape") { setOpen(false); setDraft(""); }
                        }}
                    />
                    {suggestions.length > 0 && (
                        <div className="bg-popover absolute z-50 mt-1 w-24 overflow-y-auto rounded-md border p-0.5 shadow-md flex flex-col">
                            {suggestions.map((label) => (
                                <button
                                    key={label}
                                    type="button"
                                    className="hover:bg-muted w-full truncate rounded-sm px-1.5 py-0.5 my-[1px] text-left text-[12px]"
                                    style={textColor(label)}
                                    onClick={() => add(label)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <Button size="sm" variant="ghost" className="h-6" onClick={() => setOpen(true)} aria-label="添加标签">
                    <Plus className="size-3.5" />
                </Button>
            )}
        </div>
    );
}

function GrantBadge({ row }: { row: any }) {
    const base = "w-24 justify-center tabular-nums";
    if (!row.grant) {
        return <Badge variant="outline" className={cn(base, "text-muted-foreground")}>空闲</Badge>;
    }
    const days = Math.max(0, Math.ceil((row.grant.end_time - Date.now()) / 86400000));
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Badge className={cn(base, "bg-amber-600 text-white hover:bg-amber-600")}>授权 余 {days} 天</Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 break-all">
                {formatSyncTime(row.grant.start_time)} ~ {formatSyncTime(row.grant.end_time)}
            </TooltipContent>
        </Tooltip>
    );
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
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<"managed" | "derived">("managed");
    const [boxes, setBoxes] = useState<any[]>([]);
    const [domains, setDomains] = useState<string[]>([]);
    const [allLabels, setAllLabels] = useState<string[]>([]);
    const [providers, setProviders] = useState<ProviderPreset[]>([]);
    const [derived, setDerived] = useState<any[]>([]);
    const [derivedSearch, setDerivedSearch] = useState("");
    const [derivedPage, setDerivedPage] = useState(1);

    const [domainFilter, setDomainFilter] = useState("all");
    const [managedSearch, setManagedSearch] = useState("");
    const [labelFilter, setLabelFilter] = useState("all");
    const [managedPage, setManagedPage] = useState(1);
    const domainList = useMemo(() => Array.from(new Set(boxes.map((b) => b.domain))).sort(), [boxes]);
    // address, label and note are all searchable from the one box
    const filteredBoxes = useMemo(() => {
        const q = managedSearch.trim().toLowerCase();
        return boxes.filter((b) => {
            if (domainFilter !== "all" && b.domain !== domainFilter) return false;
            if (labelFilter !== "all" && !(b.labels || []).includes(labelFilter)) return false;
            if (!q) return true;
            return b.address.toLowerCase().includes(q)
                || (b.note || "").toLowerCase().includes(q)
                || (b.labels || []).some((l: string) => l.toLowerCase().includes(q));
        });
    }, [boxes, domainFilter, labelFilter, managedSearch]);
    const managedTotalPages = Math.max(1, Math.ceil(filteredBoxes.length / MANAGED_PAGE_SIZE));
    const pagedBoxes = filteredBoxes.slice(
        (Math.min(managedPage, managedTotalPages) - 1) * MANAGED_PAGE_SIZE,
        Math.min(managedPage, managedTotalPages) * MANAGED_PAGE_SIZE,
    );

    const filteredDerived = useMemo(() => {
        const q = derivedSearch.trim().toLowerCase();
        return q ? derived.filter((d) => d.address.toLowerCase().includes(q)) : derived;
    }, [derived, derivedSearch]);
    const derivedTotalPages = Math.max(1, Math.ceil(filteredDerived.length / DERIVED_PAGE_SIZE));
    const pagedDerived = filteredDerived.slice((Math.min(derivedPage, derivedTotalPages) - 1) * DERIVED_PAGE_SIZE, Math.min(derivedPage, derivedTotalPages) * DERIVED_PAGE_SIZE);

    const [isFormOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [grantBox, setGrantBox] = useState<any | null>(null);
    const [adopting, setAdopting] = useState<string | null>(null);

    function refreshList() {
        MailboxRouter.list({}, (data: any) => {
            const result = data?.data || data;
            setBoxes(result?.list || []);
            setDomains(result?.domains || []);
            setAllLabels(result?.labels || []);
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

    function adopt(address: string) {
        setAdopting(address);
        MailboxRouter.save(
            { mailbox: { type: "catchall", address, name: address } },
            (data: any) => {
                setAdopting(null);
                if (data?.success === false) {
                    toast({ title: data.message || `加入管理失败 ${address}`, color: "danger" });
                    return;
                }
                toast({ title: `已加入管理 ${address}`, color: "success" });
                refreshList();
            },
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <p className="text-muted-foreground text-sm">
                管理系统的收件地址：本地地址即来即收；API 邮箱供外部系统推送邮件；IMAP 邮箱定时同步网易 / QQ
                等外部邮箱。未知地址收到信后会出现在「未管理地址」，可一键加入管理。
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
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full md:w-72">
                        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input
                            className="pl-8"
                            placeholder="搜索地址 / 标签 / 备注…"
                            value={managedSearch}
                            onChange={(e) => { setManagedSearch(e.target.value); setManagedPage(1); }}
                        />
                    </div>
                    {allLabels.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {["all", ...allLabels].map((label) => (
                                <button
                                    key={label}
                                    onClick={() => { setLabelFilter(label); setManagedPage(1); }}
                                    className={cn(
                                        "rounded-full border px-3 py-1 text-xs transition-colors",
                                        labelFilter === label
                                            ? "bg-foreground text-background border-transparent"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {label === "all" ? "全部标签" : label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {boxes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[{ domain: "all", count: boxes.length }, ...domainList.map((d) => ({ domain: d, count: boxes.filter((b) => b.domain === d).length }))].map(({ domain, count }) => (
                            <button
                                key={domain}
                                onClick={() => { setDomainFilter(domain); setManagedPage(1); }}
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
                    <Table className="table-fixed min-w-[880px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-56">地址</TableHead>
                                <TableHead className="w-1/3" align="center">标签</TableHead>
                                <TableHead> 授权&备注 </TableHead>
                                <TableHead className="w-80 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredBoxes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                                        {managedSearch || labelFilter !== "all" ? "没有匹配的邮箱" : "暂无邮箱，点击右上角「新建邮箱」创建"}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pagedBoxes.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            <div className="truncate" title={row.address}>{row.address}</div>
                                            <div className="text-muted-foreground truncate text-xs">
                                                {TYPE_LABEL[row.type] || row.type}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <LabelCell row={row} labels={allLabels} onChanged={refreshList} />
                                        </TableCell>
                                        <TableCell>
                                            {row.note && <div className="truncate" title={row.note}>{row.note}</div>}
                                            <div className={cn("flex items-center justify-between gap-3", row.note && "mt-0.5")}>
                                                <GrantBadge row={row} />
                                                <span
                                                    className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
                                                    title={row.grant?.note || ""}
                                                >
                                                    {row.grant?.note || ""}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-row justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => navigate(`/inbox?to=${encodeURIComponent(row.address)}`)}
                                                >
                                                    <Inbox className="size-3.5" />
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => setGrantBox(row)}>
                                                    <Clock className="size-3.5" />
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => openEdit(row)} aria-label="编辑">
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive hover:text-destructive"
                                                    aria-label="删除"
                                                    onClick={() => submitDelete(row)}
                                                >
                                                    <Trash2 className="size-3.5" />
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
                    <span className="text-muted-foreground text-sm">共 {filteredBoxes.length} 个邮箱</span>
                    <Pagination page={managedPage} total={managedTotalPages} onChange={setManagedPage} />
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
                                                    加入管理
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

            <MailboxGrantDialog
                isOpen={!!grantBox}
                onOpenChange={(open) => !open && setGrantBox(null)}
                mailbox={grantBox}
                onChanged={() => refreshList()}
            />

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
