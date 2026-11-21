import { useEffect, useState } from "react";
import { SafetyRouter } from "../../api/instance";
import { MailboxRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/utils";
import { toast } from "../../methods/notify";
import SecurityEventsPanel from "./SecurityEventsPanel";

const TYPES = [
    { key: "sensitive_word", label: "敏感词" },
    { key: "blacklist", label: "黑名单" },
    { key: "whitelist", label: "白名单" },
] as const;

// 三期：统一列表 —— 「全部」把所有类型放在一起看，Tab 只作为快捷筛选
const TABS = [{ key: "all", label: "全部" }, ...TYPES] as const;

// 二期：规则不再由「类型」单独决定，判定看的是匹配字段 + 匹配方式 + 优先级。
const FIELD_LABEL: Record<string, string> = {
    from: "发件人",
    to: "收件人",
    subject: "主题",
    content: "主题+正文",
    any: "任意字段",
};

const MODE_LABEL: Record<string, string> = {
    glob: "通配",
    keyword: "关键词",
    regex: "正则",
    exact: "全等",
};

const SafetyPage = () => {
    const [entries, setEntries] = useState<any[]>([]);
    const [isModalOpen, setModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<string>("all");
    const [mailboxes, setMailboxes] = useState<any[]>([]);
    const [formScope, setFormScope] = useState("");

    // form state
    const [formType, setFormType] = useState("blacklist");
    const [formValue, setFormValue] = useState("");
    const [formNote, setFormNote] = useState("");
    // 二期新增：判定四维（匹配字段 / 匹配方式 / 优先级 / 是否启用）
    const [formField, setFormField] = useState("any");
    const [formMode, setFormMode] = useState("glob");
    const [formPriority, setFormPriority] = useState("50");
    const [formEnabled, setFormEnabled] = useState(true);

    function refreshList() {
        SafetyRouter.list({}, (data: any) => {
            const result = data.data || data;
            setEntries(result.list || []);
        });
    }

    useEffect(() => {
        refreshList();
        // 作用范围下拉需要邮箱地址，一次性拉全量
        MailboxRouter.list({}, (res: any) => {
            const result = res?.data || res;
            setMailboxes(result?.list || []);
        });
    }, []);

    function openCreate() {
        setEditingEntry(null);
        setFormType("blacklist");
        setFormValue("");
        setFormNote("");
        setFormField("any");
        setFormMode("glob");
        setFormPriority("50");
        setFormEnabled(true);
        setFormScope("");
        setModalOpen(true);
    }

    function openEdit(row: any) {
        setEditingEntry(row);
        setFormType(row.type);
        setFormValue(row.value);
        setFormNote(row.note || "");
        setFormField(row.match_field || "any");
        setFormMode(row.match_mode || "glob");
        setFormPriority(String(row.priority ?? 50));
        setFormEnabled(row.enabled !== false);
        setFormScope(row.scope || "");
        setModalOpen(true);
    }

    /** 换类型时把四维带成该类型的默认值，避免用户改完类型还要手动对齐。 */
    function changeType(next: string) {
        setFormType(next);
        if (next === "whitelist") {
            setFormField("from");
            setFormMode("glob");
            setFormPriority("10");
        } else if (next === "sensitive_word") {
            setFormField("content");
            setFormMode("keyword");
            setFormPriority("80");
        } else {
            setFormField("any");
            setFormMode("glob");
            setFormPriority("50");
        }
    }

    function toggleEnabled(item: any) {
        SafetyRouter.save(
            {
                entry: {
                    id: item.id,
                    type: item.type,
                    value: item.value,
                    note: item.note || "",
                    action: item.action,
                    match_field: item.match_field,
                    match_mode: item.match_mode,
                    priority: item.priority,
                    scope: item.scope || "",
                    enabled: item.enabled === false,
                },
            },
            (res: any) => {
                if (res?.success === false) {
                    toast({ title: res.message || "操作失败", color: "danger" });
                    return;
                }
                refreshList();
            }
        );
    }

    function submitSave() {
        if (!formValue.trim()) return toast({ title: "请填写规则内容", color: "danger" });

        const body: any = {
            type: formType,
            value: formValue.trim(),
            note: formNote.trim(),
            match_field: formField,
            match_mode: formMode,
            priority: Number(formPriority) || 0,
            enabled: formEnabled,
            scope: formScope,
        };
        if (editingEntry) {
            body.id = editingEntry.id;
        }

        SafetyRouter.save({ entry: body }, (res: any) => {
            if (res?.success === false) {
                toast({ title: res.message || "保存失败", color: "danger" });
                return;
            }
            toast({ title: editingEntry ? "修改成功" : "添加成功", color: "primary" });
            setModalOpen(false);
            refreshList();
        });
    }

    function submitDelete(item: any) {
        SafetyRouter.delete({ id: item.id }, () => {
            toast({ title: "删除成功", color: "primary" });
            refreshList();
        });
    }

    const filtered = activeTab === "all" ? entries : entries.filter((e: any) => e.type === activeTab);
    const activeLabel = TABS.find((t) => t.key === activeTab)?.label || "";
    const boxName = (id: string) => {
        if (!id) return "全局";
        const box = mailboxes.find((m: any) => m.id === id);
        return box?.address || box?.name || id;
    };

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <p className="text-muted-foreground text-sm">
                命中黑名单或敏感词的邮件会标记为「已拦截」并跳过转发；白名单发件人优先放行。
            </p>
            <div className="flex flex-row items-center justify-between">
                <div className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1">
                    {TABS.map(({ key, label }) => {
                        const count = key === "all" ? entries.length : entries.filter((e: any) => e.type === key).length;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={cn(
                                    "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all",
                                    activeTab === key
                                        ? "bg-background text-foreground shadow-xs"
                                        : "hover:text-foreground"
                                )}
                            >
                                {label} ({count})
                            </button>
                        );
                    })}
                </div>
                <Button variant="outline" onClick={openCreate}>
                    添加规则
                </Button>
            </div>

            <div className="rounded-lg border bg-card shadow-xs">
                <Table className="table-fixed">
                    <TableHeader>
                        <TableRow>
                            <TableHead>规则内容</TableHead>
                            <TableHead className="w-32">匹配</TableHead>
                            <TableHead className="w-16">优先级</TableHead>
                            <TableHead className="w-32">作用范围</TableHead>
                            <TableHead className="w-32">备注</TableHead>
                            <TableHead className="w-44 text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    暂无{activeLabel}规则
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((item: any) => (
                                <TableRow key={item.id} className={item.enabled === false ? "opacity-50" : undefined}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "shrink-0 border-transparent text-xs",
                                                    item.action === "allow"
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-red-100 text-red-700"
                                                )}
                                            >
                                                {item.action === "allow" ? "放行" : "阻止"}
                                            </Badge>
                                            <div className="truncate" title={item.value}>{item.value}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-muted-foreground truncate text-xs">
                                            {FIELD_LABEL[item.match_field] || item.match_field} ·{" "}
                                            {MODE_LABEL[item.match_mode] || item.match_mode}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs tabular-nums">{item.priority ?? 100}</span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="truncate text-xs" title={boxName(item.scope || "")}>
                                            {boxName(item.scope || "")}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="truncate" title={item.note || undefined}>{item.note || "-"}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-row justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => toggleEnabled(item)}>
                                                {item.enabled === false ? "启用" : "停用"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                                                编辑
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => submitDelete(item)}
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

            <Dialog open={isModalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>{editingEntry ? "编辑规则" : "添加规则"}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label>规则类型</Label>
                            <Select value={formType} onValueChange={changeType}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="选择类型" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TYPES.map((t) => (
                                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-2">
                                <Label>匹配字段</Label>
                                <Select value={formField} onValueChange={setFormField}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(FIELD_LABEL).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>匹配方式</Label>
                                <Select value={formMode} onValueChange={setFormMode}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(MODE_LABEL).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="safety-value">规则内容</Label>
                            <Input
                                id="safety-value"
                                placeholder={
                                    formType === "sensitive_word"
                                        ? "敏感词"
                                        : "邮箱地址，支持 * 通配符"
                                }
                                value={formValue}
                                onChange={(e) => setFormValue(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 items-end gap-3">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="safety-priority">优先级（数字小的先判）</Label>
                                <Input
                                    id="safety-priority"
                                    type="number"
                                    placeholder="50"
                                    value={formPriority}
                                    onChange={(e) => setFormPriority(e.target.value)}
                                />
                            </div>
                            <label className="flex items-center gap-2 pb-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="accent-primary size-4"
                                    checked={formEnabled}
                                    onChange={(e) => setFormEnabled(e.target.checked)}
                                />
                                启用这条规则
                            </label>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>作用范围</Label>
                            <Select
                                value={formScope || "__all__"}
                                onValueChange={(v) => setFormScope(v === "__all__" ? "" : v)}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">全局（所有邮箱）</SelectItem>
                                    {mailboxes.map((m: any) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.address || m.name || m.id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="safety-note">备注（可选）</Label>
                            <Input
                                id="safety-note"
                                placeholder="备注说明"
                                value={formNote}
                                onChange={(e) => setFormNote(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setModalOpen(false)}>取消</Button>
                        <Button onClick={submitSave}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SecurityEventsPanel />
        </div>
    );
};

export default SafetyPage;
