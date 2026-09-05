import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";

const StrategyList = (params: {
    strategyList: Array<any>,
    openEdit: Function,
    deleteStrategy: Function,
    toggleStrategy: (row: any, enabled: boolean) => void,
}) => {
    const { strategyList, openEdit, deleteStrategy, toggleStrategy } = params;
    return (
        <div id="strategy-list" className="flex flex-col gap-2">
            {strategyList.map((row) => {
                return (
                    <Card key={row.id} className={`w-full max-w-full py-3 ${row.enabled === 1 ? "" : "opacity-60"}`}>
                        <CardContent className="flex flex-col gap-2 px-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                    <Badge variant="outline">策略名称</Badge>
                                    <span className="truncate text-sm">{row.name}</span>
                                </div>
                                <Switch
                                    checked={row.enabled === 1}
                                    onCheckedChange={(checked) => toggleStrategy(row, checked)}
                                />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Badge variant="outline">发件人</Badge>
                                <span className="truncate text-sm">{row.from_pattern}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Badge variant="outline">收件人</Badge>
                                <span className="truncate text-sm">{row.to_pattern}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Badge variant="outline">转发邮箱</Badge>
                                <span className="truncate text-sm">{row.forward_to}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-end gap-2">
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
                        </CardContent>
                    </Card>
                );
            })}
            {strategyList.length === 0 && (
                <div className="text-muted-foreground py-8 text-center">暂无策略</div>
            )}
        </div>
    );
};

export default StrategyList;
