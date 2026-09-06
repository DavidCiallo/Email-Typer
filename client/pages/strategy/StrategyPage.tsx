import { useEffect, useState } from "react";
import { StrategyRouter } from "../../api/instance";
import StrategyFormModal from "./StrategyFormModal";
import StrategyList from "./StrategyList";
import StrategyTable from "./StrategyTable";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { toast } from "../../methods/notify";

const StrategyPage = () => {
    const [strategyList, setStrategyList] = useState<any[]>([]);
    const [focusStrategy, setFocusStrategy] = useState<any | null>(null);
    const [isModalOpen, setModalOpen] = useState(false);

    function refreshList() {
        StrategyRouter.list({}, (data: any) => {
            const result = data.data || data;
            setStrategyList(result.list || []);
        });
    }

    function submitSave(body: any) {
        StrategyRouter.save({ strategy: body }, () => {
            toast({ title: body.id ? "修改成功" : "添加成功", color: "primary" });
            setModalOpen(false);
            setFocusStrategy(null);
            refreshList();
        });
    }

    function submitDelete(item: any) {
        StrategyRouter.delete({ id: item.id }, () => {
            toast({ title: "删除成功", color: "primary" });
            refreshList();
        });
    }

    function toggleStrategy(row: any, enabled: boolean) {
        StrategyRouter.save({ strategy: { ...row, enabled: enabled ? 1 : 0 } }, () => {
            toast({ title: enabled ? "策略已启用" : "策略已停用", color: "primary" });
            refreshList();
        });
    }

    function openCreate() {
        setFocusStrategy(null);
        setModalOpen(true);
    }

    function openEdit(row: any) {
        setFocusStrategy(row);
        setModalOpen(true);
    }

    useEffect(() => {
        refreshList();
    }, []);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
                <div className="flex w-full flex-col gap-2 md:w-1/3">
                    <Label htmlFor="default-forward">默认转发邮箱</Label>
                    <Input
                        id="default-forward"
                        defaultValue={localStorage.getItem("default_forward") || ""}
                        onChange={(e) => localStorage.setItem("default_forward", e.target.value)}
                    />
                </div>
                <Button onClick={openCreate} variant="outline">
                    新建策略
                </Button>
            </div>

            <div className="hidden w-full md:block">
                <StrategyTable
                    strategyList={strategyList}
                    openEdit={openEdit}
                    deleteStrategy={submitDelete}
                    toggleStrategy={toggleStrategy}
                />
            </div>
            <div className="block w-full md:hidden">
                <StrategyList
                    strategyList={strategyList}
                    openEdit={openEdit}
                    deleteStrategy={submitDelete}
                    toggleStrategy={toggleStrategy}
                />
            </div>

            <StrategyFormModal
                isOpen={isModalOpen}
                onOpenChange={(v) => { setModalOpen(v); if (!v) setFocusStrategy(null); }}
                onSubmit={submitSave}
                strategy={focusStrategy}
            />
        </div>
    )
};

export default StrategyPage;
