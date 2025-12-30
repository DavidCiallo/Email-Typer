import { EmailImpl } from "../../../shared/impl";

interface KeyLable {
    key: keyof EmailImpl;
    label: string;
}

export const keyLables: Array<KeyLable> = [
    { key: "from", label: "发件人" },
    { key: "to", label: "收件人" },
    { key: "subject", label: "主题" },
    { key: "time", label: "时间" },
    { key: "html", label: "原文本" },
]
