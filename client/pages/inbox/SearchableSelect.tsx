import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SearchOption {
    value: string;      // value reported through onChange
    label: string;      // primary line
    hint?: string;      // secondary line (address etc.)
    keywords?: string;  // extra searchable text (e.g. the mailbox note)
}

/** Searchable dropdown — trigger button, popover with a filter input, and a
 *  two-line option list (label + hint). Search covers label, hint, keywords. */
export function SearchableSelect({
    value,
    options,
    onChange,
    allLabel,
    searchPlaceholder,
    className,
}: {
    value: string;
    options: SearchOption[];
    onChange: (value: string) => void;
    allLabel: string;
    searchPlaceholder: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const selected = options.find((o) => o.value === value);
    const needle = q.trim().toLowerCase();
    const filtered = options.filter((o) =>
        !needle ||
        o.label.toLowerCase().includes(needle) ||
        (o.hint || "").toLowerCase().includes(needle) ||
        (o.keywords || "").toLowerCase().includes(needle)
    );

    return (
        <div className={cn("relative", className)}>
            <Button
                type="button"
                variant="outline"
                className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}
                onClick={() => { setOpen(!open); setQ(""); }}
            >
                <span className="min-w-0 flex-1 truncate text-left">
                    {selected ? selected.label : allLabel}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="bg-popover absolute z-50 mt-1 w-full rounded-md border shadow-md">
                        <div className="p-2 pb-0">
                            <Input autoFocus placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
                        </div>
                        <div className="max-h-60 overflow-y-auto p-1">
                            <button
                                type="button"
                                className={cn(
                                    "hover:bg-muted w-full rounded-sm px-3 py-2 text-left text-sm",
                                    value === "all" && "bg-muted font-medium",
                                )}
                                onClick={() => { onChange("all"); setOpen(false); }}
                            >
                                {allLabel}
                            </button>
                            {filtered.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    title={[o.label, o.hint].filter(Boolean).join(" · ")}
                                    className={cn(
                                        "hover:bg-muted w-full rounded-sm px-3 py-2 text-left",
                                        o.value === value && "bg-muted font-medium",
                                    )}
                                    onClick={() => { onChange(o.value); setOpen(false); }}
                                >
                                    <div className="truncate text-sm">{o.label}</div>
                                    {o.hint && (
                                        <div className="text-muted-foreground truncate text-xs">{o.hint}</div>
                                    )}
                                </button>
                            ))}
                            {filtered.length === 0 && (
                                <div className="text-muted-foreground py-3 text-center text-sm">没有匹配项</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
