import { Button, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";

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

const InboxTable = (params: {
    emailList: Array<any>,
    setEmailContentOpen: Function,
    setFocusEmail: Function,
    onArchive: (id: string) => void,
}) => {
    const { emailList, setEmailContentOpen, setFocusEmail, onArchive } = params;
    return (
        <Table aria-label="table" isStriped>
            <TableHeader>
                {[
                    { key: "from", label: "发件人" },
                    { key: "to", label: "收件人" },
                    { key: "subject", label: "主题" },
                    { key: "time", label: "时间" },
                    { key: "action", label: "操作" },
                ].map((item, index) => {
                    return (
                        <TableColumn key={index} align="center">{item.label}</TableColumn>
                    )
                })}
            </TableHeader>
            <TableBody>
                {emailList.map((row, index) =>
                    <TableRow key={index}>
                        <TableCell className="w-50">
                            <div>
                                <div className="mr-1">
                                    {row.from.split(" <")[0].replace(/[\"]/g, "")}
                                </div>
                                <div className="text-xs text-gray-400">
                                    {row.from.split(" <").length > 1 ? "(" + row.from.split(" <")?.[1]?.replace(/[<>]/g, "") + ")" : ""}
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="w-50">
                            <div>{row.to}</div>
                        </TableCell>
                        <TableCell className="w-80">
                            <div>{row.subject}</div>
                        </TableCell>
                        <TableCell className="w-30">
                            <div>{formatTime(Number(row.time))}</div>
                        </TableCell>
                        <TableCell className="w-40">
                            <div className="flex flex-row gap-2 justify-center">
                                <Button
                                    size="sm" color="primary"
                                    variant="bordered"
                                    className="h-7 text-primary"
                                    onClick={() => { setEmailContentOpen(true); setFocusEmail(row) }}
                                >
                                    查看
                                </Button>
                                <Button
                                    size="sm" color="warning"
                                    variant="bordered"
                                    className="h-7 text-warning"
                                    onClick={() => onArchive(row.id)}
                                >
                                    归档
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    )
}

export default InboxTable;
