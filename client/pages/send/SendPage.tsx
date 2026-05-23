import { Header } from "../../components/header/Header";
import { useState } from "react";
import { Button, Card, CardBody, Input, Textarea } from "@heroui/react";
import { EmailRouter } from "../../api/instance";
import { toast } from "../../methods/notify";

const SenderPage = () => {
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("");
    const [justSend, setJustSend] = useState(false);

    async function sendEmail() {
        if (to.length < 2 || !to.includes("@")) return toast({ title: "请填写正确的邮箱地址", color: "danger" });
        if (!subject.length) return toast({ title: "请填写邮件标题", color: "danger" });
        if (!html.length) return toast({ title: "请填写邮件内容", color: "danger" });
        if (justSend) return toast({ title: "发送频率过高，请稍等", color: "danger" });
        setJustSend(true);
        setTimeout(() => setJustSend(false), 5000);
        EmailRouter.send({ email: { to, subject, html } }, (res: any) => {
            if (res.success) toast({ title: "发送成功", color: "primary" });
        })
    }
    return (
        <div className="max-w-screen">
            <Header name="发送邮件" />
            <div className="w-full flex flex-col flex-wrap px-[5vw] pt-6">
                <Card className="mb-2">
                    <CardBody className="flex flex-col md:flex-row">
                        <Input
                            label="收件人"
                            placeholder="请输入邮箱"
                            className="md:w-2/5 md:mr-6 my-1"
                            variant="underlined"
                            value={to}
                            onValueChange={setTo}
                        />
                        <Input
                            label="主题"
                            className="my-1"
                            placeholder="请输入主题"
                            variant="underlined"
                            value={subject}
                            onValueChange={setSubject}
                        />
                    </CardBody>
                </Card>
                <Card className="mt-2">
                    <CardBody>
                        <Textarea
                            label="内容"
                            placeholder="请输入内容"
                            variant="bordered"
                            value={html}
                            minRows={14}
                            onValueChange={setHtml}
                        />
                    </CardBody>
                </Card>
                <div className="mx-auto w-3/4 md:mx-0 md:w-100 mt-5 flex flex-col md:flex-row justify-end items-center">
                    <Button
                        color={justSend ? "default" : "primary"}
                        className="my-2" onClick={sendEmail}
                    >
                        发送邮件
                    </Button>
                </div>
            </div>
        </div>
    )
};


export default SenderPage;