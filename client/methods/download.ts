import { toast } from "./notify";

/** POST + blob download — keeps the token in a header instead of the URL. */
export async function downloadAttachment(emailId: string, index: number, filename: string): Promise<void> {
    try {
        const res = await fetch("/api/email/attachment", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "token": localStorage.getItem("token") || "",
            },
            body: JSON.stringify({ id: emailId, index }),
        });
        if (!res.ok) {
            toast({ title: "附件下载失败", color: "danger" });
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "attachment";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch {
        toast({ title: "网络异常，下载失败", color: "danger" });
    }
}
