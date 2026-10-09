import { useEffect, useState } from "react";
import { AutoTaskRouter, MailboxRouter } from "../../api/instance";
import { AutoTaskDTO } from "../../../shared/modules/autotask/autotask.interface";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { toast } from "../../methods/notify";
import { Plus, Trash2 } from "lucide-react";

const WEEKDAYS = [
    { key: "MO", label: "一" }, { key: "TU", label: "二" }, { key: "WE", label: "三" },
    { key: "TH", label: "四" }, { key: "FR", label: "五" }, { key: "SA", label: "六" },
    { key: "SU", label: "日" },
];

const EMPTY = (): Partial<AutoTaskDTO> & { params: Record<string, any> } => ({
    name: "",
    enabled: true as any,
    kind: "daily",
    time_of_day: "08:00",
    weekdays: [] as any,
    month_day: 1,
    time_zone: "Asia/Shanghai",
    action: "archive",
    params: { to: "", keyword: "", days: 30 },
});

function fmtTime(ts: number | null | undefined) {
    if (!ts) return "-";
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STATUS_LABEL: Record<string, string> = { ok: "成功", failed: "失败", running: "执行中" };

export default function AutoTaskPanel() {
    const [list, setList] = useState<AutoTaskDTO[]>([]);
    const [editing, setEditing] = useState<any | null>(null);
    const [senders, setSenders] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    function refresh() {
        AutoTaskRouter.list({}, (res: any) => {
            setList(res?.data?.list || []);
        });
    }

    useEffect(() => {
        refresh();
        MailboxRouter.list({}, (res: any) => {
            setSenders((res?.data?.list || []).map((b: any) => b.address));
        });
    }, []);

    function save() {
        if (!editing) return;
        if (!editing.name?.trim()) return toast({ title: "请填写任务名称", color: "danger" });
        if (editing.kind === "weekly" && !(editing.weekdays || []).length) {
            return toast({ title: "请选择每周执行的星期", color: "danger" });
        }
        setBusy(true);
        AutoTaskRouter.save({
            id: editing.id,
            name: editing.name,
            enabled: editing.enabled !== false,
            kind: editing.kind,
            time_of_day: editing.time_of_day,
            weekdays: editing.weekdays || [],
            month_day: Number(editing.month_day) || 1,
            time_zone: editing.time_zone || "Asia/Shanghai",
            action: editing.action,
            params: editing.params || {},
        }, (res: any) => {
            setBusy(false);
            if (res?.success === false) return toast({ title: res.message || "保存失败", color: "danger" });
            toast({ title: "已保存", color: "success" });
            setEditing(null);
            refresh();
        });
    }

    function remove(task: AutoTaskDTO) {
        AutoTaskRouter.delete({ id: task.id }, (res: any) => {
            if (res?.success === false) return toast({ title: res.message || "删除失败", color: "danger" });
            toast({ title: "已删除", color: "primary" });
            refresh();
        });
    }

    function runNow(task: AutoTaskDTO) {
        toast({ title: "已开始执行…", color: "primary" });
        AutoTaskRouter.runNow({ id: task.id }, (res: any) => {
            const result = res?.data || res;
            toast({
                title: result?.message || "执行完成",
                color: result?.status === "failed" ? "danger" : "success",
            });
            refresh();
        });
    }

    function setParam(key: string, value: any) {
        setEditing((prev: any) => ({ ...prev, params: { ...(prev.params || {}), [key]: value } }));
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-row items-center justify-between">
                <p className="text-muted-foreground text-sm">
                    按计划自动归档邮件，并可把本次归档结果作为日志邮件发出。服务器每 30 秒检查一次，停机期间错过的任务会在重启后补跑。
                </p>
                <Button size="sm" onClick={() => setEditing(EMPTY())}>
                    <Plus className="size-4" />
                    新建任务
                </Button>
            </div>

            {editing ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{editing.id ? "编辑任务" : "新建任务"}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label>任务名称</Label>
                            <Input
                                value={editing.name || ""}
                                placeholder="如：每天归档通知邮件"
                                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>动作</Label>
                            <Select
                                value={editing.action}
                                onValueChange={(v) => setEditing({ ...editing, action: v })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="archive">只归档邮件</SelectItem>
                                    <SelectItem value="archive_report">归档后发送日志邮件</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="flex flex-col gap-2">
                                <Label>频率</Label>
                                <Select
                                    value={editing.kind}
                                    onValueChange={(v) => setEditing({ ...editing, kind: v })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="daily">每天</SelectItem>
                                        <SelectItem value="weekly">每周</SelectItem>
                                        <SelectItem value="monthly">每月</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>执行时间</Label>
                                <Input
                                    type="time"
                                    value={editing.time_of_day || "08:00"}
                                    onChange={(e) => setEditing({ ...editing, time_of_day: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>时区</Label>
                                <Input
                                    value={editing.time_zone || "Asia/Shanghai"}
                                    onChange={(e) => setEditing({ ...editing, time_zone: e.target.value })}
                                />
                            </div>
                        </div>

                        {editing.kind === "weekly" && (
                            <div className="flex flex-col gap-2">
                                <Label>每周哪几天</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {WEEKDAYS.map((d) => {
                                        const on = (editing.weekdays || []).includes(d.key);
                                        return (
                                            <button
                                                key={d.key}
                                                type="button"
                                                onClick={() => {
                                                    const cur: string[] = editing.weekdays || [];
                                                    setEditing({
                                                        ...editing,
                                                        weekdays: on ? cur.filter((x) => x !== d.key) : [...cur, d.key],
                                                    });
                                                }}
                                                className={
                                                    "rounded-full border px-3 py-1 text-xs transition-colors " +
                                                    (on ? "bg-foreground text-background border-transparent" : "text-muted-foreground hover:text-foreground")
                                                }
                                            >
                                                周{d.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {editing.kind === "monthly" && (
                            <div className="flex flex-col gap-2">
                                <Label>每月几号</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    className="w-32"
                                    value={editing.month_day || 1}
                                    onChange={(e) => setEditing({ ...editing, month_day: Number(e.target.value) })}
                                />
                            </div>
                        )}

                        <div className="flex flex-col gap-3 rounded-lg border p-3">
                            <span className="text-sm font-medium">归档条件</span>
                            <div className="flex flex-col gap-2">
                                <Label>收件邮箱（多个用逗号分隔，留空表示不限）</Label>
                                <Input
                                    value={editing.params?.to || ""}
                                    placeholder="如：notice@example.com"
                                    onChange={(e) => setParam("to", e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>关键字（匹配主题或正文，留空表示不限）</Label>
                                <Input
                                    value={editing.params?.keyword || ""}
                                    placeholder="如：验证码"
                                    onChange={(e) => setParam("keyword", e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>早于多少天以前（0 表示不限）</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    className="w-32"
                                    value={editing.params?.days ?? 0}
                                    onChange={(e) => setParam("days", Number(e.target.value))}
                                />
                            </div>
                        </div>

                        {editing.action === "archive_report" && (
                            <div className="flex flex-col gap-3 rounded-lg border p-3">
                                <span className="text-sm font-medium">日志邮件</span>
                                <div className="flex flex-col gap-2">
                                    <Label>发件邮箱</Label>
                                    <Select
                                        value={editing.params?.from || ""}
                                        onValueChange={(v) => setParam("from", v)}
                                    >
                                        <SelectTrigger><SelectValue placeholder="选择发件邮箱" /></SelectTrigger>
                                        <SelectContent>
                                            {senders.map((s) => (
                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label>收件人（多个用逗号分隔）</Label>
                                    <Input
                                        value={editing.params?.report_to || ""}
                                        placeholder="如：admin@example.com"
                                        onChange={(e) => setParam("report_to", e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <Switch
                                checked={editing.enabled !== false}
                                onCheckedChange={(v) => setEditing({ ...editing, enabled: v })}
                            />
                            <span className="text-muted-foreground text-sm">
                                {editing.enabled !== false ? "启用" : "暂停"}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <Button disabled={busy} onClick={save}>保存</Button>
                            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            <Card>
                <CardHeader>
                    <CardTitle>自动任务</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    {list.length === 0 ? (
                        <p className="text-muted-foreground py-6 text-center text-sm">
                            还没有任务，点右上角「新建任务」添加
                        </p>
                    ) : (
                        list.map((task) => (
                            <div key={task.id} className="flex flex-col gap-2 rounded-lg border p-3">
                                <div className="flex flex-row items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="truncate font-medium">{task.name}</span>
                                        <span className="text-muted-foreground shrink-0 text-xs">
                                            {task.enabled ? "启用" : "暂停"}
                                        </span>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button size="sm" variant="outline" onClick={() => runNow(task)}>立即运行</Button>
                                        <Button size="sm" variant="outline" onClick={() => setEditing({ ...task, params: task.params || {} })}>编辑</Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-destructive hover:text-destructive"
                                            aria-label="删除"
                                            onClick={() => remove(task)}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="text-muted-foreground text-xs">
                                    {task.action === "archive_report" ? "归档并发送日志邮件" : "只归档邮件"}
                                    {" · "}
                                    {task.kind === "daily" ? "每天" : task.kind === "weekly" ? `每周${(task.weekdays || []).map((w) => WEEKDAYS.find((d) => d.key === w)?.label || w).join("")}` : `每月 ${task.month_day} 号`}
                                    {" "}
                                    {task.time_of_day}（{task.time_zone}）
                                    {" · 下次 "}{fmtTime(task.next_run_at)}
                                </div>
                                <div className="text-muted-foreground text-xs">
                                    上次 {fmtTime(task.last_run_at)}
                                    {task.last_status ? ` · ${STATUS_LABEL[task.last_status] || task.last_status}` : ""}
                                    {task.last_message ? ` · ${task.last_message}` : ""}
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
