import { useEffect, useState } from "react";
import { EmailRouter, AuthRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "../../methods/notify";

const SenderPage = () => {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("");
    const [justSend, setJustSend] = useState(false);
    const [fromDomains, setFromDomains] = useState<string[]>([]);

    useEffect(() => {
        AuthRouter.config({}, (res: any) => {
            if (res.success && res.data) {
                setFromDomains(res.data.allowed_from_domains || []);
            }
        });
    }, []);

    const placeholder = fromDomains.length
        ? `发件邮箱（仅支持 @${fromDomains.join(", @")}）`
        : "发件邮箱";

    async function sendEmail() {
        if (from.length < 2 || !from.includes("@")) return toast({ title: "请填写正确的发件邮箱", color: "danger" });
        if (to.length < 2 || !to.includes("@")) return toast({ title: "请填写正确的邮箱地址", color: "danger" });
        if (!subject.length) return toast({ title: "请填写邮件标题", color: "danger" });
        if (!html.length) return toast({ title: "请填写邮件内容", color: "danger" });
        if (justSend) return toast({ title: "发送频率过高，请稍等", color: "danger" });
        setJustSend(true);
        setTimeout(() => setJustSend(false), 5000);
        EmailRouter.send({ email: { from, to, subject, html } }, (res: any) => {
            if (res.success) {
                toast({ title: "发送成功", color: "success" });
            } else {
                toast({ title: res.message || "发送失败", color: "danger" });
            }
        })
    }
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <Card>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 md:flex-row">
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="send-to">收件人</Label>
                            <Input
                                id="send-to"
                                placeholder="请输入邮箱"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="send-subject">主题</Label>
                            <Input
                                id="send-subject"
                                placeholder="请输入主题"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="send-content">内容</Label>
                        <Textarea
                            id="send-content"
                            placeholder="请输入内容"
                            value={html}
                            rows={14}
                            onChange={(e) => setHtml(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end">
                <Input
                    placeholder={placeholder}
                    className="md:w-80"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                />
                <Button onClick={sendEmail} disabled={justSend} className="md:w-32">
                    发送邮件
                </Button>
            </div>
        </div>
    )
};


export default SenderPage;
