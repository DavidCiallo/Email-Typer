import { formatEmail, blockLabel } from "../../methods/format";
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
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Paperclip } from "lucide-react";

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
    // codes are extracted server-side at ingest — list rows no longer carry bodies.
    // The slot always renders (fixed height) so every row stays the same height.
    const codes: string[] = email.codes || [];
    return (
        <div className="mt-1 flex h-5 flex-wrap gap-1">
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

function RowCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
    return (
        <input
            type="checkbox"
            className="accent-primary size-4 cursor-pointer"
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={onClick}
        />
    );
}

const InboxTable = (params: {
    emailList: Array<any>,
    newIds: Set<string>,
    selected: Set<string>,
    onToggleSelect: (id: string) => void,
    onSelectAll: () => void,
    onArchiveSelected: () => void,
    archivingSelection: boolean,
    onOpen: (email: any) => void,
}) => {
    const { emailList, newIds, selected, onToggleSelect, onSelectAll, onArchiveSelected, archivingSelection, onOpen } = params;
    const allSelected = emailList.length > 0 && emailList.every((e) => selected.has(e.id));
    return (
        <div className="rounded-lg border bg-card shadow-xs">
            <Table className="table-fixed min-w-[820px]">
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-14 h-12 pl-4">
                            <RowCheckbox checked={allSelected} onClick={onSelectAll} />
                        </TableHead>
                        <TableHead className="w-52 h-12">发件人</TableHead>
                        <TableHead className="w-52 h-12">收件人</TableHead>
                        <TableHead className="h-12">主题</TableHead>
                        {/* Bulk actions live here in the header — no layout jump when a
                            selection starts; the widened cell keeps 时间 left-aligned */}
                        <TableHead className="w-64 h-12">
                            <div className="flex items-center justify-between gap-2">
                                <span>时间</span>
                                {selected.size > 0 && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        disabled={archivingSelection}
                                        onClick={onArchiveSelected}
                                    >
                                        归档选中 ({selected.size})
                                    </Button>
                                )}
                            </div>
                        </TableHead>
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
                                <TableCell className="w-14 pl-4">
                                    <RowCheckbox
                                        checked={selected.has(email.id)}
                                        onClick={() => onToggleSelect(email.id)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <div className="overflow-hidden">
                                        <div className="flex h-5 items-center gap-1.5">
                                            {newIds.has(email.id) && (
                                                <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-label="新邮件" />
                                            )}
                                            <div className="truncate" title={formatEmail(email.from).name}>
                                                {formatEmail(email.from).name}
                                            </div>
                                        </div>
                                        <div className="text-muted-foreground h-4 truncate text-xs" title={formatEmail(email.from).email}>
                                            {formatEmail(email.from).email}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="overflow-hidden">
                                        <div className="h-5 truncate" title={formatEmail(email.to).name}>
                                            {formatEmail(email.to).name}
                                        </div>
                                        <div className="text-muted-foreground h-4 truncate text-xs" title={formatEmail(email.to).email}>
                                            {formatEmail(email.to).email}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex h-5 min-w-0 items-center gap-1.5">
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
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default InboxTable;
