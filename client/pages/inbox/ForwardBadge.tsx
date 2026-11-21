import { Badge } from "../../components/ui/badge";

// 策略转发的结果标识。只有「失败」和「部分送达」值得在列表上打扰用户：
// 「跳过」的原因留给「发送历史」，否则关掉转发开关的邮箱会让每封邮件都挂一个标签。
const ForwardBadge = ({ email }: { email: any }) => {
    const status = email?.forward_status;
    const detail = email?.forward_error || "";
    if (status === "failed") {
        return (
            <Badge variant="destructive" className="shrink-0" title={detail || "策略转发失败"}>
                转发失败
            </Badge>
        );
    }
    if (status === "partial") {
        return (
            <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-600" title={detail}>
                部分送达
            </Badge>
        );
    }
    return null;
};

export default ForwardBadge;
