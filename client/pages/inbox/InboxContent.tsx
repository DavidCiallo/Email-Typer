import { EmailImpl } from "../../../shared/impl";
import { Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { formatEmail } from "../../methods/format";
import { copytext } from "../../methods/text";
import { toast } from "../../methods/notify";

interface props {
    email: EmailImpl,
    isOpen: boolean,
    onOpenChange: any,
}

const InboxContentModal = ({
    email,
    isOpen,
    onOpenChange,
}: props) => {
    const ModalBodyContent = () => {
        return (
            <div className="flex flex-col">
                <div className="flex flex-col md:flex-row md:justify-start md:items-center">
                    <div className="flex flex-row items-center mt-1 overflow-x-hidden">
                        <Chip color="primary" variant="bordered" className="text-primary">
                            <div className="w-12 text-center">发件人</div>
                        </Chip>
                        <div className="text-sm ml-1">
                            <span className="text-sm">
                                {formatEmail(email.from).email}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-1 md:ml-5 overflow-x-hidden">
                        <Chip color="primary" variant="bordered" className="text-primary">
                            <div className="w-12 text-center">收件人</div>
                        </Chip>
                        <div className="text-sm ml-1">
                            <span className="text-sm">
                                {formatEmail(email.to).email}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-1 md:ml-5">
                        <Chip color="primary" variant="bordered" className="text-primary">
                            <div className="w-12 text-center">时间</div>
                        </Chip>
                        <div className="w-32 text-sm ml-1">
                            {new Date(Number(email.time)).toLocaleDateString() + " "}
                            {new Date(Number(email.time)).toLocaleTimeString()?.slice(0, -3)}
                        </div>
                    </div>
                </div>
                <div className="mt-3">
                    <div className="flex flex-row items-center">
                        <Chip color="primary" variant="bordered" className="text-primary">
                            <div className="w-12 text-center">标题</div>
                        </Chip>
                        <div className="text-sm ml-1">{email.subject}</div>
                    </div>
                    <div className="flex flex-col items-start mt-3">
                        <Chip color="primary" variant="bordered" className="text-primary">
                            <div className="w-12 text-center">正文</div>
                        </Chip>
                        <div
                            className="border-1 border-gray-300 rounded-lg p-2 mt-2 w-full overflow-auto"
                            dangerouslySetInnerHTML={{ __html: email.html || email.text }}
                        />
                    </div>
                </div>
            </div>
        )
    }

    const ModalFooterContent = () => {
        return (<>
            {
                (email.text || email.html || "")?.match(/(https?:\/\/[^\s]+)/g)
                    ?.map(url => url.split("]")[0])
                    .filter(
                        url => {
                            const usualStaticEnd = [".com", ".png", ".jpg", ".jpeg", ".gif", ".pdf", ".aspx"];
                            const notfile = !usualStaticEnd.some(end => url.endsWith(end));
                            const useful = url.split("/").slice(-1)[0].length > 16 || url.includes("?");
                            return notfile && useful;
                        }
                    )
                    .filter((url, index, self) => self.indexOf(url) === index)
                    .map((url, index) => {
                        return (
                            <Button
                                key={index} color="primary" size="sm" variant="light"
                                onClick={() => {
                                    copytext(url);
                                    toast({
                                        color: "success",
                                        title: `链接${index + 1} 复制成功`,
                                        description: url.slice(0, 36) + "..."
                                    })
                                }}
                            >
                                可用链接 {index + 1}
                            </Button>
                        )
                    })
            }
            {
                (email.text || email.html || "")?.match(/\d{6}/g)
                    ?.filter((url, index, self) => self.indexOf(url) === index)
                    .map((code, index) => {
                        return (
                            <Button
                                key={index} color="primary" size="sm" variant="light"
                                onClick={() => {
                                    copytext(code);
                                    toast({ color: "success", title: `验证码：${code} 复制成功` })
                                }}
                            >
                                验证码：{code}
                            </Button>
                        )
                    })
            }
        </>)
    }
    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} className="w-full">
            <ModalContent className="md:min-w-[80vw] max-h-[80vh]">
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col">邮件详情</ModalHeader>
                        <ModalBody className="overflow-y-auto">
                            <ModalBodyContent />
                        </ModalBody>
                        <ModalFooter>
                            <ModalFooterContent />
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


export default InboxContentModal;