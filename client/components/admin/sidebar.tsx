import { useEffect, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import {
    Inbox,
    Send,
    Filter,
    ShieldCheck,
    Globe,
    Settings,
    type LucideIcon,
} from "lucide-react"

import { cn } from "@/client/lib/utils"
import { BrandIcon } from "@/client/components/logo"

type NavItem = {
    title: string
    href: string
    icon: LucideIcon
    badge?: number
}

const mainItems: NavItem[] = [
    { title: "邮件列表", href: "/inbox", icon: Inbox },
    { title: "邮箱策略", href: "/strategy", icon: Filter },
    { title: "发送邮件", href: "/send", icon: Send },
]

const secondaryItems: NavItem[] = [
    { title: "安全设置", href: "/safety", icon: ShieldCheck },
    { title: "三方邮箱", href: "/thirdparty", icon: Globe },
    { title: "系统设置", href: "/settings", icon: Settings },
]

export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
    const { pathname } = useLocation()
    const [unread, setUnread] = useState(0)

    // Count incoming-email pushes; clear when the user visits the inbox
    useEffect(() => {
        const onNewEmail = () => setUnread((u) => u + 1)
        window.addEventListener("email:new", onNewEmail)
        return () => window.removeEventListener("email:new", onNewEmail)
    }, [])

    useEffect(() => {
        if (pathname === "/inbox") setUnread(0)
    }, [pathname])

    return (
        <>
            <div className="flex h-16 items-center gap-2 border-b px-6">
                <BrandIcon className="size-8" />
                <span className="text-lg font-semibold tracking-tight">多邮箱系统</span>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                <p className="text-muted-foreground px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wider">
                    邮件工作台
                </p>
                {mainItems.map((item) => (
                    <SidebarItem
                        key={item.href}
                        item={item.href === "/inbox" ? { ...item, badge: unread } : item}
                        onNavigate={onNavigate}
                    />
                ))}

                <p className="text-muted-foreground px-3 pb-2 pt-6 text-xs font-semibold uppercase tracking-wider">
                    通用
                </p>
                {secondaryItems.map((item) => (
                    <SidebarItem key={item.href} item={item} onNavigate={onNavigate} />
                ))}
            </nav>

            <div className="border-t p-3">
                <div className="bg-sidebar-accent text-sidebar-accent-foreground rounded-lg p-3 text-xs">
                    <p className="font-medium">Email Admin</p>
                </div>
            </div>
        </>
    )
}

export function DesktopSidebar() {
    return (
        <aside className="bg-sidebar text-sidebar-foreground hidden h-full w-60 shrink-0 flex-col border-r md:flex">
            <SidebarBody />
        </aside>
    )
}

function SidebarItem({
    item,
    onNavigate,
}: {
    item: NavItem
    onNavigate?: () => void
}) {
    const Icon = item.icon
    return (
        <NavLink
            to={item.href}
            onClick={onNavigate}
            className={({ isActive }) =>
                cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                )
            }
        >
            <Icon className="size-4" />
            <span className="flex-1">{item.title}</span>
            {item.badge ? (
                <span className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
                    {item.badge > 99 ? "99+" : item.badge}
                </span>
            ) : null}
        </NavLink>
    )
}
