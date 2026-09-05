import { ArchiveRestore, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { formatEmail, blockLabel } from "../../methods/format";

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    list: any[];
    loading: boolean;
    onRestore: (id: string) => void;
    onOpen: (email: any) => void;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

const ArchivedDialog = ({ isOpen, onOpenChange, list, loading, onRestore, onOpen }: Props) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>已归档邮件</DialogTitle>
                    <DialogDescription>
                        共 {list.length} 封{list.length >= 100 ? "（仅显示最近 100 封）" : ""}，点击行可查看内容
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
                            <Loader2 className="size-4 animate-spin" />
                            加载中…
                        </div>
                    ) : list.length === 0 ? (
                        <div className="text-muted-foreground py-10 text-center text-sm">暂无归档邮件</div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {list.map((email) => (
                                <div
                                    key={email.id}
                                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
                                    onClick={() => onOpen(email)}
                                >
                                    <div className="w-36 min-w-0">
                                        <div className="truncate" title={formatEmail(email.from).name}>
                                            {formatEmail(email.from).name}
                                        </div>
                                    </div>
                                    <div className="w-36 min-w-0">
                                        <div className="truncate" title={formatEmail(email.to).name}>
                                            {formatEmail(email.to).name}
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            {email.blocked === 1 && (
                                                <Badge variant="destructive" className="shrink-0" title={`命中规则：${email.block_rule}`}>
                                                    拦截·{blockLabel(email.blocked_by)}
                                                </Badge>
                                            )}
                                            <span className="truncate" title={email.subject}>
                                                {email.subject}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                                        {formatTime(Number(email.time))}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0"
                                        onClick={(e) => { e.stopPropagation(); onRestore(email.id); }}
                                    >
                                        <ArchiveRestore className="size-3.5" />
                                        恢复
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ArchivedDialog;
