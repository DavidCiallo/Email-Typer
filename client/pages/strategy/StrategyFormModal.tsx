import { useEffect, useRef, useState } from "react";
import { StrategyTemplateRouter } from "../../api/instance";
import { cn } from "../../lib/utils";
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
    // a template arrives as a seed with no id: it fills the form but creates
    const isEdit = !!strategy?.id;
    const seed = strategy || {};
    const [enabled, setEnabled] = useState("1");
    const [action, setAction] = useState("send");
    const [templates, setTemplates] = useState<any[]>([]);
    const [applied, setApplied] = useState<any | null>(null);
    // the inputs are uncontrolled, so switching template remounts them by key
    const [seedKey, setSeedKey] = useState(0);
    const [fields, setFields] = useState({ name: "", from_pattern: "", to_pattern: "", subject_pattern: "", forward_to: "", webhook_url: "" });

    useEffect(() => {
        if (isOpen) {
            setEnabled(seed.enabled !== undefined ? String(seed.enabled) : "1");
            setAction(seed.action || "send");
            setApplied(null);
            setSeedKey((k) => k + 1);
            setFields({
                name: seed.name || "",
                from_pattern: seed.from_pattern || "",
                to_pattern: seed.to_pattern || "",
                subject_pattern: seed.subject_pattern || "",
                forward_to: seed.forward_to || "",
                webhook_url: seed.webhook_url || "",
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        StrategyTemplateRouter.list({}, (res: any) => {
            const result = res?.data || res;
            setTemplates(result?.list || []);
        });
    }, [isOpen]);

    /** fill the form from a template without closing the dialog */
    function applyTemplate(t: any) {
        setApplied(t);
        setAction(t.action || "send");
        setFields({
            name: t.name || "",
            from_pattern: t.from_pattern || "",
            to_pattern: t.to_pattern || "",
            subject_pattern: t.subject_pattern || "",
            forward_to: t.forward_to || "",
            webhook_url: t.webhook_url || "",
        });
        setSeedKey((k) => k + 1);
    }

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) {
            event.preventDefault();
        }
        const formData = Object.fromEntries(new FormData(formRef.current!).entries());

        onSubmit({
            id: strategy?.id,
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
                <form ref={formRef} key={seedKey} onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {!isEdit && templates.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <Label>套用模板</Label>
                            <div className="flex flex-wrap gap-2">
                                {templates.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => applyTemplate(t)}
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                                            applied?.id === t.id
                                                ? "border-primary bg-primary/10 text-foreground"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                        title={t.note || `${t.from_pattern} · ${t.subject_pattern}`}
                                    >
                                        {t.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="strategy-name">策略名称</Label>
                        <Input
                            id="strategy-name"
                            name="name"
                            required
                            placeholder="给策略起个名字"
                            defaultValue={fields.name}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="strategy-from">发件人</Label>
                        <Input
                            id="strategy-from"
                            name="fromPattern"
                            placeholder="* 匹配所有人，支持 *@domain.com 或 user@* 等通配"
                            defaultValue={fields.from_pattern}
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
                                defaultValue={fields.to_pattern}
                            />
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="strategy-subject">主题匹配</Label>
                        <Input
                            id="strategy-subject"
                            name="subjectPattern"
                            placeholder="* 匹配所有，也可填具体关键词"
                            defaultValue={fields.subject_pattern}
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
                                defaultValue={fields.forward_to || localStorage.getItem("default_forward") || ""}
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
                                defaultValue={fields.webhook_url}
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
