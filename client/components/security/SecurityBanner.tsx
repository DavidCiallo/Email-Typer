import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";

import { SecurityRouter } from "../../api/instance";
import { Button } from "../../components/ui/button";
import { inTauthSession } from "../../methods/tauth";
import SecurityCheckDialog from "./SecurityCheckDialog";

/**
 * 顶部常驻横幅：熔断时红色（不可关），警告时黄色（可关）。
 * WebSocket 帧会被 livews 重新派发成同名 window 事件，这里直接监听。
 */
export default function SecurityBanner() {
    const [locked, setLocked] = useState(false);
    const [warning, setWarning] = useState<{ message: string; hitCount: number } | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const autoOpened = useRef(false);

    // 临时授权会话（tauth）不是管理员，不该看到安全横幅
    const hidden = inTauthSession();

    useEffect(() => {
        if (hidden) return;
        SecurityRouter.lockStatus({}, (res: any) => {
            const data = res?.data || res;
            if (data?.locked) {
                setLocked(true);
                if (!autoOpened.current) {
                    autoOpened.current = true;
                    setDialogOpen(true);
                }
            }
        });
    }, [hidden]);

    useEffect(() => {
        if (hidden) return;

        const onWarning = (e: any) => {
            const d = e?.detail || {};
            setWarning({ message: d.message || "一封邮件命中了多条策略", hitCount: d.hit_count || 0 });
        };
        const onLocked = () => {
            setLocked(true);
            setWarning(null);
            if (!autoOpened.current) {
                autoOpened.current = true;
                setDialogOpen(true);
            }
        };
        const onUnlocked = () => {
            setLocked(false);
            setWarning(null);
        };

        window.addEventListener("security:warning", onWarning);
        window.addEventListener("security:locked", onLocked);
        window.addEventListener("security:unlocked", onUnlocked);
        return () => {
            window.removeEventListener("security:warning", onWarning);
            window.removeEventListener("security:locked", onLocked);
            window.removeEventListener("security:unlocked", onUnlocked);
        };
    }, [hidden]);

    if (hidden) return null;

    return (
        <>
            {locked && (
                <div className="flex items-center gap-3 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                        转发已自动暂停：有一封邮件命中了过多条策略。请执行安全检查后解除。
                    </span>
                    <Button size="sm" variant="destructive" onClick={() => setDialogOpen(true)}>
                        执行安全检查
                    </Button>
                </div>
            )}

            {!locked && warning && (
                <div className="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{warning.message}</span>
                    <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                        查看策略
                    </Button>
                    <button
                        className="shrink-0 rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                        onClick={() => setWarning(null)}
                        aria-label="关闭提示"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            )}

            <SecurityCheckDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onUnlocked={() => {
                    setLocked(false);
                    setWarning(null);
                }}
            />
        </>
    );
}
