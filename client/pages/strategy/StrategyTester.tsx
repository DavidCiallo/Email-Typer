import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { testStrategies, type StrategyLike } from "../../methods/match";
import { cn } from "../../lib/utils";

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    strategyList: StrategyLike[];
}

const StrategyTester = ({ isOpen, onOpenChange, strategyList }: Props) => {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");

    const filled = from.trim() || to.trim() || subject.trim();
    const { winner, matched } = testStrategies(strategyList, {
        from: from.trim(),
        to: to.trim(),
        subject: subject.trim(),
    });

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>规则测试器</DialogTitle>
                    <DialogDescription>
                        输入一封模拟邮件，预览哪条转发规则会命中（与服务端匹配逻辑一致，仅启用中的规则参与）。
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="tester-from">发件人</Label>
                        <Input
                            id="tester-from"
                            placeholder="例如 noreply@github.com"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="tester-to">收件人</Label>
                        <Input
                            id="tester-to"
                            placeholder="例如 myname@your-domain.com"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="tester-subject">主题</Label>
                        <Input
                            id="tester-subject"
                            placeholder="例如 Your verification code"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>

                    {filled && (
                        <div className="rounded-lg border p-3">
                            {matched.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    没有启用的规则命中这封邮件，邮件将仅保存在收件箱。
                                </p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-muted-foreground">转发到</span>
                                        <span className="text-primary font-medium">{winner?.forward_to}</span>
                                        <Badge variant="secondary">{winner?.name}</Badge>
                                        {matched.length > 1 && (
                                            <span className="text-muted-foreground text-xs">
                                                （共 {matched.length} 条命中，按创建顺序取第一条）
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-muted-foreground text-xs">
                                        转发主题将带上 "Fwd: " 前缀。
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                        {strategyList.map((s) => {
                            const hit =
                                s.enabled === 1 &&
                                testStrategies([s], { from: from.trim(), to: to.trim(), subject: subject.trim() }).matched.length > 0;
                            return (
                                <div
                                    key={s.name}
                                    className={cn(
                                        "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                                        hit && filled ? "border-primary/40 bg-primary/5" : ""
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="truncate font-medium">{s.name}</span>
                                        <span className="text-muted-foreground shrink-0 text-xs">
                                            {s.enabled === 1 ? "" : "（已停用）"}
                                        </span>
                                    </div>
                                    <Badge variant={hit && filled ? "default" : "outline"} className="shrink-0">
                                        {!filled ? "待输入" : hit ? "命中" : "未命中"}
                                    </Badge>
                                </div>
                            );
                        })}
                        {strategyList.length === 0 && (
                            <p className="text-muted-foreground py-4 text-center text-sm">暂无策略</p>
                        )}
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default StrategyTester;
