import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    strategy?: any; // undefined = create mode, defined = edit mode
    /** temp strategies: recipient is locked to the granted mailbox address */
    lockToPattern?: string;
}

const StrategyFormModal = ({ isOpen, onOpenChange, onSubmit, strategy, lockToPattern }: Props) => {
    const formRef = useRef<HTMLFormElement>(null);
    const isEdit = !!strategy;
    const [enabled, setEnabled] = useState("1");
    const [action, setAction] = useState("send");

    useEffect(() => {
        if (isOpen) {
            setEnabled(isEdit ? String(strategy.enabled) : "1");
            setAction(isEdit ? strategy.action || "send" : "send");
        }
    }, [isOpen]);

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) {
            event.preventDefault();
        }
        const formData = Object.fromEntries(new FormData(formRef.current!).entries());

        onSubmit({
            id: isEdit ? strategy.id : undefined,
            name: formData.name.toString().trim(),
            from_pattern: formData.fromPattern.toString().trim() || "*",
            to_pattern: lockToPattern ?? (formData.toPattern.toString().trim() || "*"),
            subject_pattern: formData.subjectPattern.toString().trim() || "*",
            action,
            forward_to: action === "send" ? formData.forwardTo.toString().trim() : "",
            webhook_url: action === "webhook" ? formData.webhookUrl.toString().trim() : "",
            enabled: Number(enabled),
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "编辑策略" : "新建策略"}</DialogTitle>
                </DialogHeader>
                <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="strategy-name">策略名称</Label>
                        <Input
                            id="strategy-name"
                            name="name"
                            required
                            placeholder="给策略起个名字"
                            defaultValue={isEdit ? strategy.name : ""}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="strategy-from">发件人</Label>
                        <Input
                            id="strategy-from"
                            name="fromPattern"
                            placeholder="* 匹配所有人，支持 *@domain.com 或 user@* 等通配"
                            defaultValue={isEdit ? strategy.from_pattern : ""}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="strategy-to">收件人</Label>
                        {lockToPattern ? (
                            <Input id="strategy-to" value={lockToPattern} disabled />
                        ) : (
                            <Input
                                id="strategy-to"
                                name="toPattern"
                                placeholder="* 匹配所有人"
                                defaultValue={isEdit ? strategy.to_pattern : ""}
                            />
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="strategy-subject">主题匹配</Label>
                        <Input
                            id="strategy-subject"
                            name="subjectPattern"
                            placeholder="* 匹配所有，也可填具体关键词"
                            defaultValue={isEdit ? strategy.subject_pattern : ""}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label>命中后执行</Label>
                        <Select value={action} onValueChange={setAction}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="send">转发邮件</SelectItem>
                                <SelectItem value="webhook">调用 URL</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {action === "send" ? (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="strategy-forward">转发邮箱</Label>
                            <Input
                                id="strategy-forward"
                                name="forwardTo"
                                required
                                placeholder="匹配成功后将邮件转发到此邮箱"
                                defaultValue={isEdit ? strategy.forward_to : localStorage.getItem("default_forward") || ""}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="strategy-webhook">回调地址</Label>
                            <Input
                                id="strategy-webhook"
                                name="webhookUrl"
                                required
                                type="url"
                                placeholder="https://example.com/hook"
                                defaultValue={isEdit ? strategy.webhook_url : ""}
                            />
                            <p className="text-muted-foreground text-xs">
                                匹配成功后会向该地址发起 GET 请求，附带 from、to、subject、time、id 参数；失败重试 2 次。
                            </p>
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <Label>状态</Label>
                        <Select value={enabled} onValueChange={setEnabled}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="选择状态" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">启用</SelectItem>
                                <SelectItem value="0">停用</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </form>
                <DialogFooter>
                    <Button size="sm" onClick={() => handleSubmit()}>
                        保存
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default StrategyFormModal;
