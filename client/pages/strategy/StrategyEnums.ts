interface KeyLable {
    key: string;
    label: string;
}

export const keyLables: Array<KeyLable> = [
    { key: "name", label: "名称" },
    { key: "from_pattern", label: "发件匹配" },
    { key: "forward_to", label: "转发邮箱" },
    { key: "account_id", label: "创建者" },
    { key: "action", label: "操作" },
];
