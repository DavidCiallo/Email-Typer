import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";

const StrategyTable = (params: {
    strategyList: Array<any>,
    openEdit: Function,
    deleteStrategy: Function,
    toggleStrategy: (row: any, enabled: boolean) => void,
}) => {
    const { strategyList, openEdit, deleteStrategy, toggleStrategy } = params;
    return (
        <div className="rounded-lg border bg-card shadow-xs">
            <Table className="table-fixed">
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-20">启用</TableHead>
                        <TableHead className="w-44">策略名称</TableHead>
                        <TableHead>发件人</TableHead>
                        <TableHead>收件人</TableHead>
                        <TableHead>转发邮箱</TableHead>
                        <TableHead className="w-44 text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {strategyList.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                暂无策略
                            </TableCell>
                        </TableRow>
                    ) : (
                        strategyList.map((row) => (
                            <TableRow key={row.id} className={row.enabled === 1 ? "" : "opacity-60"}>
                                <TableCell>
                                    <Switch
                                        checked={row.enabled === 1}
                                        onCheckedChange={(checked) => toggleStrategy(row, checked)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <div className="truncate" title={row.name}>{row.name}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="truncate" title={row.from_pattern}>{row.from_pattern}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="truncate" title={row.to_pattern}>{row.to_pattern}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="truncate" title={row.forward_to}>{row.forward_to}</div>
                                </TableCell>
                                <TableCell className="w-44">
                                    <div className="flex flex-row justify-end gap-2">
                                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                                            修改
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => { deleteStrategy(row) }}
                                        >
                                            删除
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

export default StrategyTable;
