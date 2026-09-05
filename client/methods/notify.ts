import { toast as pushToast } from "../components/ui/sonner";

type ToastColor = "success" | "danger" | "warning" | "default" | "primary" | "secondary" | undefined;

type ToastAction = { label: string; onClick: () => void };

type ToastProps = {
    title: string;
    description?: string;
    color?: ToastColor;
    action?: ToastAction;
};

const colorToType = (color?: ToastColor): "success" | "error" | "info" => {
    if (color === "success") return "success";
    if (color === "danger") return "error";
    return "info";
};

export function toast({ title, description, color, action }: ToastProps) {
    const message = description ? `${title}\n${description}` : title || "";
    pushToast(message, colorToType(color), action);
}
