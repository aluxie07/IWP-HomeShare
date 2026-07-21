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
            "Saves the Wi‑Fi / LAN IP range used at upload. Only people on that same IP range can download.",
    },
];

export function getAccessModeLabel(mode) {
    return ACCESS_MODES.find((m) => m.value === mode)?.label || "Private";
}

export function canShareFile(file) {
    return file?.accessMode !== "private";
}
