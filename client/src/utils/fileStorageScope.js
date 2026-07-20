export const STORAGE_FILTERS = [
    { value: "all", label: "All files" },
    { value: "cloud", label: "Cloud" },
    { value: "local", label: "Local" },
];

/**
 * Resolve Local vs Cloud from API fields.
 * Older local servers omit storageScope — fall back to storageKind / path hints.
 */
export function resolveStorageScope(file, { preferLocal = false } = {}) {
    if (file?.storageScope === "local" || file?.storageScope === "cloud") {
        return file.storageScope;
    }

    const kind = String(file?.storageKind || "").toLowerCase();
    if (kind === "disk") {
        return "local";
    }
    if (kind === "gridfs" || kind === "shards") {
        return "cloud";
    }

    if (file?.gridfsId || (Array.isArray(file?.shards) && file.shards.length > 0)) {
        return "cloud";
    }

    if (file?.storagePath) {
        return "local";
    }

    // Connected to a local disk server that doesn't send scope yet
    if (preferLocal) {
        return "local";
    }

    return "cloud";
}

export function getStorageScopeLabel(scope) {
    if (scope === "local") {
        return "Local";
    }
    if (scope === "cloud") {
        return "Cloud";
    }
    return "Cloud";
}

export function matchesStorageFilter(file, filter, options = {}) {
    if (!filter || filter === "all") {
        return true;
    }
    return resolveStorageScope(file, options) === filter;
}
