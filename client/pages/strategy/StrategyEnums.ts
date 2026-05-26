interface KeyLable {
    key: string;
    label: string;
}

export const keyLables: Array<KeyLable> = [
    { key: "name", label: "策略名称" },
    { key: "from_pattern", label: "发件人" },
    { key: "to_pattern", label: "收件人" },
    { key: "forward_to", label: "转发邮箱" },
    { key: "action", label: "操作" },
];
