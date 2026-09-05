import * as React from "react"
import { cn } from "@/client/lib/utils"

function Switch({
    className,
    checked,
    onCheckedChange,
    ...props
}: Omit<React.ComponentProps<"button">, "onChange" | "checked"> & {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            data-state={checked ? "checked" : "unchecked"}
            onClick={() => onCheckedChange?.(!checked)}
            className={cn(
                "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
                checked ? "bg-primary" : "bg-input dark:bg-input/60",
                className
            )}
            {...props}
        >
            <span
                className={cn(
                    "bg-background pointer-events-none block size-4 rounded-full shadow transition-transform",
                    checked ? "translate-x-4" : "translate-x-0.5"
                )}
            />
        </button>
    )
}

export { Switch }
