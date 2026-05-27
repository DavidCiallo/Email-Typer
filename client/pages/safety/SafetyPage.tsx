import { Header } from "../../components/header/Header";
import { useEffect, useState } from "react";
import { SafetyRouter } from "../../api/instance";
import { Button, Input, Tabs, Tab, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem } from "@heroui/react";
import { toast } from "../../methods/notify";

const TYPES = [
    { key: "sensitive_word", label: "敏感词" },
    { key: "blacklist", label: "黑名单" },
    { key: "whitelist", label: "白名单" },
] as const;

const TYPE_LABELS: Record<string, string> = {
    blacklist: "黑名单",
    sensitive_word: "敏感词",
    whitelist: "白名单",
};

const SafetyPage = () => {
    const [entries, setEntries] = useState<any[]>([]);
    const [isModalOpen, setModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<any>(null);

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

        SafetyRouter.save({ entry: body }, () => {
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

    const activeTab = "blacklist";

    return (
        <div className="max-w-screen">
            <Header name="安全设置" />
            <div className="w-full flex flex-col flex-wrap px-[5vw] pt-6">
                <div className="w-full flex flex-row justify-end items-center mb-4">
                    <Button
                        onClick={openCreate}
                        color="primary" variant="bordered" className="text-primary"
                    >
                        添加规则
                    </Button>
                </div>

                <Tabs
                    aria-label="安全设置"
                    onSelectionChange={() => {}}
                >
                    {TYPES.map(({ key, label }) => {
                        const filtered = entries.filter((e: any) => e.type === key);
                        return (
                            <Tab key={key} title={`${label} (${filtered.length})`}>
                                <div className="mt-4">
                                    {filtered.length === 0 ? (
                                        <div className="text-gray-400 text-center py-8">暂无{label}规则</div>
                                    ) : (
                                        <Table aria-label={label} removeWrapper>
                                            <TableHeader>
                                                <TableColumn>规则内容</TableColumn>
                                                <TableColumn width={200}>备注</TableColumn>
                                                <TableColumn width={120}>操作</TableColumn>
                                            </TableHeader>
                                            <TableBody>
                                                {filtered.map((item: any) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{item.value}</TableCell>
                                                        <TableCell>{item.note || "-"}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-row gap-2">
                                                                <Button
                                                                    size="sm" variant="light" color="primary"
                                                                    onClick={() => openEdit(item)}
                                                                >
                                                                    编辑
                                                                </Button>
                                                                <Button
                                                                    size="sm" variant="light" color="danger"
                                                                    onClick={() => submitDelete(item)}
                                                                >
                                                                    删除
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                            </Tab>
                        );
                    })}
                </Tabs>
            </div>

            <Modal isOpen={isModalOpen} onOpenChange={setModalOpen}>
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>{editingEntry ? "编辑规则" : "添加规则"}</ModalHeader>
                            <ModalBody className="flex flex-col gap-4">
                                <Select
                                    label="规则类型"
                                    selectedKeys={[formType]}
                                    onSelectionChange={(keys) => {
                                        const v = Array.from(keys)[0] as string;
                                        if (v) setFormType(v);
                                    }}
                                >
                                    {TYPES.map(t => (
                                        <SelectItem key={t.key}>{t.label}</SelectItem>
                                    ))}
                                </Select>
                                <Input
                                    label="规则内容"
                                    placeholder={
                                        formType === "sensitive_word"
                                            ? "敏感词"
                                            : "邮箱地址，支持 * 通配符"
                                    }
                                    value={formValue}
                                    onValueChange={setFormValue}
                                />
                                <Input
                                    label="备注（可选）"
                                    placeholder="备注说明"
                                    value={formNote}
                                    onValueChange={setFormNote}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose}>取消</Button>
                                <Button color="primary" onPress={submitSave}>保存</Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
};

export default SafetyPage;
