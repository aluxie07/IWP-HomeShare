export const ACCESS_MODES = [
    {
        value: "private",
        label: "Private",
        description: "Only you can download this file. Share links are disabled.",
    },
    {
        value: "shared",
        label: "Shared",
        description: "You can create share links. Recipients can access from any network.",
    },
    {
        value: "local_only",
        label: "Local Only",
        description:
            "Only users on the trusted network (same Wi-Fi / LAN) can download this file.",
    },
];

export function getAccessModeLabel(mode) {
    return ACCESS_MODES.find((m) => m.value === mode)?.label || "Private";
}

export function canShareFile(file) {
    return file?.accessMode !== "private";
}
