import { useRef } from "react";
import { Button, Form, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { toast } from "../../methods/notify";

interface props {
    isOpen: boolean,
    onOpenChange: any,
    onSubmit: (data: any) => void
}

const InboxAddStrategyModal = ({
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
        const { email, forward, callback, comment } = Object.fromEntries(new FormData(formRef.current!).entries());

        if (!email || email.toString().includes("@")) {
            return toast({ title: "邮箱格式错误", color: "danger" })
        }

        onSubmit({
            name: email.toString().toLocaleLowerCase(),
            from_pattern: "*",
            to_pattern: email.toString().toLocaleLowerCase(),
            subject_pattern: "*",
            forward_to: forward.toString().length ? forward.toString().toLocaleLowerCase() : localStorage.getItem("default_forward") || "",
            enabled: 1,
        })
    };

    const triggerSubmit = () => {
        handleCustomSubmit();
    };


    const ModalBodyContent = () => {
        return (
            <div className="flex flex-col w-full md:w-1/2 mx-auto">
                <Form ref={formRef} onSubmit={handleCustomSubmit}>
                    <Input
                        isRequired
                        label="邮箱"
                        name="email"
                        labelPlacement="outside"
                        placeholder="请输入账号"
                        variant="bordered"
                        className="mb-4"
                        endContent={
                            <div className="w-full text-right text-sm text-gray-600">
                                @noworrytourism.cn
                            </div>
                        }
                    />
                    <Input
                        label="转发邮箱"
                        name="forward"
                        labelPlacement="outside"
                        placeholder={localStorage.getItem("default_forward") || "默认为登录邮箱"}
                        variant="bordered"
                        className="mb-4"
                    />
                    <Input
                        label="回调地址"
                        name="callback"
                        labelPlacement="outside"
                        placeholder="可留空"
                        variant="bordered"
                        className="mb-4"
                    />
                    <Input
                        label="备注"
                        name="comment"
                        labelPlacement="outside"
                        placeholder="用于方便业务区分"
                        variant="bordered"
                    />
                </Form>
            </div>
        )
    }
    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} className="w-full">
            <ModalContent className="md:min-w-[800px] max-h-[80vh]">
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col">新建策略</ModalHeader>
                        <ModalBody className="overflow-y-auto">
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


export default InboxAddStrategyModal;
