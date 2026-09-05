import { useState } from "react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Plus, X } from "lucide-react";

/** Comma-separated tag editor. Value shape stays a plain string ("a,b,c"). */
export function TagInput({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    const [draft, setDraft] = useState("");

    function commit() {
        const t = draft.trim().replace(/,/g, "");
        if (!t) return;
        if (!tags.includes(t)) onChange([...tags, t].join(","));
        setDraft("");
    }

    function remove(tag: string) {
        onChange(tags.filter((x) => x !== tag).join(","));
    }

    return (
        <div className="border-input flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border bg-transparent px-2.5 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
            {tags.map((tag) => (
                <span
                    key={tag}
                    className="bg-secondary text-secondary-foreground inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5"
                >
                    <span className="truncate">{tag}</span>
                    <button
                        type="button"
                        aria-label={`删除 ${tag}`}
                        className="hover:text-destructive cursor-pointer"
                        onClick={() => remove(tag)}
                    >
                        <X className="size-3" />
                    </button>
                </span>
            ))}
            <input
                className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent outline-none"
                placeholder={tags.length === 0 ? placeholder : "回车添加…"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        commit();
                    }
                    if (e.key === "Backspace" && !draft && tags.length) {
                        remove(tags[tags.length - 1]);
                    }
                }}
                onBlur={commit}
            />
        </div>
    );
}

type Pair = { domain: string; key: string };

function parsePairs(value: string): Pair[] {
    return value
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
            const idx = p.indexOf(":");
            return idx === -1
                ? { domain: p, key: "" }
                : { domain: p.slice(0, idx).trim(), key: p.slice(idx + 1).trim() };
        });
}

/** "domain:key,domain:key" editor for resend_api_keys. Value shape stays a plain string. */
export function KeyValueList({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) {
    const pairs = parsePairs(value);

    function update(next: Pair[]) {
        onChange(
            next
                .filter((p) => p.domain || p.key)
                .map((p) => `${p.domain}:${p.key}`)
                .join(","),
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {pairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2">
                    <Input
                        className="flex-1"
                        placeholder="域名，如 example.com"
                        value={pair.domain}
                        onChange={(e) => {
                            const next = [...pairs];
                            next[i] = { ...pair, domain: e.target.value };
                            update(next);
                        }}
                    />
                    <span className="text-muted-foreground">:</span>
                    <Input
                        className="flex-[2]"
                        placeholder="API Key"
                        value={pair.key}
                        onChange={(e) => {
                            const next = [...pairs];
                            next[i] = { ...pair, key: e.target.value };
                            update(next);
                        }}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="删除该行"
                        onClick={() => update(pairs.filter((_, j) => j !== i))}
                    >
                        <X className="size-4" />
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => update([...pairs, { domain: "", key: "" }])}
            >
                <Plus className="size-4" />
                添加域名 Key
            </Button>
        </div>
    );
}
