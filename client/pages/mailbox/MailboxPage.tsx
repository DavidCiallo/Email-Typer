import { useEffect, useState } from "react";
import { MailboxRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
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
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import { toast } from "../../methods/notify";
import { copytext } from "../../methods/text";
import { RefreshCw, KeyRound, Plus, Inbox } from "lucide-react";
import MailboxFormModal, { ProviderPreset } from "./MailboxFormModal";

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

    const [isFormOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [keyRow, setKeyRow] = useState<any | null>(null);
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

    function regenerateKey() {
        if (!keyRow) return;
        MailboxRouter.regenerateKey({ id: keyRow.id }, (data: any) => {
            const result = data?.data || data;
            setKeyRow({ ...keyRow, api_key: result?.api_key || "" });
            toast({ title: "已重新生成，旧 Key 立即失效", color: "success" });
            refreshList();
        });
    }

    const curlExample = keyRow
        ? `curl -X POST ${location.origin}/api/email/push \\
  -H "x-api-key: ${keyRow.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"subject": "你好", "html": "<b>hello</b>"}'`
        : "";

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <p className="text-muted-foreground text-sm">
                邮箱是系统的「邮件来源」：本地地址即来即收（catch-all，未知地址自动出现在下方「未管理地址」中，可一键收编）；API
                推送型邮箱提供独立 Key 供外部系统投递结构化邮件；IMAP 同步型邮箱凭授权码定时拉取外部邮箱（网易 / QQ 等）。
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
                            {boxes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                                        暂无邮箱，点击右上角「新建邮箱」创建
                                    </TableCell>
                                </TableRow>
                            ) : (
                                boxes.map((row) => (
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
                                                {row.type === "api" && (
                                                    <Button size="sm" variant="outline" onClick={() => setKeyRow(row)}>
                                                        <KeyRound className="size-3.5" />
                                                        API Key
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
            ) : (
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
                            {derived.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                                        <span className="inline-flex items-center gap-2">
                                            <Inbox className="size-4" />
                                            暂未发现未管理的地址
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                derived.map((item) => (
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
            )}

            <MailboxFormModal
                isOpen={isFormOpen}
                onOpenChange={setFormOpen}
                editing={editing}
                domains={domains}
                providers={providers}
                onSaved={(row) => {
                    refreshList();
                    if (row?.type === "api" && row?.api_key && !editing) {
                        setKeyRow(row);
                    }
                }}
            />

            {/* API Key management */}
            <Dialog open={!!keyRow} onOpenChange={(open) => !open && setKeyRow(null)}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>API Key — {keyRow?.address}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <p className="text-muted-foreground text-sm">
                            外部系统向 <code className="bg-muted rounded px-1">/api/email/push</code> 推送邮件时，请在{" "}
                            <code className="bg-muted rounded px-1">x-api-key</code> 请求头中携带该 Key。收件地址固定为本邮箱。
                        </p>
                        <div className="bg-muted flex items-center gap-2 rounded-md px-3 py-2">
                            <code className="flex-1 truncate font-mono text-sm">{keyRow?.api_key}</code>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    copytext(keyRow.api_key);
                                    toast({ title: "Key 已复制", color: "success" });
                                }}
                            >
                                复制
                            </Button>
                        </div>
                        <div>
                            <p className="text-muted-foreground mb-1 text-xs font-medium">调用示例</p>
                            <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                                {curlExample}
                            </pre>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="mt-1"
                                onClick={() => {
                                    copytext(curlExample);
                                    toast({ title: "示例已复制", color: "success" });
                                }}
                            >
                                复制示例
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={regenerateKey}>
                            重新生成（旧 Key 失效）
                        </Button>
                        <Button variant="outline" onClick={() => setKeyRow(null)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default MailboxPage;
