import { Button, Card, CardBody, Chip } from "@heroui/react";

const StrategyList = (params: {
    strategyList: Array<any>,
    openEdit: Function,
    deleteStrategy: Function,
}) => {
    const { strategyList, openEdit, deleteStrategy } = params;
    return (
        <div id="strategy-list" className="flex flex-col">
            {strategyList.map((row, idx) => {
                return (<Card key={idx} className="w-full max-w-full my-1">
                    <CardBody className="max-w-[90vw] mx-auto">
                        <div className="flex flex-col md:flex-row md:justify-start md:items-center">
                            <div className="flex flex-row items-center mt-1">
                                <Chip color="primary" variant="bordered" className="text-primary">
                                    <div className="w-16 text-center">策略名称</div>
                                </Chip>
                                <div className="text-sm ml-1">{row.name}</div>
                            </div>
                            <div className="flex flex-row items-center mt-1 md:ml-5">
                                <Chip color="primary" variant="bordered" className="text-primary">
                                    <div className="w-16 text-center">发件人</div>
                                </Chip>
                                <div className="text-sm ml-1">{row.from_pattern}</div>
                            </div>
                            <div className="flex flex-row items-center mt-1 md:ml-5">
                                <Chip color="primary" variant="bordered" className="text-primary">
                                    <div className="w-16 text-center">收件人</div>
                                </Chip>
                                <div className="text-sm ml-1">{row.to_pattern}</div>
                            </div>
                            <div className="flex flex-row items-center mt-1 md:ml-5">
                                <Chip color="primary" variant="bordered" className="text-primary">
                                    <div className="w-16 text-center">转发邮箱</div>
                                </Chip>
                                <div className="text-sm ml-1">{row.forward_to}</div>
                            </div>
                            <div className="flex flex-row justify-between items-center mt-1 md:ml-5 gap-2">
                                <Button
                                    size="sm" color="primary"
                                    variant="bordered"
                                    className="h-7 text-primary"
                                    onClick={() => openEdit(row)}
                                >
                                    修改
                                </Button>
                                <Button
                                    size="sm" color="danger"
                                    variant="bordered"
                                    className="h-7"
                                    onClick={() => { deleteStrategy(row) }}
                                >
                                    删除
                                </Button>
                            </div>
                        </div>
                    </CardBody>
                </Card>)
            })}
        </div>
    )
}

export default StrategyList;
