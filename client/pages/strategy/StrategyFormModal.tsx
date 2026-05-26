import { useRef } from "react";
import { Button, Form, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from "@heroui/react";

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    strategy?: any; // undefined = create mode, defined = edit mode
}

const StrategyFormModal = ({ isOpen, onOpenChange, onSubmit, strategy }: Props) => {
    const formRef = useRef<HTMLFormElement>(null);
    const isEdit = !!strategy;

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) {
            event.preventDefault();
            return;
        }
        const formData = Object.fromEntries(new FormData(formRef.current!).entries());

        onSubmit({
            id: isEdit ? strategy.id : undefined,
            name: formData.name.toString().trim(),
            from_pattern: formData.fromPattern.toString().trim() || "*",
            to_pattern: formData.toPattern.toString().trim() || "*",
            subject_pattern: formData.subjectPattern.toString().trim() || "*",
            forward_to: formData.forwardTo.toString().trim(),
            enabled: Number(formData.enabled),
        });
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} className="w-full">
            <ModalContent className="md:min-w-[600px]">
                {(onClose) => (
                    <>
                        <ModalHeader>{isEdit ? "编辑策略" : "新建策略"}</ModalHeader>
                        <ModalBody>
                            <Form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
                                <Input
                                    isRequired
                                    label="策略名称"
                                    name="name"
                                    placeholder="给策略起个名字"
                                    variant="bordered"
                                    labelPlacement="outside"
                                    defaultValue={isEdit ? strategy.name : ""}
                                />
                                <Input
                                    label="发件人"
                                    name="fromPattern"
                                    placeholder="* 匹配所有人，支持 *@domain.com 或 user@* 等通配"
                                    variant="bordered"
                                    labelPlacement="outside"
                                    defaultValue={isEdit ? strategy.from_pattern : ""}
                                />
                                <Input
                                    label="收件人"
                                    name="toPattern"
                                    placeholder="* 匹配所有人"
                                    variant="bordered"
                                    labelPlacement="outside"
                                    defaultValue={isEdit ? strategy.to_pattern : ""}
                                />
                                <Input
                                    label="主题匹配"
                                    name="subjectPattern"
                                    placeholder="* 匹配所有，也可填具体关键词"
                                    variant="bordered"
                                    labelPlacement="outside"
                                    defaultValue={isEdit ? strategy.subject_pattern : ""}
                                />
                                <Input
                                    isRequired
                                    label="转发邮箱"
                                    name="forwardTo"
                                    placeholder="匹配成功后将邮件转发到此邮箱"
                                    variant="bordered"
                                    labelPlacement="outside"
                                    defaultValue={isEdit ? strategy.forward_to : localStorage.getItem("default_forward") || ""}
                                />
                                <Select
                                    label="状态"
                                    name="enabled"
                                    variant="bordered"
                                    labelPlacement="outside"
                                    defaultSelectedKeys={isEdit ? [String(strategy.enabled)] : ["1"]}
                                >
                                    <SelectItem key="1">启用</SelectItem>
                                    <SelectItem key="0">停用</SelectItem>
                                </Select>
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
    );
};

export default StrategyFormModal;
