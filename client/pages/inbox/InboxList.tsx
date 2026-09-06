import { formatEmail, blockLabel } from "../../methods/format";
import { extractCodes } from "../../methods/verifycode";
import { copytext } from "../../methods/text";
import { toast } from "../../methods/notify";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Archive, Paperclip } from "lucide-react";

const InboxList = (params: {
    emailList: Array<any>,
    newIds: Set<string>,
    onOpen: (email: any) => void,
    onArchive: (id: string) => void,
}) => {
    const { emailList, newIds, onOpen, onArchive } = params;

    function copyCode(e: React.MouseEvent, code: string) {
        e.stopPropagation();
        copytext(code);
        toast({ title: `验证码 ${code} 已复制`, color: "success" });
    }

    return (
        <div id="email-list" className="flex flex-col gap-2">
            {emailList.map((email) => {
                const codes = extractCodes(email.text, email.html);
                return (
                    <Card
                        key={email.id}
                        className="w-full cursor-pointer py-3 transition-colors hover:bg-muted/40"
                        onClick={() => onOpen(email)}
                    >
                        <CardContent className="flex flex-col gap-2 px-3">
                            <div className="flex flex-row justify-end text-xs text-muted-foreground">
                                {newIds.has(email.id) && (
                                    <span className="text-primary mr-auto font-medium">新邮件</span>
                                )}
                                {new Date(Number(email.time)).toLocaleDateString()?.slice(5) + " "}
                                {new Date(Number(email.time)).toLocaleTimeString()?.slice(0, -3)}
                            </div>
                            <div className="flex items-center gap-1 overflow-x-hidden">
                                <Badge variant="outline" className="shrink-0">发件</Badge>
                                <span className="truncate text-sm">
                                    {formatEmail(email.from).name}
                                    {formatEmail(email.from).email && (
                                        <span className="text-muted-foreground"> ({formatEmail(email.from).email})</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 overflow-x-hidden">
                                <Badge variant="outline" className="shrink-0">收件</Badge>
                                <span className="truncate text-sm">
                                    {formatEmail(email.to).name}
                                    {formatEmail(email.to).email && (
                                        <span className="text-muted-foreground"> ({formatEmail(email.to).email})</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 overflow-x-hidden">
                                <Badge variant="outline" className="shrink-0">主题</Badge>
                                {email.blocked === 1 && (
                                    <Badge variant="destructive" className="shrink-0" title={`命中规则：${email.block_rule}`}>
                                        拦截·{blockLabel(email.blocked_by)}
                                    </Badge>
                                )}
                                <span className="truncate text-sm">{email.subject?.slice(0, 32)}</span>
                                {!!email.has_attachments && (
                                    <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-label="含附件" />
                                )}
                            </div>
                            {codes.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {codes.map((code) => (
                                        <button
                                            key={code}
                                            title="点击复制验证码"
                                            className="bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer rounded px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider transition-colors"
                                            onClick={(e) => copyCode(e, code)}
                                        >
                                            {code}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="mt-1 flex justify-end gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={(e) => { e.stopPropagation(); onOpen(email); }}
                                >
                                    查看
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0 text-destructive hover:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); onArchive(email.id); }}
                                >
                                    <Archive className="size-3.5" />
                                    归档
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
            {emailList.length === 0 && (
                <div className="text-muted-foreground py-8 text-center">暂无邮件</div>
            )}
        </div>
    );
};

export default InboxList;
