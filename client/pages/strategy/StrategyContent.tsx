import { Button, Form, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { useRef } from "react";

interface props {
    email: any,
    isOpen: boolean,
    onOpenChange: any,
    onSubmit: (data: any) => void
}

const StrategyContentModal = ({
    email,
    isOpen,
    onOpenChange,
    onSubmit
}: props) => {
    const formRef = useRef<HTMLFormElement>(null);

    const handleCustomSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) {
            event.preventDefault();
            return;
        }
        const { name, fromPattern, toPattern, subjectPattern, forwardTo, enabled } = Object.fromEntries(new FormData(formRef.current!).entries());

        onSubmit({
            id: email.id,
            name: name.toString(),
            from_pattern: fromPattern.toString() || "*",
            to_pattern: toPattern.toString() || "*",
            subject_pattern: subjectPattern.toString() || "*",
            forward_to: forwardTo.toString(),
            enabled: enabled.toString() === "1" ? 1 : 0,
        })
    };

    const triggerSubmit = () => {
        handleCustomSubmit();
    };

    const ModalBodyContent = () => {
        return (
            <div className="flex flex-col">
                <div className="w-full flex flex-col justify-start items-center gap-1">
                    <Form className="w-full md:w-1/2 mx-auto" ref={formRef} onSubmit={handleCustomSubmit}>
                        <Input
                            label="策略名称"
                            name="name"
                            variant="bordered"
                            labelPlacement="outside"
                            defaultValue={email.name}
                        />
                        <Input
                            label="发件匹配"
                            name="fromPattern"
                            placeholder="* 表示匹配所有"
                            variant="bordered"
                            labelPlacement="outside"
                            defaultValue={email.from_pattern}
                        />
                        <Input
                            label="收件匹配"
                            name="toPattern"
                            placeholder="* 表示匹配所有"
                            variant="bordered"
                            labelPlacement="outside"
                            defaultValue={email.to_pattern}
                        />
                        <Input
                            label="主题匹配"
                            name="subjectPattern"
                            placeholder="* 表示匹配所有"
                            variant="bordered"
                            labelPlacement="outside"
                            defaultValue={email.subject_pattern}
                        />
                        <Input
                            label="转发邮箱"
                            name="forwardTo"
                            placeholder={localStorage.getItem("default_forward") || "默认为登录邮箱"}
                            variant="bordered"
                            labelPlacement="outside"
                            defaultValue={email.forward_to}
                        />
                    </Form>
                </div>
            </div>
        )
    }

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} className="w-full">
            <ModalContent className="md:min-w-[800px]">
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col">策略详情</ModalHeader>
                        <ModalBody>
                            <ModalBodyContent />
                        </ModalBody>
                        <ModalFooter>
                            <Button color="primary" size="sm" variant="light" onPress={triggerSubmit}>
                                保存
                            </Button>
                            <Button color="danger" size="sm" variant="light" onPress={onClose}>
                                关闭
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    )
};


export default StrategyContentModal;
