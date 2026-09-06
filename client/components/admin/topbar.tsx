import { useLocation } from "react-router-dom"
import { Menu } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Separator } from "@/client/components/ui/separator"
import { ThemeToggle } from "@/client/components/theme-toggle"
import { UserMenu } from "@/client/components/admin/user-menu"

const titleMap: Record<string, string> = {
    "/inbox": "邮件列表",
    "/strategy": "邮箱策略",
    "/send": "发送邮件",
    "/safety": "安全设置",
    "/settings": "系统设置",
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
    const { pathname } = useLocation()
    const title = titleMap[pathname] || "多邮箱系统"

    return (
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur sm:gap-4 sm:px-6">
            <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={onOpenMobileNav}
                aria-label="打开导航"
            >
                <Menu className="size-5" />
            </Button>

            <h1 className="hidden text-lg font-semibold tracking-tight sm:block">
                {title}
            </h1>
            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
                <ThemeToggle />
                <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
                <UserMenu />
            </div>
        </header>
    )
}
