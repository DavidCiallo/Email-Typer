import { useEffect, useState } from "react"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"

import { cn } from "@/client/lib/utils"

type ToastType = "success" | "error" | "info"

type ToastAction = { label: string; onClick: () => void }

type ToastItem = {
  id: number
  message: string
  type: ToastType
  action?: ToastAction
}

let pushToast: ((message: string, type: ToastType, action?: ToastAction) => void) | null = null

export function toast(message: string, type: ToastType = "info", action?: ToastAction) {
  pushToast?.(message, type, action)
}

toast.success = (m: string) => toast(m, "success")
toast.error = (m: string) => toast(m, "error")
toast.info = (m: string) => toast(m, "info")

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    pushToast = (message, type, action) => {
      const id = Date.now() + Math.random()
      setItems((prev) => [...prev, { id, message, type, action }])
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== id))
      }, 6000)
    }
    return () => {
      pushToast = null
    }
  }, [])

  function dismiss(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {items.map((it) => (
        <div
          key={it.id}
          className={cn(
            "bg-card text-card-foreground pointer-events-auto flex w-80 items-start gap-3 rounded-lg border p-4 shadow-lg",
            "animate-in slide-in-from-right-5 fade-in duration-200"
          )}
        >
          <ToastIcon type={it.type} />
          <div className="flex flex-1 flex-col gap-1.5">
            <p className="text-sm whitespace-pre-line">{it.message}</p>
            {it.action && (
              <button
                onClick={() => {
                  dismiss(it.id)
                  it.action!.onClick()
                }}
                className="text-primary w-fit cursor-pointer text-sm font-medium hover:underline"
              >
                {it.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(it.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success")
    return <CheckCircle2 className="size-5 text-emerald-500" />
  if (type === "error")
    return <AlertCircle className="size-5 text-destructive" />
  return <Info className="size-5 text-sky-500" />
}
