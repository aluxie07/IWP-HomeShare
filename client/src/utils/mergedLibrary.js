import { fetchForSlot } from "./api";
import {
    canMergeLibraries,
    getActiveApiSlot,
    getLibraryLinkStatus,
    isLoggedInToSlot,
} from "./authStorage";

export function tagFilesForSource(files, apiSource) {
    return (files || []).map((file) => ({
        ...file,
        apiSource,
        sourceId: file.id,
        id: `${apiSource}:${file.id}`,
    }));
}

export function getFileApiSource(file) {
    if (file?.apiSource === "cloud" || file?.apiSource === "local") {
        return file.apiSource;
    }
    return getActiveApiSlot();
}

export function getFileSourceId(file) {
    if (file?.sourceId != null) {
        return file.sourceId;
    }
    const id = String(file?.id || "");
    const colon = id.indexOf(":");
    if (colon > 0) {
        return id.slice(colon + 1);
    }
    return id;
}

export function mergeAndSortFiles(lists) {
    const merged = lists.flat().filter(Boolean);
    merged.sort((a, b) => {
        const aDeleted = Boolean(a.deleted);
        const bDeleted = Boolean(b.deleted);
        if (aDeleted !== bDeleted) {
            return aDeleted ? 1 : -1;
        }
        const aTime = new Date(a.deleted ? a.deletedAt : a.uploadDate).getTime();
        const bTime = new Date(b.deleted ? b.deletedAt : b.uploadDate).getTime();
        return bTime - aTime;
    });
    return merged;
}

async function fetchFilesFromSlot(slot) {
    if (!isLoggedInToSlot(slot)) {
        return { files: [], note: "" };
    }

    // Always load /files first so Library works even if folder sync is slow/hangs
    // (e.g. right after a large local disk upload).
    const res = await fetchForSlot(slot, "/files", { cache: "no-store" });
    if (res.status === 401) {
        const err = new Error("Unauthorized");
        err.status = 401;
        err.slot = slot;
        throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || `Could not load ${slot} files`);
    }

    let files = tagFilesForSource(data.files || [], slot);
    let note = "";

    if (slot === "local") {
        try {
            const syncRes = await fetchForSlot(slot, "/files/sync-folder", {
                method: "POST",
                cache: "no-store",
            });
            if (syncRes.status === 401) {
                const err = new Error("Unauthorized");
                err.status = 401;
                err.slot = slot;
                throw err;
            }
            const syncData = await syncRes.json().catch(() => ({}));
            if (syncRes.ok && Array.isArray(syncData.files)) {
                files = tagFilesForSource(syncData.files, slot);
                note = syncData.skipped ? "" : syncData.message || "";
            }
        } catch (err) {
            if (err.status === 401) {
                throw err;
            }
            // Keep the /files result; sync is best-effort
        }
    }

    return { files, note };
}

/**
 * Load library from active API, or merge cloud+local when emails match.
 */
export async function fetchMergedLibrarySnapshot() {
    const linkStatus = getLibraryLinkStatus();
    const notes = [];

    if (canMergeLibraries()) {
        const results = await Promise.allSettled([
            fetchFilesFromSlot("cloud"),
            fetchFilesFromSlot("local"),
        ]);

        const lists = [];
        let unauthorizedSlot = null;
        let cloudOk = false;
        let localOk = false;

        results.forEach((result, index) => {
            const slot = index === 0 ? "cloud" : "local";
            if (result.status === "fulfilled") {
                lists.push(result.value.files);
                if (slot === "cloud") cloudOk = true;
                if (slot === "local") localOk = true;
                if (result.value.note) {
                    notes.push(result.value.note);
                }
            } else if (result.reason?.status === 401) {
                unauthorizedSlot = slot;
            } else if (result.reason?.message) {
                notes.push(
                    slot === "local"
                        ? `Local unreachable — start the local server and Detect again (${result.reason.message})`
                        : `Cloud: ${result.reason.message}`
                );
            }
        });

        if (unauthorizedSlot && lists.length === 0) {
            const err = new Error("Unauthorized");
            err.status = 401;
            err.slot = unauthorizedSlot;
            throw err;
        }

        if (cloudOk && localOk) {
            notes.unshift("Showing cloud + local libraries (same email)");
        } else if (cloudOk && !localOk) {
            notes.unshift(
                "Showing cloud library only — local session is linked but the local server is not reachable"
            );
        } else if (!cloudOk && localOk) {
            notes.unshift(
                "Showing local library only — cloud session is linked but the cloud API is not reachable"
            );
        }

        return {
            files: mergeAndSortFiles(lists),
            note: notes.filter(Boolean).join(" · "),
            linkStatus,
            merged: cloudOk && localOk,
        };
    }

    const slot = getActiveApiSlot();
    const result = await fetchFilesFromSlot(slot);
    if (linkStatus.message) {
        notes.push(linkStatus.message);
    }
    if (result.note) {
        notes.push(result.note);
    }

    return {
        files: result.files,
        note: notes.filter(Boolean).join(" · "),
        linkStatus,
        merged: false,
    };
}

export async function fileApiFetch(file, pathSuffix, options = {}) {
    const slot = getFileApiSource(file);
    const sourceId = getFileSourceId(file);
    const path = `/files/${encodeURIComponent(sourceId)}${pathSuffix}`;
    return fetchForSlot(slot, path, options);
}
