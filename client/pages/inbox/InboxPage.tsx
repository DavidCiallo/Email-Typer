import { Header } from "../../components/header/Header";
import { useEffect, useState } from "react";
import { EmailImpl } from "../../../shared/impl";
import { EmailRouter, StrategyRouter } from "../../api/instance";
import { Button, closeAll, Pagination } from "@heroui/react";
import EmailContentModal from "./InboxContent";
import { EmailListResponse } from "../../../shared/router/EmailRouter";
import InboxAddStrategy from "./InboxAddStrategy";
import { StrategyBodyRequest } from "../../../shared/router/StrategyRouter";
import { notify, toast } from "../../methods/notify";
import InboxTable from "./InboxTable";
import InboxList from "./InboxList";

const EmailPage = () => {
    const [allEmailList, setAllEmailList] = useState<EmailImpl[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    const [focusEmail, setFocusEmail] = useState<EmailImpl | null>(null);
    const [isEmailContentOpen, setEmailContentOpen] = useState(false);
    const [isEmailAddStrategyOpen, setEmailAddStrategyOpen] = useState(false);

    const [accountList, setAccountList] = useState<Array<string>>([]);

    function submitAddStrategy(body: StrategyBodyRequest) {
        StrategyRouter.requestSaveStrategy(body, () => {
            toast({
                title: "添加成功",
                color: "primary",
                hideCloseButton: true,
                endContent: <div onClick={closeAll}>✖</div>,
            });
            setEmailAddStrategyOpen(false);
        });
    }

    function renderEmail(data: EmailListResponse) {
        if (localStorage.getItem("pause") === "1") return;
        setTotal(data.total);
        setAllEmailList(data.list);
        setIsLoading(false);

        const accountList = Array.from(new Set(data.list.map((email) => email.to)));
        setAccountList(accountList);
    }

    useEffect(() => {
        localStorage.setItem("pause", "0");
        if (!localStorage.getItem("emailNum")) {
            localStorage.setItem("emailNum", "0");
        }
        EmailRouter.queryEmailList({ page }, renderEmail);
    }, []);

    return (
        <div className="max-w-screen">
            <Header name="邮件列表" />
            <div className="w-full flex flex-col flex-wrap px-[5vw] pt-6 pb-4">
                <div className="flex flex-row justify-between items-center w-full py-3">
                    <div className="flex-row w-full">
                        {!!total && (
                            <Pagination
                                initialPage={1}
                                total={Math.ceil(total / 10)}
                                onChange={(page: number) => {
                                    setPage(page);
                                    setIsLoading(true);
                                    EmailRouter.queryEmailList({ page }, renderEmail);
                                }}
                            />
                        )}
                    </div>
                    <Button
                        onClick={() => {
                            setEmailAddStrategyOpen(true);
                            localStorage.setItem("pause", "1");
                        }}
                        color="primary"
                        variant="bordered"
                        className="text-primary"
                    >
                        新建邮箱
                    </Button>
                </div>
                <div className="w-full hidden md:block">
                    <InboxTable
                        emailList={allEmailList}
                        isLoading={isLoading}
                        setEmailContentOpen={setEmailContentOpen}
                        setFocusEmail={setFocusEmail}
                    />
                </div>
                <div className="w-full block sm:hidden">
                    <InboxList
                        emailList={allEmailList}
                        setEmailContentOpen={setEmailContentOpen}
                        setFocusEmail={setFocusEmail}
                    />
                </div>
            </div>

            {focusEmail && (
                <EmailContentModal email={focusEmail} isOpen={isEmailContentOpen} onOpenChange={setEmailContentOpen} />
            )}
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
    );
};

export default EmailPage;
