export const STORAGE_FILTERS = [
    { value: "all", label: "All files" },
    { value: "cloud", label: "Cloud" },
    { value: "local", label: "Local" },
];

export function getStorageScopeLabel(scope) {
    if (scope === "local") {
        return "Local";
    }
    if (scope === "cloud") {
        return "Cloud";
    }
    return "Cloud";
}

export function matchesStorageFilter(file, filter) {
    if (!filter || filter === "all") {
        return true;
    }
    return file?.storageScope === filter;
}
