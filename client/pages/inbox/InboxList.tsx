import { Button, Card, CardBody, Chip } from "@heroui/react";
import { keyLables } from "./InboxEnums";
import { formatEmail } from "../../methods/format";


const InboxList = (params: {
    emailList: Array<any>,
    setEmailContentOpen: Function,
    setFocusEmail: Function
}) => {
    const { emailList, setEmailContentOpen, setFocusEmail } = params;
    return (
        <div id="email-list" className="flex flex-col">
            {emailList.map((email, index) => {
                return (<Card key={index} className="w-full max-w-full my-1">
                    <CardBody className="max-w-[90vw] mx-auto">
                        <div className="flex flex-row justify-end text-xs text-gray-400 h-[15px] mb-[-10px]">
                            {new Date(Number(email.time)).toLocaleDateString()?.slice(5) + " "}
                            {new Date(Number(email.time)).toLocaleTimeString()?.slice(0, -3)}
                        </div>
                        <div className="flex flex-col md:flex-row md:justify-start md:items-center">
                            <div className="flex flex-row items-center mt-1 overflow-x-hidden">
                                <Chip color="primary" variant="bordered" className="text-primary">
                                    <div className="w-8 text-center">发件</div>
                                </Chip>
                                <div className="text-sm ml-1">
                                    <span className="mr-1 whitespace-nowrap">
                                        {formatEmail(email.from).name}
                                    </span>
                                    <span className="text-gray-500 whitespace-nowrap">
                                        ({formatEmail(email.from).email})
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-row items-center mt-1 md:ml-5 overflow-x-hidden">
                                <Chip color="primary" variant="bordered" className="text-primary">
                                    <div className="w-8 text-center">收件</div>
                                </Chip>
                                <div className="text-sm ml-1">
                                    <span className="whitespace-nowrap">
                                        {formatEmail(email.to).email}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-row justify-between items-center mt-1 md:ml-5">
                                <div className="flex flex-row items-center">
                                    <Chip color="primary" variant="bordered" className="text-primary">
                                        <div className="w-8 text-center">主题</div>
                                    </Chip>
                                    <span className="text-sm ml-1">{email.subject?.slice(0, 32)}</span>
                                </div>
                                <Button
                                    size="sm" color="primary"
                                    variant="bordered"
                                    className="h-7 text-primary"
                                    onClick={() => { setEmailContentOpen(true); setFocusEmail(email) }}
                                >
                                    查看
                                </Button>
                            </div>
                        </div>
                    </CardBody>
                </Card>)
            })}
        </div>
    )
}

export default InboxList;