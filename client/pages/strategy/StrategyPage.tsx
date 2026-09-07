import { useEffect, useState } from "react";
import { StrategyRouter, MailboxRouter } from "../../api/instance";
import StrategyFormModal from "./StrategyFormModal";
import StrategyList from "./StrategyList";
import StrategyTable from "./StrategyTable";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { cn } from "../../lib/utils";
import { inTauthSession } from "../../methods/tauth";
import { toast } from "../../methods/notify";

function fmtTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tempStatus(s: any): { label: string; className: string } {
    if (s.grant_expired) return { label: "已失效", className: "bg-red-100 text-red-700 border-transparent" };
    if (!s.grant_active) return { label: "未生效", className: "bg-amber-100 text-amber-700 border-transparent" };
    return s.enabled === 1
        ? { label: "生效中", className: "bg-emerald-100 text-emerald-700 border-transparent" }
        : { label: "已停用", className: "bg-muted text-muted-foreground border-transparent" };
}

const StrategyPage = () => {
    const tauth = inTauthSession();
    const [strategyList, setStrategyList] = useState<any[]>([]);
    const [focusStrategy, setFocusStrategy] = useState<any | null>(null);
    const [isModalOpen, setModalOpen] = useState(false);
    const [tab, setTab] = useState<"persistent" | "temp">("persistent");
    const [grants, setGrants] = useState<any[]>([]);
    const [tauthInfo, setTauthInfo] = useState<any>(null);

    function refreshList() {
        StrategyRouter.list({}, (data: any) => {
            const result = data.data || data;
            setStrategyList(result.list || []);
        });
        if (tauth) {
            MailboxRouter.tauthInfo({}, (data: any) => {
                const result = data?.data || data;
                setTauthInfo(result);
            });
        } else {
            MailboxRouter.grantList({}, (data: any) => {
                const result = data?.data || data;
                setGrants(result?.list || []);
            });
        }
    }

    function submitSave(body: any) {
        StrategyRouter.save({ strategy: body }, () => {
            toast({ title: body.id ? "修改成功" : "添加成功", color: "primary" });
            setModalOpen(false);
            setFocusStrategy(null);
            refreshList();
        });
    }

    function submitDelete(item: any) {
        StrategyRouter.delete({ id: item.id }, () => {
            toast({ title: "删除成功", color: "primary" });
            refreshList();
        });
    }

    function toggleStrategy(row: any, enabled: boolean) {
        StrategyRouter.save({ strategy: { ...row, enabled: enabled ? 1 : 0 } }, () => {
            toast({ title: enabled ? "策略已启用" : "策略已停用", color: "primary" });
            refreshList();
        });
    }

    function openCreate() {
        setFocusStrategy(null);
        setModalOpen(true);
    }

    function openEdit(row: any) {
        setFocusStrategy(row);
        setModalOpen(true);
    }

    useEffect(() => {
        refreshList();
    }, []);

    const persistent = strategyList.filter((s) => (s.scope || "persistent") === "persistent");
    const temp = strategyList.filter((s) => s.scope === "temp");
    const grantMap = new Map(grants.map((g) => [g.id, g]));

    // 临时策略的收件人锁定为授权邮箱（持有者与管理员一致，服务端亦强制）
    const lockToPattern = tauth
        ? tauthInfo?.address
        : focusStrategy?.scope === "temp"
            ? focusStrategy?.to_pattern
            : undefined;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            {tauth ? (
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="text-sm">
                        <p className="font-medium">临时转发策略</p>
                        {tauthInfo && (
                            <p className="text-muted-foreground mt-1">
                                授权邮箱 {tauthInfo.address} · 有效期至 {fmtTime(tauthInfo.end_time)}，过期后策略自动失效
                            </p>
                        )}
                    </div>
                    <Button onClick={openCreate} variant="outline">
                        新建转发策略
                    </Button>
                </div>
            ) : (
                <div className="flex items-end justify-between gap-4">
                    <div className="flex w-full flex-col gap-2 md:w-1/3">
                        <Label htmlFor="default-forward">默认转发邮箱</Label>
                        <Input
                            id="default-forward"
                            defaultValue={localStorage.getItem("default_forward") || ""}
                            onChange={(e) => localStorage.setItem("default_forward", e.target.value)}
                        />
                    </div>
                    {tab === "persistent" && (
                        <Button onClick={openCreate} variant="outline">
                            新建策略
                        </Button>
                    )}
                </div>
            )}

            {!tauth && (
                <div className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1">
                    {([
                        { key: "persistent", label: "持续策略" },
                        { key: "temp", label: "临时策略" },
                    ] as const).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={cn(
                                "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all",
                                tab === key
                                    ? "bg-background text-foreground shadow-xs"
                                    : "hover:text-foreground",
                            )}
                        >
                            {label} ({key === "persistent" ? persistent.length : temp.length})
                        </button>
                    ))}
                </div>
            )}

            {tauth ? (
                <div className="rounded-lg border bg-card shadow-xs">
                    <Table className="table-fixed min-w-[640px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead>名称</TableHead>
                                <TableHead className="w-40">发件人</TableHead>
                                <TableHead className="w-44">转发到</TableHead>
                                <TableHead className="w-20">状态</TableHead>
                                <TableHead className="w-32 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {temp.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                                        暂无转发策略，点击右上角新建
                                    </TableCell>
                                </TableRow>
                            ) : (
                                temp.map((s) => {
                                    const st = tempStatus(s);
                                    return (
                                        <TableRow key={s.id}>
                                            <TableCell>
                                                <div className="truncate" title={s.name}>{s.name}</div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground truncate text-xs">{s.from_pattern}</TableCell>
                                            <TableCell className="truncate">{s.forward_to}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(st.className)}>{st.label}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-row justify-end gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>编辑</Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => submitDelete(s)}
                                                    >
                                                        删除
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            ) : tab === "persistent" ? (
                <>
                    <div className="hidden w-full md:block">
                        <StrategyTable
                            strategyList={persistent}
                            openEdit={openEdit}
                            deleteStrategy={submitDelete}
                            toggleStrategy={toggleStrategy}
                        />
                    </div>
                    <div className="block w-full md:hidden">
                        <StrategyList
                            strategyList={persistent}
                            openEdit={openEdit}
                            deleteStrategy={submitDelete}
                            toggleStrategy={toggleStrategy}
                        />
                    </div>
                </>
            ) : (
                <div className="rounded-lg border bg-card shadow-xs">
                    <Table className="table-fixed min-w-[820px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead>名称</TableHead>
                                <TableHead className="w-52">授权邮箱</TableHead>
                                <TableHead className="w-44">转发到</TableHead>
                                <TableHead className="w-32">授权窗口</TableHead>
                                <TableHead className="w-24">状态</TableHead>
                                <TableHead className="w-32 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {temp.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                                        暂无临时策略（由临时授权的持有者产生，或授权时预设）
                                    </TableCell>
                                </TableRow>
                            ) : (
                                temp.map((s) => {
                                    const grant = grantMap.get(s.grant_id || "");
                                    const st = tempStatus(s);
                                    return (
                                        <TableRow key={s.id}>
                                            <TableCell>
                                                <div className="truncate" title={s.name}>{s.name}</div>
                                            </TableCell>
                                            <TableCell className="truncate">{s.to_pattern}</TableCell>
                                            <TableCell className="truncate">{s.forward_to}</TableCell>
                                            <TableCell className="text-muted-foreground text-xs">
                                                {grant ? `${fmtTime(grant.start_time)} ~ ${fmtTime(grant.end_time)}` : "-"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(st.className)}>{st.label}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-row justify-end gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>编辑</Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => submitDelete(s)}
                                                    >
                                                        删除
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <StrategyFormModal
                isOpen={isModalOpen}
                onOpenChange={(v) => { setModalOpen(false); if (!v) setFocusStrategy(null); }}
                onSubmit={submitSave}
                strategy={focusStrategy}
                lockToPattern={lockToPattern}
            />
        </div>
    );
};

export default StrategyPage;
