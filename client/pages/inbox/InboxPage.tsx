import { Header } from "../../components/header/Header";
import { useEffect, useState } from "react";
import { EmailRouter, StrategyRouter } from "../../api/instance";
import { Button, Pagination } from "@heroui/react";
import EmailContentModal from "./InboxContent";
import StrategyFormModal from "../strategy/StrategyFormModal";
import { toast } from "../../methods/notify";
import InboxTable from "./InboxTable";
import InboxList from "./InboxList";

const EmailPage = () => {
    const [allEmailList, setAllEmailList] = useState<any[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    const [focusEmail, setFocusEmail] = useState<any | null>(null);
    const [isEmailContentOpen, setEmailContentOpen] = useState(false);
    const [isStrategyOpen, setStrategyOpen] = useState(false);

    const [accountList, setAccountList] = useState<Array<string>>([]);

    function submitAddStrategy(body: any) {
        StrategyRouter.save({ strategy: body }, () => {
            toast({ title: "添加成功", color: "primary" });
            setStrategyOpen(false);
        });
    }

    function renderEmail(data: any) {
        const result = data.data || data;
        setTotal(result.total || 0);
        setAllEmailList(result.list || []);
        setIsLoading(false);

        const accountList: string[] = Array.from(new Set((result.list || []).map((email: any) => email.to)));
        setAccountList(accountList);
    }

    function queryEmails() {
        setIsLoading(true);
        EmailRouter.list({ offset: (page - 1) * 10, limit: 10 }, renderEmail);
    }

    useEffect(() => {
        EmailRouter.list({ offset: 0, limit: 10 }, renderEmail);
    }, []);

    function openStrategyForEmail(emailAddr: string) {
        // Pre-fill the to_pattern with the email address from inbox
        setStrategyOpen(true);
    }

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
                                onChange={(newPage: number) => {
                                    setPage(newPage);
                                    setIsLoading(true);
                                    EmailRouter.list({ offset: (newPage - 1) * 10, limit: 10 }, renderEmail);
                                }}
                            />
                        )}
                    </div>
                    <Button
                        onClick={() => setStrategyOpen(true)}
                        color="primary"
                        variant="bordered"
                        className="text-primary"
                    >
                        新建策略
                    </Button>
                </div>
                <div className="w-full hidden md:block">
                    <InboxTable
                        emailList={allEmailList}
                        setEmailContentOpen={setEmailContentOpen}
                        setFocusEmail={setFocusEmail}
                        onArchive={(id) => {
                            EmailRouter.delete({ id }, (res: any) => {
                                if (res.success) {
                                    queryEmails();
                                } else {
                                    toast({ title: res.message || "归档失败", color: "danger" });
                                }
                            });
                        }}
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
            <StrategyFormModal
                isOpen={isStrategyOpen}
                onOpenChange={setStrategyOpen}
                onSubmit={submitAddStrategy}
            />
        </div>
    );
};

export default EmailPage;
