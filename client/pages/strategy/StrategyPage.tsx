import { Header } from "../../components/header/Header";
import { useEffect, useState } from "react";
import { StrategyRouter } from "../../api/instance";
import StrategyContentModal from "./StrategyContent";
import StrategyList from "./StrategyList";
import StrategyTable from "./StrategyTable";
import { Button, closeAll, Input } from "@heroui/react";
import InboxAddStrategy from "../inbox/InboxAddStrategy";
import { toast } from "../../methods/notify";

const StrategyPage = () => {
    const [strategyList, setStrategyList] = useState<any[]>([]);
    const [focusStrategy, setFocusStrategy] = useState<any | null>(null);
    const [isStrategyContentOpen, setStrategyContentOpen] = useState(false);
    const [isEmailAddStrategyOpen, setEmailAddStrategyOpen] = useState(false);

    function submitAddStrategy(body: any) {
        StrategyRouter.save({ strategy: body }, () => {
            toast({
                title: "添加成功",
                color: "primary",
                hideCloseButton: true,
                endContent: (<div onClick={closeAll}>✖</div>)
            });
            setEmailAddStrategyOpen(false);
        });
        refreshList();
    }

    function submitSaveStrategy(body: any) {
        StrategyRouter.save({ strategy: body }, () => {
            toast({
                title: "修改成功",
                color: "primary",
                hideCloseButton: true,
                endContent: (<div onClick={closeAll}>✖</div>)
            });
        });
        refreshList();
    }

    function submitDeleteStrategy(item: any) {
        StrategyRouter.delete({ id: item.id }, () => {
            toast({ title: "删除成功", color: "primary" });
            setStrategyContentOpen(false);
            refreshList();
        });
    }

    function refreshList() {
        StrategyRouter.list({}, (data: any) => {
            const result = data.data || data;
            setStrategyList(result.list || []);
        });
    }

    useEffect(() => {
        StrategyRouter.list({}, (data: any) => {
            const result = data.data || data;
            setStrategyList(result.list || []);
        });
    }, [])

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
                        onClick={() => {
                            setEmailAddStrategyOpen(true);
                            localStorage.setItem("pause", "1");
                        }}
                        color="primary" variant="bordered" className="ml-2 text-primary"
                    >
                        新建策略
                    </Button>
                </div>
                <div className="w-full hidden md:block">
                    <StrategyTable
                        strategyList={strategyList}
                        setStrategyContentOpen={setStrategyContentOpen}
                        focusStrategy={setFocusStrategy}
                        deleteStrategy={submitDeleteStrategy}
                    />
                </div>
                <div className="w-full block sm:hidden">
                    <StrategyList
                        strategyList={strategyList}
                        setStrategyContentOpen={setStrategyContentOpen}
                        focusStrategy={setFocusStrategy}
                        deleteStrategy={submitDeleteStrategy}
                    />
                </div>
            </div>
            {focusStrategy && <StrategyContentModal
                email={focusStrategy}
                isOpen={isStrategyContentOpen}
                onOpenChange={setStrategyContentOpen}
                onSubmit={submitSaveStrategy}
            />}
            {
                <InboxAddStrategy
                    isOpen={isEmailAddStrategyOpen}
                    onOpenChange={(v: boolean) => {
                        setEmailAddStrategyOpen(v);
                        if (!v) localStorage.setItem("pause", "0");
                    }}
                    onSubmit={(data) => {
                        submitAddStrategy(data);
                        localStorage.setItem("pause", "0");
                    }}
                />
            }
        </div>
    )
};


export default StrategyPage;
