import { Button, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";

const InboxTable = (params: {
    emailList: Array<any>,
    setEmailContentOpen: Function,
    setFocusEmail: Function
}) => {
    const { emailList, setEmailContentOpen, setFocusEmail } = params;
    return (
        <Table aria-label="table" isStriped>
            <TableHeader>
                {[
                    { key: "from", label: "发件人" },
                    { key: "to", label: "收件人" },
                    { key: "subject", label: "主题" },
                    { key: "content", label: "内容" },
                    { key: "time", label: "时间" },
                    { key: "action", label: "查看" },
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
                        <TableCell className="80">
                            <div>{row.subject}</div>
                        </TableCell>
                        <TableCell className="max-w-120">
                            <span>{row.text.slice(0, window.innerWidth / 50)}</span>
                            <span>{row.text.length > window.innerWidth / 50 ? "......" : ""}</span>
                        </TableCell>

                        <TableCell className="w-30">
                            <div>
                                {new Date(Number(row.time)).toLocaleDateString().slice(5) + " "}
                                {new Date(Number(row.time)).toLocaleTimeString().slice(0, -3)}
                            </div>
                        </TableCell>
                        <TableCell className="w-20">
                            <Button
                                size="sm" color="primary"
                                variant="bordered"
                                className="h-7 text-primary"
                                onClick={() => { setEmailContentOpen(true); setFocusEmail(row) }}
                            >
                                查看
                            </Button>
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    )
}

export default InboxTable;