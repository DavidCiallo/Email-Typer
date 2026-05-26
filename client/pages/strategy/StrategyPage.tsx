import { Header } from "../../components/header/Header";
import { useEffect, useState } from "react";
import { StrategyRouter } from "../../api/instance";
import StrategyFormModal from "./StrategyFormModal";
import StrategyList from "./StrategyList";
import StrategyTable from "./StrategyTable";
import { Button, Input } from "@heroui/react";
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
        <div className="max-w-screen">
            <Header name="邮箱策略" />
            <div className="w-full flex flex-col flex-wrap px-[5vw] pt-6">
                <div className="w-full flex flex-row justify-between items-center mb-4">
                    <Input
                        className="w-3/4 md:w-1/4"
                        size="sm"
                        label="默认转发邮箱"
                        variant="bordered"
                        defaultValue={localStorage.getItem("default_forward") || ""}
                        onValueChange={(v) => localStorage.setItem("default_forward", v)}
                    />
                    <Button
                        onClick={openCreate}
                        color="primary" variant="bordered" className="ml-2 text-primary"
                    >
                        新建策略
                    </Button>
                </div>
                <div className="w-full hidden md:block">
                    <StrategyTable
                        strategyList={strategyList}
                        openEdit={openEdit}
                        deleteStrategy={submitDelete}
                    />
                </div>
                <div className="w-full block sm:hidden">
                    <StrategyList
                        strategyList={strategyList}
                        openEdit={openEdit}
                        deleteStrategy={submitDelete}
                    />
                </div>
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
