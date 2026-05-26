import { Button, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { keyLables } from "./StrategyEnums";

const StrategyTable = (params: {
    strategyList: Array<any>,
    openEdit: Function,
    deleteStrategy: Function,
}) => {
    const { strategyList, openEdit, deleteStrategy } = params;
    return (
        <Table aria-label="table" isStriped>
            <TableHeader>
                {keyLables.map((item) => {
                    return (
                        <TableColumn key={item.key} align="center">{item.label}</TableColumn>
                    )
                })}
            </TableHeader>
            <TableBody>
                {strategyList.map((row, index) =>
                    <TableRow key={index}>
                        <TableCell className="w-40">
                            <div>{row.name}</div>
                        </TableCell>
                        <TableCell className="w-60">
                            <div>{row.from_pattern}</div>
                        </TableCell>
                        <TableCell className="w-60">
                            <div>{row.to_pattern}</div>
                        </TableCell>
                        <TableCell className="w-60">
                            <div>{row.forward_to}</div>
                        </TableCell>
                        <TableCell className="w-40">
                            <div className="flex flex-row gap-2">
                                <Button
                                    size="sm" color="primary" variant="bordered"
                                    className="h-7 text-primary"
                                    onClick={() => openEdit(row)}
                                >
                                    修改
                                </Button>
                                <Button
                                    size="sm" color="danger" variant="bordered"
                                    className="h-7"
                                    onClick={() => { deleteStrategy(row) }}
                                >
                                    删除
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    )
}

export default StrategyTable;
