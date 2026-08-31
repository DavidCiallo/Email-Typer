import { useNavigate } from "react-router-dom"
import { LogOut } from "lucide-react"

import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { Button } from "@/client/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu"

export function UserMenu() {
    const navigate = useNavigate()
    const email = localStorage.getItem("login_email") || "admin"

    function onLogout() {
        localStorage.removeItem("token")
        navigate("/auth", { replace: true })
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <Avatar className="size-7">
                        <AvatarFallback className="text-xs">
                            {email.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
                        {email}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                    <div className="flex items-center gap-2">
                        <Avatar className="size-9">
                            <AvatarFallback className="text-xs">
                                {email.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">当前用户</span>
                            <span className="text-muted-foreground text-xs font-normal">
                                {email}
                            </span>
                        </div>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onLogout}>
                    <LogOut className="size-4" />
                    退出登录
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
