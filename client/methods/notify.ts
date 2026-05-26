import { addToast } from "@heroui/react";

export function toast({ title, description, color }: { title: string; description?: string; color?: "success" | "danger" | "primary" | "default" | "warning" }) {
    addToast({ title, description, color, hideCloseButton: true });
}
