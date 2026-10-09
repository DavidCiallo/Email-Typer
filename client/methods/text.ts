export function copytext(text: string) {
    navigator.clipboard.writeText(text);
}

/** Hue from the text, so a tag keeps the same colour everywhere it appears. */
export function textColor(label: string) {
    let hash = 0;
    for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) % 360;
    return {
        backgroundColor: `hsl(${hash} 72% 94%)`,
        color: `hsl(${hash} 55% 30%)`,
        borderColor: `hsl(${hash} 60% 84%)`,
    };
}
