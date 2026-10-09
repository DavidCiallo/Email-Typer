import { useEffect, useState } from "react";
import { StrategyTemplateRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table";
import { toast } from "../../methods/notify";

interface Props {
    /** tauth holders read and apply templates, but cannot change the shared set */
    readOnly?: boolean;
}

const EMPTY = { name: "", from_pattern: "*", subject_pattern: "*", action: "send", forward_to: "", webhook_url: "", note: "" };

/** Shared strategy templates: admins and tauth holders see the same list. */
const StrategyTemplates = ({ readOnly }: Props) => {
    const [list, setList] = useState<any[]>([]);
    const [editing, setEditing] = useState<any | null>(null);

    function refresh() {
        StrategyTemplateRouter.list({}, (res: any) => {
            const result = res?.data || res;
            setList(result?.list || []);
        });
    }

    useEffect(() => { refresh(); }, []);

    function save() {
        if (!editing) return;
        if (!editing.name?.trim()) return toast({ title: "请填写模板名称", color: "danger" });
        if (editing.action === "webhook" && !editing.webhook_url?.trim()) {
            return toast({ title: "请填写回调地址", color: "danger" });
        }
        if (editing.action === "send" && !editing.forward_to?.trim()) {
            return toast({ title: "请填写转发邮箱", color: "danger" });
        }
        StrategyTemplateRouter.save({ template: editing }, (res: any) => {
            if (res?.success === false) return toast({ title: res.message || "保存失败", color: "danger" });
            toast({ title: editing.id ? "模板已更新" : "模板已添加", color: "success" });
            setEditing(null);
            refresh();
        });
    }

    function remove(row: any) {
        StrategyTemplateRouter.delete({ id: row.id }, (res: any) => {
            if (res?.success === false) return toast({ title: res.message || "删除失败", color: "danger" });
            toast({ title: "已删除", color: "primary" });
            refresh();
        });
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
                <p className="text-muted-foreground text-sm">
                    模板保存的是一套现成的匹配与动作设置，新建策略时会在弹窗顶部显示成一排标签，点一下即可套用。收件人不在模板里，套用后按需填写。
                    {readOnly && " 模板由管理员维护。"}
                </p>
                {!readOnly && (
                    <Button variant="outline" onClick={() => setEditing({ ...EMPTY })}>新建模板</Button>
                )}
            </div>

            <div className="rounded-lg border bg-card shadow-xs">
                <Table className="table-fixed min-w-[720px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-44">模板名称</TableHead>
                            <TableHead className="w-40">发件人</TableHead>
                            <TableHead className="w-40">主题匹配</TableHead>
                            <TableHead>命中后</TableHead>
                            {!readOnly && <TableHead className="w-52 text-right">操作</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {list.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={readOnly ? 4 : 5} className="text-muted-foreground h-24 text-center">
                                    {readOnly ? "暂无模板，请联系管理员添加" : "暂无模板，点击右上角新建"}
                                </TableCell>
                            </TableRow>
                        ) : (
                            list.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <div className="truncate" title={row.name}>{row.name}</div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground truncate text-xs" title={row.from_pattern}>
                                        {row.from_pattern}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground truncate text-xs" title={row.subject_pattern}>
                                        {row.subject_pattern}
                                    </TableCell>
                                    <TableCell className="truncate" title={row.action === "webhook" ? row.webhook_url : row.forward_to}>
                                        {row.action === "webhook" ? `调用 ${row.webhook_url}` : `转发 ${row.forward_to}`}
                                    </TableCell>
                                    {!readOnly && (
                                        <TableCell>
                                            <div className="flex flex-row justify-end gap-2">
                                                <Button size="sm" variant="outline" onClick={() => setEditing({ ...row })}>编辑</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => remove(row)}
                                                >
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{editing?.id ? "编辑模板" : "新建模板"}</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="tpl-name">模板名称</Label>
                                <Input
                                    id="tpl-name"
                                    value={editing.name}
                                    placeholder="如：验证码邮件转发"
                                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="tpl-from">发件人</Label>
                                <Input
                                    id="tpl-from"
                                    value={editing.from_pattern}
                                    placeholder="* 匹配所有人，支持 *@domain.com 等通配"
                                    onChange={(e) => setEditing({ ...editing, from_pattern: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="tpl-subject">主题匹配</Label>
                                <Input
                                    id="tpl-subject"
                                    value={editing.subject_pattern}
                                    placeholder="* 匹配所有，也可填具体关键词"
                                    onChange={(e) => setEditing({ ...editing, subject_pattern: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>命中后执行</Label>
                                <Select
                                    value={editing.action}
                                    onValueChange={(v) => setEditing({ ...editing, action: v })}
                                >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="send">转发邮件</SelectItem>
                                        <SelectItem value="webhook">调用 URL</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {editing.action === "webhook" ? (
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="tpl-webhook">回调地址</Label>
                                    <Input
                                        id="tpl-webhook"
                                        type="url"
                                        value={editing.webhook_url}
                                        placeholder="https://example.com/hook"
                                        onChange={(e) => setEditing({ ...editing, webhook_url: e.target.value })}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="tpl-forward">转发邮箱</Label>
                                    <Input
                                        id="tpl-forward"
                                        value={editing.forward_to}
                                        placeholder="匹配成功后将邮件转发到此邮箱"
                                        onChange={(e) => setEditing({ ...editing, forward_to: e.target.value })}
                                    />
                                </div>
                            )}
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="tpl-note">说明</Label>
                                <Input
                                    id="tpl-note"
                                    value={editing.note}
                                    placeholder="这个模板用在什么场景（可选）"
                                    onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button size="sm" onClick={save}>保存</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>取消</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default StrategyTemplates;
