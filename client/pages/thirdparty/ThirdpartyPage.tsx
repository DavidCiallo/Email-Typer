import { Header } from "../../components/header/Header";
import { useEffect, useRef, useState } from "react";
import { ThirdpartyRouter } from "../../api/instance";
import { Button, Card, CardBody, Chip, Form, Input, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Tooltip } from "@heroui/react";
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
        <div className="max-w-screen">
            <Header name="三方邮箱" />
            <div className="w-full flex flex-col flex-wrap px-[5vw] pt-6">
                <div className="w-full flex flex-row justify-end items-center mb-4">
                    <Button onClick={openCreate} color="primary" variant="bordered">添加邮箱</Button>
                </div>
                <div className="w-full hidden md:block">
                    <Table aria-label="三方邮箱列表">
                        <TableHeader>
                            <TableColumn>邮箱</TableColumn>
                            <TableColumn>密码</TableColumn>
                            <TableColumn>登录站点</TableColumn>
                            <TableColumn>关联邮箱</TableColumn>
                            <TableColumn>备注</TableColumn>
                            <TableColumn>操作</TableColumn>
                        </TableHeader>
                        <TableBody emptyContent="暂无数据">
                            {list.map((row: any) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <span>{row.email}</span>
                                        <span
                                            className="text-primary cursor-pointer ml-2 text-xs"
                                            onClick={() => { copytext(row.email); toast({ title: "邮箱已复制", color: "success" }); }}
                                        >复制</span>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip content="点击复制" delay={500}>
                                            <span
                                                className="cursor-pointer"
                                                onClick={() => { copytext(row.password); toast({ title: "密码已复制", color: "success" }); }}
                                            >
                                                ******
                                            </span>
                                        </Tooltip>
                                        <span
                                            className="text-primary cursor-pointer ml-2 text-xs"
                                            onClick={() => { copytext(row.password); toast({ title: "密码已复制", color: "success" }); }}
                                        >复制</span>
                                    </TableCell>
                                    <TableCell>
                                        {row.login_site ? (
                                            <a href={row.login_site} target="_blank" rel="noopener" className="text-primary underline">{row.login_site}</a>
                                        ) : "-"}
                                    </TableCell>
                                    <TableCell>{row.link_email || "-"}</TableCell>
                                    <TableCell>{row.remark || "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="light" onClick={() => openEdit(row)}>编辑</Button>
                                            <Button size="sm" color="danger" variant="light" onClick={() => submitDelete(row)}>删除</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <div className="w-full block sm:hidden">
                    {list.map((row: any) => (
                        <Card key={row.id} className="w-full max-w-full my-1">
                            <CardBody className="max-w-[90vw] mx-auto">
                                <div className="flex flex-row items-center overflow-x-hidden">
                                    <Chip color="primary" variant="bordered" className="text-primary shrink-0">
                                        <div className="w-8 text-center">邮箱</div>
                                    </Chip>
                                    <span className="text-sm ml-1 truncate">{row.email}</span>
                                    <span
                                        className="text-primary cursor-pointer ml-2 text-xs shrink-0"
                                        onClick={() => { copytext(row.email); toast({ title: "邮箱已复制", color: "success" }); }}
                                    >复制</span>
                                </div>
                                <div className="flex flex-row items-center mt-2 overflow-x-hidden">
                                    <Chip color="primary" variant="bordered" className="text-primary shrink-0">
                                        <div className="w-8 text-center">密码</div>
                                    </Chip>
                                    <span className="text-sm ml-1">******</span>
                                    <span
                                        className="text-primary cursor-pointer ml-2 text-xs shrink-0"
                                        onClick={() => { copytext(row.password); toast({ title: "密码已复制", color: "success" }); }}
                                    >复制</span>
                                </div>
                                <div className="flex flex-row items-center mt-2 overflow-x-hidden">
                                    <Chip color="primary" variant="bordered" className="text-primary shrink-0">
                                        <div className="w-8 text-center">站点</div>
                                    </Chip>
                                    <span className="text-sm ml-1 truncate">
                                        {row.login_site ? (
                                            <a href={row.login_site} target="_blank" rel="noopener" className="text-primary underline">{row.login_site}</a>
                                        ) : "-"}
                                    </span>
                                </div>
                                <div className="flex flex-row items-center mt-2 overflow-x-hidden">
                                    <Chip color="primary" variant="bordered" className="text-primary shrink-0">
                                        <div className="w-8 text-center">关联</div>
                                    </Chip>
                                    <span className="text-sm ml-1 truncate">{row.link_email || "-"}</span>
                                </div>
                                <div className="flex flex-row items-center mt-2 overflow-x-hidden">
                                    <Chip color="primary" variant="bordered" className="text-primary shrink-0">
                                        <div className="w-8 text-center">备注</div>
                                    </Chip>
                                    <span className="text-sm ml-1 truncate">{row.remark || "-"}</span>
                                </div>
                                <div className="flex gap-2 mt-3 justify-end">
                                    <Button size="sm" variant="light" onClick={() => openEdit(row)}>编辑</Button>
                                    <Button size="sm" color="danger" variant="light" onClick={() => submitDelete(row)}>删除</Button>
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                    {list.length === 0 && <div className="text-center text-gray-400 py-8">暂无数据</div>}
                </div>
            </div>

            <Modal isOpen={modalOpen} onOpenChange={setModalOpen} className="w-full">
                <ModalContent className="md:min-w-[600px]">
                    {(onClose) => (
                        <>
                            <ModalHeader>{isEdit ? "编辑邮箱" : "添加邮箱"}</ModalHeader>
                            <ModalBody>
                                <Form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
                                    <Input
                                        isRequired
                                        label="邮箱"
                                        name="email"
                                        placeholder="请输入邮箱地址"
                                        variant="bordered"
                                        labelPlacement="outside"
                                    />
                                    <Input
                                        isRequired
                                        label="密码"
                                        name="password"
                                        placeholder="请输入密码"
                                        variant="bordered"
                                        labelPlacement="outside"
                                    />
                                    <Input
                                        label="登录站点"
                                        name="loginSite"
                                        placeholder="自动根据邮箱后缀填充"
                                        variant="bordered"
                                        labelPlacement="outside"
                                    />
                                    <Input
                                        label="关联邮箱"
                                        name="linkEmail"
                                        placeholder="关联的其他邮箱"
                                        variant="bordered"
                                        labelPlacement="outside"
                                    />
                                    <Input
                                        label="备注"
                                        name="remark"
                                        placeholder="备注信息"
                                        variant="bordered"
                                        labelPlacement="outside"
                                    />
                                </Form>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="primary" size="sm" onPress={() => handleSubmit()}>
                                    保存
                                </Button>
                                <Button color="danger" size="sm" variant="light" onPress={onClose}>
                                    取消
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
};

export default ThirdpartyPage;
