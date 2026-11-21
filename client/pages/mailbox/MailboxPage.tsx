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
import { copytext, textColor } from "../../methods/text";
import { Plus, Inbox, Search, Clock, X, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
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

    const [domainFilter, setDomainFilter] = useState("");
    const [managedSearch, setManagedSearch] = useState("");
    const [labelFilter, setLabelFilter] = useState("all");
    const [managedPage, setManagedPage] = useState(1);
    const domainList = useMemo(() => Array.from(new Set(boxes.map((b) => b.domain))).sort(), [boxes]);
    // a domain is always selected; an unset or stale choice falls back to the
    // first domain so the list is never an unfiltered dump
    const activeDomain = domainList.includes(domainFilter) ? domainFilter : (domainList[0] ?? "");
    // address, label and note are all searchable from the one box
    const filteredBoxes = useMemo(() => {
        const q = managedSearch.trim().toLowerCase();
        return boxes.filter((b) => {
            if (b.domain !== activeDomain) return false;
            if (labelFilter !== "all" && !(b.labels || []).includes(labelFilter)) return false;
            if (!q) return true;
            return b.address.toLowerCase().includes(q)
                || (b.note || "").toLowerCase().includes(q)
                || (b.labels || []).some((l: string) => l.toLowerCase().includes(q));
        });
    }, [boxes, activeDomain, labelFilter, managedSearch]);
    // 全量有序列表（同域、不含搜索/标签筛选），与后端 mailboxMove 的交换范围一致。
    // 上下键的边界必须以它为基准，用分页切片判断会导致排序只能在一页内生效。
    const orderedBoxes = useMemo(
        () => boxes.filter((b) => b.domain === activeDomain),
        [boxes, activeDomain],
    );
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
    // 排序请求进行中时禁用所有上下键：连点会让两次移动交错，最终顺序随机
    const [moving, setMoving] = useState(false);
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

    // ===== 原实现（改造前，保留备查 2026-11-17）=====
    // 后端只支持相邻交换，前端只能传方向；筛选状态下算出的「相邻行」并不是
    // 真实相邻行，所以看起来像没反应。
    // function move(row: any, direction: "up" | "down") {
    //     MailboxRouter.move({ id: row.id, direction }, (res: any) => {
    //         if (res?.success === false) return toast({ title: res.message || "移动失败", color: "danger" });
    //         refreshList();
    //     });
    // }
    // ===== 改造后 =====
    // 改成「移动到谁之前」：位置由前端用同域全量列表算，后端整体重排。
    function move(row: any, direction: "up" | "down") {
        if (moving) return;
        const idx = orderedBoxes.findIndex((b) => b.id === row.id);
        if (idx < 0) return;
        let beforeId = "";
        if (direction === "up") {
            if (idx <= 0) return;
            beforeId = orderedBoxes[idx - 1].id;
        } else {
            if (idx >= orderedBoxes.length - 1) return;
            // 下移 = 插到「原后一位的后面」；没有下下一位就落到末尾
            beforeId = orderedBoxes[idx + 2]?.id || "";
        }
        setMoving(true);
        MailboxRouter.move({ id: row.id, before_id: beforeId }, (res: any) => {
            setMoving(false);
            if (res?.success === false) return toast({ title: res.message || "移动失败", color: "danger" });
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
                        {domainList.map((domain) => (
                            <button
                                key={domain}
                                onClick={() => { setDomainFilter(domain); setManagedPage(1); }}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs transition-colors",
                                    activeDomain === domain
                                        ? "bg-foreground text-background border-transparent"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {domain} ({boxes.filter((b) => b.domain === domain).length})
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
                                            <div
                                                className="cursor-pointer truncate hover:underline"
                                                title={`${row.address}（点击复制）`}
                                                onClick={() => {
                                                    copytext(row.address);
                                                    toast({ title: "已复制", description: row.address, color: "success" });
                                                }}
                                            >
                                                {row.address}
                                            </div>
                                            <div className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                                                <span className="truncate">{TYPE_LABEL[row.type] || row.type}</span>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "shrink-0 px-1 py-0 text-[10px] leading-4",
                                                        row.forward_enabled === 1
                                                            ? "border-emerald-300 text-emerald-600"
                                                            : "text-muted-foreground",
                                                    )}
                                                    title={
                                                        row.forward_enabled === 1
                                                            ? "命中的转发/回调策略会执行"
                                                            : "收到的邮件只留存，不执行转发与回调"
                                                    }
                                                >
                                                    {row.forward_enabled === 1 ? "转发：开" : "转发：关"}
                                                </Badge>
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
                                                    aria-label="上移"
                                                    title="上移"
                                                    // 原: disabled={pagedBoxes[0]?.id === row.id}
                                                    disabled={moving || orderedBoxes[0]?.id === row.id}
                                                    onClick={() => move(row, "up")}
                                                >
                                                    <ArrowUp className="size-3.5" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    aria-label="下移"
                                                    title="下移"
                                                    // 原: disabled={pagedBoxes[pagedBoxes.length - 1]?.id === row.id}
                                                    disabled={moving || orderedBoxes[orderedBoxes.length - 1]?.id === row.id}
                                                    onClick={() => move(row, "down")}
                                                >
                                                    <ArrowDown className="size-3.5" />
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
