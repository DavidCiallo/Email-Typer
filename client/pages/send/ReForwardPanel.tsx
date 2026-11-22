import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { EmailRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { toast } from "../../methods/notify";

function fmtSize(n: number) {
    if (!n) return "0 KB";
    return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/**
 * 「重新转发」：转发时因体积超限没送达的附件，在这里勾选后补发。
 * 默认全不选——正文通常已经送达，用户要明确选几个才补。
 */
export default function ReForwardPanel(params: {
    sendLogId: string;
    emailId: string;
    onDone?: () => void;
}) {
    const { sendLogId, emailId, onDone } = params;
    const [atts, setAtts] = useState<any[]>([]);
    const [picked, setPicked] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setPicked([]);
        setAtts([]);
        if (!emailId) return;
        setLoading(true);
        EmailRouter.detail({ id: emailId }, (res: any) => {
            const data = res?.data || res;
            const list = Array.isArray(data?.attachments) ? data.attachments : [];
            setAtts(list);
            setLoading(false);
        });
    }, [emailId]);

    function toggle(idx: number) {
        setPicked((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
    }

    function submit() {
        if (picked.length === 0) return;
        setSubmitting(true);
        EmailRouter.forwardAgain({ sendlog_id: sendLogId, attachments: picked }, (res: any) => {
            setSubmitting(false);
            if (res?.success === false) {
                toast({ title: "补发失败", description: res?.message || "", color: "danger" });
                return;
            }
            toast({ title: "已补发", description: `共 ${picked.length} 个附件`, color: "success" });
            setPicked([]);
            onDone?.();
        });
    }

    if (loading) {
        return (
            <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                <Loader2 className="size-4 animate-spin" />
                加载附件列表…
            </div>
        );
    }
    if (atts.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">重新转发附件</span>
                <span className="text-muted-foreground text-xs">
                    选择需要补发的附件，正文会一并重发
                </span>
            </div>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {atts.map((a, idx) => (
                    <label
                        key={idx}
                        className={
                            a.skipped || !a.path
                                ? "text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm opacity-60"
                                : "hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                        }
                    >
                        <input
                            type="checkbox"
                            className="accent-primary size-4 shrink-0"
                            disabled={a.skipped || !a.path}
                            checked={picked.includes(idx)}
                            onChange={() => toggle(idx)}
                        />
                        <span className="min-w-0 flex-1 truncate">{a.filename || `附件 ${idx + 1}`}</span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {fmtSize(a.size)}
                        </span>
                        {(a.skipped || !a.path) && (
                            <span className="shrink-0 text-xs">未保存</span>
                        )}
                    </label>
                ))}
            </div>
            <Button size="sm" disabled={picked.length === 0 || submitting} onClick={submit}>
                <Send className="size-3.5" />
                {submitting ? "补发中…" : `补发所选附件（${picked.length}）`}
            </Button>
        </div>
    );
}
