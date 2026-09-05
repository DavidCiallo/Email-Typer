import { formatEmail, blockLabel, sourceLabel } from "../../methods/format";
import { extractCodes } from "../../methods/verifycode";
import { copytext } from "../../methods/text";
import { toast } from "../../methods/notify";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Archive, Paperclip } from "lucide-react";

function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

    // Today: only time
    if (d.toDateString() === now.toDateString()) {
        return `今天 ${time}`;
    }
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return `昨天 ${time}`;
    }
    // This year: month-day + time
    if (d.getFullYear() === now.getFullYear()) {
        return `${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")} ${time}`;
    }
    // Previous years: full date
    return `${d.getFullYear()}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function CodeChips({ email }: { email: any }) {
    const codes = extractCodes(email.text, email.html);
    if (codes.length === 0) return null;
    return (
        <div className="mt-1 flex flex-wrap gap-1">
            {codes.map((code) => (
                <button
                    key={code}
                    title="点击复制验证码"
                    className="bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer rounded px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        copytext(code);
                        toast({ title: `验证码 ${code} 已复制`, color: "success" });
                    }}
                >
                    {code}
                </button>
            ))}
        </div>
    );
}

const InboxTable = (params: {
    emailList: Array<any>,
    newIds: Set<string>,
    onOpen: (email: any) => void,
    onArchive: (id: string) => void,
}) => {
    const { emailList, newIds, onOpen, onArchive } = params;
    return (
        <div className="rounded-lg border bg-card shadow-xs">
            <Table className="table-fixed min-w-[820px]">
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-52">发件人</TableHead>
                        <TableHead className="w-52">收件人</TableHead>
                        <TableHead>主题</TableHead>
                        <TableHead className="w-24">时间</TableHead>
                        <TableHead className="w-40 text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {emailList.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                暂无邮件
                            </TableCell>
                        </TableRow>
                    ) : (
                        emailList.map((email) => (
                            <TableRow
                                key={email.id}
                                className="cursor-pointer"
                                onClick={() => onOpen(email)}
                            >
                                <TableCell>
                                    <div className="overflow-hidden">
                                        <div className="flex items-center gap-1.5">
                                            {newIds.has(email.id) && (
                                                <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-label="新邮件" />
                                            )}
                                            <div className="truncate" title={formatEmail(email.from).name}>
                                                {formatEmail(email.from).name}
                                            </div>
                                        </div>
                                        {formatEmail(email.from).email && (
                                            <div className="text-muted-foreground truncate text-xs" title={formatEmail(email.from).email}>
                                                {formatEmail(email.from).email}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="overflow-hidden">
                                        <div className="truncate" title={formatEmail(email.to).name}>
                                            {formatEmail(email.to).name}
                                        </div>
                                        {formatEmail(email.to).email && (
                                            <div className="text-muted-foreground truncate text-xs" title={formatEmail(email.to).email}>
                                                {formatEmail(email.to).email}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        {email.source && email.source !== "maildir" && (
                                            <Badge variant="secondary" className="shrink-0" title={`来源：${sourceLabel(email.source)}`}>
                                                {sourceLabel(email.source)}
                                            </Badge>
                                        )}
                                        {email.blocked === 1 && (
                                            <Badge variant="destructive" className="shrink-0" title={`命中规则：${email.block_rule}`}>
                                                拦截·{blockLabel(email.blocked_by)}
                                            </Badge>
                                        )}
                                        <div className="truncate" title={email.subject}>{email.subject}</div>
                                        {!!email.has_attachments && (
                                            <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-label="含附件" />
                                        )}
                                    </div>
                                    <CodeChips email={email} />
                                </TableCell>
                                <TableCell className="text-muted-foreground w-24 whitespace-nowrap">
                                    <div>{formatTime(Number(email.time))}</div>
                                </TableCell>
                                <TableCell className="w-40">
                                    <div className="flex flex-row justify-end gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => { e.stopPropagation(); onOpen(email); }}
                                        >
                                            查看
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-destructive hover:text-destructive"
                                            onClick={(e) => { e.stopPropagation(); onArchive(email.id); }}
                                        >
                                            <Archive className="size-3.5" />
                                            归档
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default InboxTable;
