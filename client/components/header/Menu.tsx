import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    useDisclosure,
} from "@heroui/react";

import MenuIcon from "../icons/menu";
import { Link, useNavigate } from "react-router-dom";

export const MenuComp = ({ now }: { now?: string }) => {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const navigate = useNavigate();

    const menuList = [
        { name: "邮件列表", link: "/inbox" },
        { name: "邮箱策略", link: "/strategy" },
        { name: "发送邮件", link: "/send" },
        { name: "安全设置", link: "/safety" },
        { name: "三方邮箱", link: "/thirdparty" },
        { name: "系统设置", link: "/settings" },
    ];

    function handleLogout() {
        localStorage.removeItem("token");
        navigate("/auth", { replace: true });
    }

    return (
        <>
            <div className="w-15 h-12 flex items-center justify-center cursor-pointer" onClick={onOpen}>
                <MenuIcon />
            </div>
            <Drawer isOpen={isOpen} onOpenChange={onOpenChange} className="rounded-none w-48" placement="left">
                <DrawerContent>
                    {(onClose: any) => (
                        <>
                            <DrawerHeader className="flex flex-col gap-1">Menu</DrawerHeader>
                            <DrawerBody className="h-screen flex flex-col justify-between">
                                <div className="flex flex-col justify-start items-start">
                                    {
                                        menuList.map(item => {
                                            return (
                                                <div key={item.link} className="m-2 text-lg text-gray-700 cursor-pointer">
                                                    <Link to={item.link} onClick={onClose}>
                                                        <div
                                                            className={`mr-1 w-full ${now == item.name ? "text-primary" : ""}`}
                                                        >
                                                            {item.name}
                                                        </div>
                                                    </Link>
                                                </div>
                                            )
                                        })
                                    }
                                </div>
                                <div className="flex flex-row justify-start items-center h-20">
                                    <div
                                        className="m-2 text-lg text-red-500 cursor-pointer"
                                        onClick={() => { onClose(); handleLogout(); }}
                                    >
                                        退出登录
                                    </div>
                                </div>
                            </DrawerBody>
                        </>
                    )}
                </DrawerContent>
            </Drawer>
        </>
    );
}
