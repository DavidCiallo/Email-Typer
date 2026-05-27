import { Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { formatEmail } from "../../methods/format";
import { copytext } from "../../methods/text";
import { toast } from "../../methods/notify";

interface props {
    email: any,
    isOpen: boolean,
    onOpenChange: any,
}

// Pre-compiled regexes for URL matching
const IMG_EXT_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?|$)/i;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const CLEAN_URL_RE = /[.,;:!?)\]}>]+$/;

function replaceUrls(html: string): string {
    if (!html) return html;
    return html.replace(URL_RE, (url) => {
        const clean = url.replace(CLEAN_URL_RE, "");
        if (IMG_EXT_RE.test(clean)) {
            return `<img src="${clean}" alt="" style="max-width:100%;height:auto;display:block;margin:8px 0;" referrerpolicy="no-referrer" />`;
        }
        const escaped = clean.replace(/'/g, "\\'");
        return `<span class="inline-flex items-center gap-1 mx-0.5 align-baseline"><span class="text-xs">[网络链接]</span> <a href="${clean}" target="_blank" rel="noopener" class="text-primary text-xs cursor-pointer underline" data-url="${clean}">打开</a> <a class="text-primary text-xs cursor-pointer underline" data-url="${clean}" onclick="event.preventDefault();navigator.clipboard.writeText('${escaped}');this.textContent='已复制';setTimeout(()=>this.textContent='复制',1500)">复制</a></span>`;
    });
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
                                {formatEmail(email.from).name || formatEmail(email.from).email}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-1 md:ml-5 overflow-x-hidden">
                        <Chip color="primary" variant="bordered" className="text-primary">
                            <div className="w-12 text-center">收件人</div>
                        </Chip>
                        <div className="text-sm ml-1">
                            <span className="text-sm">
                                {formatEmail(email.to).name || formatEmail(email.to).email}
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
                            className="border-1 border-gray-300 rounded-lg p-2 mt-2 w-full overflow-auto min-h-20"
                            dangerouslySetInnerHTML={{ __html: replaceUrls(email.html || email.text || "") }}
                        />
                    </div>
                </div>
            </div>
        )
    }

    const ModalFooterContent = () => {
        return (<>
            {
                (email.text || email.html || "")?.match(/\d{6}/g)
                    ?.filter((code: string, index: number, self: string[]) => self.indexOf(code) === index)
                    .map((code: string, index: number) => {
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
