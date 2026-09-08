import { useEffect, useState } from "react";
import { SafetyRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
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

const TYPES = [
    { key: "sensitive_word", label: "敏感词" },
    { key: "blacklist", label: "黑名单" },
    { key: "whitelist", label: "白名单" },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];

const SafetyPage = () => {
    const [entries, setEntries] = useState<any[]>([]);
    const [isModalOpen, setModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<TypeKey>("blacklist");

    // form state
    const [formType, setFormType] = useState("blacklist");
    const [formValue, setFormValue] = useState("");
    const [formNote, setFormNote] = useState("");

    function refreshList() {
        SafetyRouter.list({}, (data: any) => {
            const result = data.data || data;
            setEntries(result.list || []);
        });
    }

    useEffect(() => {
        refreshList();
    }, []);

    function openCreate() {
        setEditingEntry(null);
        setFormType("blacklist");
        setFormValue("");
        setFormNote("");
        setModalOpen(true);
    }

    function openEdit(row: any) {
        setEditingEntry(row);
        setFormType(row.type);
        setFormValue(row.value);
        setFormNote(row.note || "");
        setModalOpen(true);
    }

    function submitSave() {
        if (!formValue.trim()) return toast({ title: "请填写规则内容", color: "danger" });

        const body: any = {
            type: formType,
            value: formValue.trim(),
            note: formNote.trim(),
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

    const filtered = entries.filter((e: any) => e.type === activeTab);
    const activeLabel = TYPES.find((t) => t.key === activeTab)?.label || "";

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <p className="text-muted-foreground text-sm">
                命中黑名单或敏感词的邮件会标记为「已拦截」并跳过转发；白名单发件人优先放行。
            </p>
            <div className="flex flex-row items-center justify-between">
                <div className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1">
                    {TYPES.map(({ key, label }) => {
                        const count = entries.filter((e: any) => e.type === key).length;
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
                            <TableHead className="w-56">备注</TableHead>
                            <TableHead className="w-32 text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                    暂无{activeLabel}规则
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((item: any) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <div className="truncate" title={item.value}>{item.value}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="truncate" title={item.note || undefined}>{item.note || "-"}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-row justify-end gap-2">
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
                            <Select value={formType} onValueChange={setFormType}>
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
        </div>
    );
};

export default SafetyPage;
