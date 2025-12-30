import { Button, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { keyLables } from "./InboxEnums";
import { formatEmail } from "../../methods/format";

const InboxTable = (params: {
    emailList: Array<any>;
    isLoading: boolean;
    setEmailContentOpen: Function;
    setFocusEmail: Function;
}) => {
    const { emailList, setEmailContentOpen, setFocusEmail, isLoading } = params;
    return (
        <Table aria-label="table" isStriped>
            <TableHeader>
                {keyLables.map((item, index) => {
                    return (
                        <TableColumn width={40} key={index} align="center">
                            {item.label}
                        </TableColumn>
                    );
                })}
            </TableHeader>
            <TableBody
                isLoading={isLoading}
                loadingContent={
                    <div className="w-full h-full flex justify-center items-center bg-[rgba(0,0,0,0.2)]">
                        <Spinner />
                    </div>
                }
            >
                {emailList.map((email, index) => (
                    <TableRow key={index}>
                        <TableCell className="min-w-40 max-w-40">
                            <div>
                                <div className="mr-1">
                                    <span className="whitespace-nowrap">{formatEmail(email.from).name}</span>
                                </div>
                                <div className="text-xs text-gray-400">
                                    <span className="whitespace-nowrap">{formatEmail(email.from).email}</span>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="min-w-40 max-w-40">
                            <div className="text-sm ml-1">
                                <span>{formatEmail(email.to.split(", ")[0]).email}</span>
                                <span>{email.to.split(", ").length > 1 ? "👥" : ""}</span>
                            </div>
                        </TableCell>
                        <TableCell className="min-w-60">
                            <span>{email.subject?.slice(0, 36)}</span>
                            <span>{email.subject?.length > 36 ? "......" : ""}</span>
                        </TableCell>

                        <TableCell className="w-32">
                            <div>
                                {new Date(Number(email.time)).toLocaleDateString()?.slice(5) + " "}
                                {new Date(Number(email.time)).toLocaleTimeString()?.slice(0, -3)}
                            </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex flex-row justify-center">
                                <Button
                                    size="sm"
                                    color="primary"
                                    variant="bordered"
                                    className="h-7 text-primary"
                                    onClick={() => {
                                        setEmailContentOpen(true);
                                        setFocusEmail(email);
                                    }}
                                >
                                    查看
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export default InboxTable;
