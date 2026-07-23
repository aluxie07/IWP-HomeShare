import { fetchForSlot } from "./api";
import {
    canMergeLibraries,
    getActiveApiSlot,
    isLoggedInToSlot,
} from "./authStorage";
import { fileApiFetch, getFileApiSource } from "./mergedLibrary";

function tagFoldersForSource(folders, apiSource) {
    return (folders || []).map((folder) => {
        const sourceId = folder.id;
        const parentSource = folder.parentFolder
            ? String(folder.parentFolder)
            : null;
        return {
            ...folder,
            apiSource,
            sourceId,
            id: `${apiSource}:${sourceId}`,
            parentFolder: parentSource ? `${apiSource}:${parentSource}` : null,
        };
    });
}

export function getFolderApiSource(folder) {
    if (folder?.apiSource === "cloud" || folder?.apiSource === "local") {
        return folder.apiSource;
    }
    return getActiveApiSlot();
}

export function getFolderSourceId(folderOrId) {
    if (folderOrId && typeof folderOrId === "object") {
        if (folderOrId.sourceId != null) {
            return String(folderOrId.sourceId);
        }
        folderOrId = folderOrId.id;
    }
    const id = String(folderOrId || "");
    const colon = id.indexOf(":");
    if (colon > 0 && (id.startsWith("cloud:") || id.startsWith("local:"))) {
        return id.slice(colon + 1);
    }
    return id || null;
}

async function fetchFoldersFromSlot(slot) {
    if (!isLoggedInToSlot(slot)) {
        return [];
    }

    const res = await fetchForSlot(slot, "/folders/tree", { cache: "no-store" });
    if (res.status === 401) {
        const err = new Error("Unauthorized");
        err.status = 401;
        err.slot = slot;
        throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || `Could not load ${slot} folders`);
    }
    return tagFoldersForSource(data.folders || [], slot);
}

/** Load virtual folders from cloud and/or local (same merge rules as files). */
export async function fetchLibraryFolders() {
    if (canMergeLibraries()) {
        const results = await Promise.allSettled([
            fetchFoldersFromSlot("cloud"),
            fetchFoldersFromSlot("local"),
        ]);
        const lists = [];
        for (const result of results) {
            if (result.status === "fulfilled") {
                lists.push(result.value);
            } else if (result.reason?.status === 401) {
                throw result.reason;
            }
        }
        return lists.flat();
    }

    const slot = getActiveApiSlot();
    return fetchFoldersFromSlot(slot);
}

export async function createLibraryFolder({ name, parentId = null, slot }) {
    const targetSlot = slot || getActiveApiSlot();
    const res = await fetchForSlot(targetSlot, "/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            parentId: parentId || null,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
        const err = new Error("Unauthorized");
        err.status = 401;
        throw err;
    }
    if (!res.ok) {
        throw new Error(data.message || "Could not create folder");
    }
    return tagFoldersForSource([data.folder], targetSlot)[0];
}

export async function renameLibraryFolder(folder, name) {
    const slot = getFolderApiSource(folder);
    const sourceId = getFolderSourceId(folder);
    const res = await fetchForSlot(slot, `/folders/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
        const err = new Error("Unauthorized");
        err.status = 401;
        throw err;
    }
    if (!res.ok) {
        throw new Error(data.message || "Could not rename folder");
    }
    return tagFoldersForSource([data.folder], slot)[0];
}

export async function deleteLibraryFolder(folder) {
    const slot = getFolderApiSource(folder);
    const sourceId = getFolderSourceId(folder);
    const res = await fetchForSlot(slot, `/folders/${sourceId}`, {
        method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
        const err = new Error("Unauthorized");
        err.status = 401;
        throw err;
    }
    if (!res.ok) {
        throw new Error(data.message || "Could not delete folder");
    }
    return data;
}

export async function moveFileToFolder(file, folderId) {
    const res = await fileApiFetch(file, "/folder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
        const err = new Error("Unauthorized");
        err.status = 401;
        throw err;
    }
    if (!res.ok) {
        throw new Error(data.message || "Could not move file");
    }
    return data.file;
}

export function buildFolderBreadcrumbs(folders, currentFolderId) {
    if (!currentFolderId) {
        return [];
    }
    const byId = new Map((folders || []).map((f) => [String(f.id), f]));
    const trail = [];
    let cursor = byId.get(String(currentFolderId));
    const guard = new Set();
    while (cursor && !guard.has(String(cursor.id))) {
        guard.add(String(cursor.id));
        trail.unshift(cursor);
        cursor = cursor.parentFolder ? byId.get(String(cursor.parentFolder)) : null;
    }
    return trail;
}

export function resolveCreateFolderSlot(storageFilter, currentFolder) {
    if (currentFolder) {
        return getFolderApiSource(currentFolder);
    }
    if (storageFilter === "cloud" || storageFilter === "local") {
        return storageFilter;
    }
    return getActiveApiSlot();
}

export function fileMatchesFolder(file, folder, preferLocalLabels = false) {
    if (!folder) {
        return !file?.folderId;
    }
    const fileSlot = getFileApiSource(file);
    if (fileSlot !== getFolderApiSource(folder)) {
        return false;
    }
    return String(file.folderId || "") === String(getFolderSourceId(folder));
}

/** @deprecated use fetchLibraryFolders */
export const fetchCloudFolders = fetchLibraryFolders;
/** @deprecated use createLibraryFolder */
export const createCloudFolder = createLibraryFolder;
/** @deprecated use moveFileToFolder */
export const moveCloudFile = moveFileToFolder;
