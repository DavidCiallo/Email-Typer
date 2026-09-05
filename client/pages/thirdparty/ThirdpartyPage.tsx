import { useEffect, useRef, useState } from "react";
import { ThirdpartyRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
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
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip";
import { toast } from "../../methods/notify";
import { copytext } from "../../methods/text";

const ThirdpartyPage = () => {
    const [list, setList] = useState<any[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const isEdit = !!editingId;

    function refreshList() {
        ThirdpartyRouter.list({}, (data: any) => {
            const result = data.data || data;
            setList(result.list || []);
        });
    }

    function openCreate() {
        setEditingId(null);
        setModalOpen(true);
    }

    function openEdit(row: any) {
        setEditingId(row.id);
        // defer form fill to next tick so ref is attached
        setTimeout(() => {
            if (!formRef.current) return;
            (formRef.current.querySelector("[name='email']") as HTMLInputElement).value = row.email || "";
            (formRef.current.querySelector("[name='password']") as HTMLInputElement).value = row.password || "";
            (formRef.current.querySelector("[name='login_site']") as HTMLInputElement).value = row.login_site || "";
            (formRef.current.querySelector("[name='link_email']") as HTMLInputElement).value = row.link_email || "";
            (formRef.current.querySelector("[name='remark']") as HTMLInputElement).value = row.remark || "";
        }, 0);
        setModalOpen(true);
    }

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) {
            event.preventDefault();
            return;
        }
        const formData = Object.fromEntries(new FormData(formRef.current!).entries());

        const data: Record<string, string> = {
            email: formData.email.toString().trim(),
            password: formData.password.toString().trim(),
            login_site: formData.loginSite.toString().trim(),
            link_email: formData.linkEmail.toString().trim(),
            remark: formData.remark.toString().trim(),
        };

        // Auto-fill login_site from email domain if not provided
        if (!data.login_site) {
            const match = data.email.match(/@(.+)/);
            if (match) {
                data.login_site = "https://mail." + match[1];
            }
        }

        ThirdpartyRouter.save({
            id: editingId || undefined,
            thirdparty: data,
        }, () => {
            toast({ title: editingId ? "修改成功" : "添加成功", color: "primary" });
            setModalOpen(false);
            refreshList();
        });
    };

    function submitDelete(row: any) {
        ThirdpartyRouter.delete({ id: row.id }, () => {
            toast({ title: "删除成功", color: "primary" });
            refreshList();
        });
    }

    useEffect(() => {
        refreshList();
    }, []);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="flex w-full flex-row justify-end">
                <Button variant="outline" onClick={openCreate}>添加邮箱</Button>
            </div>
            <div className="hidden w-full md:block">
                <div className="rounded-lg border bg-card shadow-xs">
                    <Table className="table-fixed">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-52">邮箱</TableHead>
                                <TableHead className="w-32">密码</TableHead>
                                <TableHead>登录站点</TableHead>
                                <TableHead className="w-44">关联邮箱</TableHead>
                                <TableHead className="w-36">备注</TableHead>
                                <TableHead className="w-36 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        暂无数据
                                    </TableCell>
                                </TableRow>
                            ) : (
                                list.map((row: any) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="truncate" title={row.email}>{row.email}</span>
                                                <button
                                                    className="text-primary shrink-0 cursor-pointer text-xs hover:underline"
                                                    onClick={() => { copytext(row.email); toast({ title: "邮箱已复制", color: "success" }); }}
                                                >复制</button>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span
                                                            className="cursor-pointer"
                                                            onClick={() => { copytext(row.password); toast({ title: "密码已复制", color: "success" }); }}
                                                        >
                                                            ●●●●●●●●
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>点击复制</TooltipContent>
                                                </Tooltip>
                                                <button
                                                    className="text-primary shrink-0 cursor-pointer text-xs hover:underline"
                                                    onClick={() => { copytext(row.password); toast({ title: "密码已复制", color: "success" }); }}
                                                >复制</button>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="truncate" title={row.login_site || undefined}>
                                                {row.login_site ? (
                                                    <a href={row.login_site} target="_blank" rel="noopener" className="text-primary underline">{row.login_site}</a>
                                                ) : "-"}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="truncate" title={row.link_email || undefined}>{row.link_email || "-"}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="truncate" title={row.remark || undefined}>{row.remark || "-"}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => submitDelete(row)}
                                                >删除</Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
            <div className="block w-full sm:hidden">
                <div className="flex flex-col gap-2">
                    {list.map((row: any) => (
                        <Card key={row.id} className="w-full max-w-full py-3">
                            <CardContent className="flex flex-col gap-2 px-3">
                                <div className="flex items-center gap-1.5 overflow-x-hidden">
                                    <Badge variant="outline" className="shrink-0">邮箱</Badge>
                                    <span className="truncate text-sm">{row.email}</span>
                                    <button
                                        className="text-primary shrink-0 cursor-pointer ml-2 text-xs hover:underline"
                                        onClick={() => { copytext(row.email); toast({ title: "邮箱已复制", color: "success" }); }}
                                    >复制</button>
                                </div>
                                <div className="flex items-center gap-1.5 overflow-x-hidden">
                                    <Badge variant="outline" className="shrink-0">密码</Badge>
                                    <span className="text-sm">●●●●●●●●</span>
                                    <button
                                        className="text-primary shrink-0 cursor-pointer ml-2 text-xs hover:underline"
                                        onClick={() => { copytext(row.password); toast({ title: "密码已复制", color: "success" }); }}
                                    >复制</button>
                                </div>
                                <div className="flex items-center gap-1.5 overflow-x-hidden">
                                    <Badge variant="outline" className="shrink-0">站点</Badge>
                                    <span className="truncate text-sm">
                                        {row.login_site ? (
                                            <a href={row.login_site} target="_blank" rel="noopener" className="text-primary underline">{row.login_site}</a>
                                        ) : "-"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 overflow-x-hidden">
                                    <Badge variant="outline" className="shrink-0">关联</Badge>
                                    <span className="truncate text-sm">{row.link_email || "-"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 overflow-x-hidden">
                                    <Badge variant="outline" className="shrink-0">备注</Badge>
                                    <span className="truncate text-sm">{row.remark || "-"}</span>
                                </div>
                                <div className="mt-1 flex justify-end gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => submitDelete(row)}
                                    >删除</Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {list.length === 0 && (
                        <div className="text-muted-foreground py-8 text-center">暂无数据</div>
                    )}
                </div>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{isEdit ? "编辑邮箱" : "添加邮箱"}</DialogTitle>
                    </DialogHeader>
                    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="tp-email">邮箱</Label>
                            <Input
                                id="tp-email"
                                name="email"
                                required
                                placeholder="请输入邮箱地址"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="tp-password">密码</Label>
                            <Input
                                id="tp-password"
                                name="password"
                                required
                                placeholder="请输入密码"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="tp-site">登录站点</Label>
                            <Input
                                id="tp-site"
                                name="login_site"
                                placeholder="自动根据邮箱后缀填充"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="tp-link">关联邮箱</Label>
                            <Input
                                id="tp-link"
                                name="link_email"
                                placeholder="关联的其他邮箱"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="tp-remark">备注</Label>
                            <Input
                                id="tp-remark"
                                name="remark"
                                placeholder="备注信息"
                            />
                        </div>
                    </form>
                    <DialogFooter>
                        <Button size="sm" onClick={() => handleSubmit()}>
                            保存
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setModalOpen(false)}>
                            取消
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ThirdpartyPage;
