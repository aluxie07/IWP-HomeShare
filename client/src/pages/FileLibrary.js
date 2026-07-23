import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShareFileModal from "../components/ShareFileModal";
import FileThumbnail from "../components/FileThumbnail";
import FileTextPreview from "../components/FileTextPreview";
import FileDocumentPreview from "../components/FileDocumentPreview";
import {
    getApiUrl,
    formatFileSize,
    formatUploadDate,
} from "../utils/api";
import { ACCESS_MODES, canShareFile } from "../utils/accessModes";
import {
    STORAGE_FILTERS,
    getStorageScopeLabel,
    matchesStorageFilter,
    resolveStorageScope,
} from "../utils/fileStorageScope";
import { getApiMode } from "../utils/apiDiscovery";
import {
    fetchMergedLibrarySnapshot,
    fileApiFetch,
    getFileApiSource,
} from "../utils/mergedLibrary";
import { isLoggedInToSlot } from "../utils/authStorage";
import {
    buildFolderBreadcrumbs,
    createLibraryFolder,
    deleteLibraryFolder,
    fetchLibraryFolders,
    getFolderApiSource,
    getFolderSourceId,
    moveFileToFolder,
    renameLibraryFolder,
    resolveCreateFolderSlot,
} from "../utils/cloudFolders";
import { isTextFile } from "../utils/textFilePreview";
import { isDocumentPreviewFile } from "../utils/documentPreview";

function isLocalApiMode() {
    const mode = getApiMode();
    return mode === "local" || mode === "manual";
}

function shortFileType(file) {
    const name = file?.filename || "";
    const dot = name.lastIndexOf(".");
    if (dot < 0) {
        return "FILE";
    }
    const ext = name.slice(dot + 1).toUpperCase();
    return ext.slice(0, 4) || "FILE";
}

function filterLabel(value) {
    if (value === "all") {
        return "All";
    }
    if (value === "cloud") {
        return "Cloud";
    }
    if (value === "local") {
        return "Local";
    }
    return value;
}

function mergeServerFileIntoTagged(existing, serverFile) {
    return {
        ...existing,
        ...serverFile,
        apiSource: existing.apiSource,
        sourceId: serverFile.id ?? existing.sourceId,
        id: existing.id,
    };
}

function uploadTargetFromFolder(folder) {
    if (!folder) {
        return null;
    }
    return {
        folderId: getFolderSourceId(folder),
        slot: getFolderApiSource(folder),
    };
}

function FileLibrary({ onRedirectToLogin, onGoToUpload }) {
    const [files, setFiles] = useState([]);
    const [folders, setFolders] = useState([]);
    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [selectedFileId, setSelectedFileId] = useState(null);
    const [shareFile, setShareFile] = useState(null);
    const [updatingModeId, setUpdatingModeId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [folderBusy, setFolderBusy] = useState(false);
    const [movingId, setMovingId] = useState(null);
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [createFolderSlot, setCreateFolderSlot] = useState("cloud");
    const [createFolderError, setCreateFolderError] = useState("");
    const [dragFileId, setDragFileId] = useState(null);
    const [dropTargetKey, setDropTargetKey] = useState(null);
    const [syncNote, setSyncNote] = useState("");
    const [linkBanner, setLinkBanner] = useState("");
    const [storageFilter, setStorageFilter] = useState("all");
    const [preferLocalLabels, setPreferLocalLabels] = useState(false);
    const skipFileClickRef = useRef(false);
    const skipFolderClickRef = useRef(false);

    const activeFiles = useMemo(
        () => files.filter((file) => !file.deleted),
        [files]
    );
    const filteredActiveFiles = useMemo(
        () =>
            activeFiles.filter((file) =>
                matchesStorageFilter(file, storageFilter, {
                    preferLocal: preferLocalLabels,
                })
            ),
        [activeFiles, storageFilter, preferLocalLabels]
    );
    const foldersEnabled =
        isLoggedInToSlot("cloud") || isLoggedInToSlot("local");
    const currentFolder = useMemo(
        () =>
            currentFolderId
                ? folders.find((folder) => String(folder.id) === String(currentFolderId)) ||
                  null
                : null,
        [folders, currentFolderId]
    );
    const folderBreadcrumbs = useMemo(
        () => buildFolderBreadcrumbs(folders, currentFolderId),
        [folders, currentFolderId]
    );
    const visibleFolders = useMemo(() => {
        if (!foldersEnabled) {
            return [];
        }
        const parentKey = currentFolderId ? String(currentFolderId) : null;
        return folders
            .filter((folder) => {
                if (storageFilter === "cloud" && folder.apiSource !== "cloud") {
                    return false;
                }
                if (storageFilter === "local" && folder.apiSource !== "local") {
                    return false;
                }
                const parent = folder.parentFolder
                    ? String(folder.parentFolder)
                    : null;
                return parent === parentKey;
            })
            .sort((a, b) =>
                String(a.name).localeCompare(String(b.name), undefined, {
                    sensitivity: "base",
                })
            );
    }, [folders, currentFolderId, foldersEnabled, storageFilter]);
    const visibleFiles = useMemo(() => {
        if (!foldersEnabled) {
            return filteredActiveFiles;
        }

        return filteredActiveFiles.filter((file) => {
            if (currentFolder) {
                const fileSlot = getFileApiSource(file);
                if (fileSlot !== getFolderApiSource(currentFolder)) {
                    return false;
                }
                return (
                    String(file.folderId || "") ===
                    String(getFolderSourceId(currentFolder))
                );
            }
            return !file.folderId;
        });
    }, [filteredActiveFiles, foldersEnabled, currentFolder]);
    const deletedFiles = useMemo(
        () => files.filter((file) => file.deleted),
        [files]
    );
    const selectedFile = useMemo(
        () => files.find((file) => file.id === selectedFileId) || null,
        [files, selectedFileId]
    );
    const moveFolderOptions = useMemo(() => {
        if (!selectedFile) {
            return [{ id: "", label: "Library root" }];
        }
        const fileSlot = getFileApiSource(selectedFile);
        const options = [{ id: "", label: "Library root" }];
        const sorted = folders
            .filter((folder) => folder.apiSource === fileSlot)
            .sort((a, b) =>
                String(a.name).localeCompare(String(b.name), undefined, {
                    sensitivity: "base",
                })
            );
        sorted.forEach((folder) => {
            const trail = buildFolderBreadcrumbs(folders, folder.id)
                .map((entry) => entry.name)
                .join(" / ");
            options.push({
                id: String(getFolderSourceId(folder)),
                label: trail || folder.name,
            });
        });
        return options;
    }, [folders, selectedFile]);

    const applySnapshot = useCallback((snapshot, { refreshLabel = false } = {}) => {
        setFiles(snapshot.files);
        const linkMsg =
            !snapshot.linkStatus?.linked && snapshot.linkStatus?.message
                ? snapshot.linkStatus.message
                : "";
        setLinkBanner(linkMsg);

        let note = snapshot.note || "";
        if (refreshLabel && !note) {
            note = "Library refreshed";
        }
        setSyncNote(note);
    }, []);

    const loadFolders = useCallback(async () => {
        try {
            const next = await fetchLibraryFolders();
            setFolders(next);
            return next;
        } catch (err) {
            if (err.status === 401) {
                onRedirectToLogin();
                return null;
            }
            setFolders([]);
            return [];
        }
    }, [onRedirectToLogin]);

    const fetchLibrarySnapshot = useCallback(async () => {
        try {
            return await fetchMergedLibrarySnapshot();
        } catch (err) {
            if (err.status === 401) {
                onRedirectToLogin();
                return null;
            }
            throw err;
        }
    }, [onRedirectToLogin]);

    useEffect(() => {
        let cancelled = false;

        const loadOnEnter = async () => {
            setLoading(true);
            setError("");
            setSyncNote("");
            setLinkBanner("");

            try {
                const [snapshot] = await Promise.all([
                    fetchLibrarySnapshot(),
                    loadFolders(),
                ]);
                if (cancelled || !snapshot) {
                    return;
                }
                applySnapshot(snapshot);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.message ||
                            "Could not reach server. Is the backend running?"
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadOnEnter();
        return () => {
            cancelled = true;
        };
    }, [fetchLibrarySnapshot, applySnapshot, loadFolders]);

    useEffect(() => {
        if (!currentFolderId) {
            return;
        }
        const folder = folders.find(
            (entry) => String(entry.id) === String(currentFolderId)
        );
        if (!folder) {
            setCurrentFolderId(null);
            return;
        }
        if (storageFilter === "cloud" && folder.apiSource !== "cloud") {
            setCurrentFolderId(null);
        } else if (storageFilter === "local" && folder.apiSource !== "local") {
            setCurrentFolderId(null);
        }
    }, [storageFilter, currentFolderId, folders]);

    useEffect(() => {
        let cancelled = false;
        const onLocalApi = isLocalApiMode();
        if (!onLocalApi) {
            setPreferLocalLabels(false);
            return undefined;
        }

        fetch(`${getApiUrl()}/health`, { cache: "no-store" })
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) {
                    return;
                }
                const localDisk =
                    data.storageScope === "local" ||
                    data.storageMode === "disk" ||
                    Boolean(data.folderShare);
                setPreferLocalLabels(localDisk);
            })
            .catch(() => {
                if (!cancelled) {
                    setPreferLocalLabels(onLocalApi);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedFileId) {
            return undefined;
        }

        const onKeyDown = (event) => {
            if (event.key === "Escape" && !shareFile) {
                setSelectedFileId(null);
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [selectedFileId, shareFile]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setError("");
        setSyncNote("");

        try {
            const [snapshot] = await Promise.all([
                fetchLibrarySnapshot(),
                loadFolders(),
            ]);
            if (!snapshot) {
                return;
            }
            applySnapshot(snapshot, { refreshLabel: true });
        } catch (err) {
            setError(
                err.message || "Could not refresh. Is the server running?"
            );
        } finally {
            setRefreshing(false);
        }
    };

    const loadFiles = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [snapshot] = await Promise.all([
                fetchLibrarySnapshot(),
                loadFolders(),
            ]);
            if (snapshot) {
                applySnapshot(snapshot);
            }
        } catch (err) {
            setError(
                err.message || "Could not reach server. Is the backend running?"
            );
        } finally {
            setLoading(false);
        }
    }, [fetchLibrarySnapshot, applySnapshot, loadFolders]);

    const createSlotChoices = useMemo(() => {
        const choices = [];
        if (isLoggedInToSlot("cloud")) {
            choices.push({ value: "cloud", label: "Cloud" });
        }
        if (isLoggedInToSlot("local")) {
            choices.push({ value: "local", label: "Local" });
        }
        return choices;
    }, []);

    const showCreateSlotPicker =
        !currentFolder &&
        storageFilter === "all" &&
        createSlotChoices.length > 1;

    const openCreateFolderModal = () => {
        const defaultSlot = resolveCreateFolderSlot(storageFilter, currentFolder);
        setCreateFolderSlot(
            isLoggedInToSlot(defaultSlot)
                ? defaultSlot
                : createSlotChoices[0]?.value || "cloud"
        );
        setNewFolderName("");
        setCreateFolderError("");
        setCreateFolderOpen(true);
    };

    const closeCreateFolderModal = () => {
        if (folderBusy) {
            return;
        }
        setCreateFolderOpen(false);
        setNewFolderName("");
        setCreateFolderError("");
    };

    const handleCreateFolder = async (event) => {
        event.preventDefault();
        const trimmed = newFolderName.trim();
        if (!trimmed) {
            setCreateFolderError("Folder name is required");
            return;
        }

        const slot = showCreateSlotPicker
            ? createFolderSlot
            : resolveCreateFolderSlot(storageFilter, currentFolder);

        if (!isLoggedInToSlot(slot)) {
            setCreateFolderError(
                slot === "local"
                    ? "Connect to local mode to create a local folder."
                    : "Sign in to cloud to create a cloud folder."
            );
            return;
        }

        setFolderBusy(true);
        setCreateFolderError("");
        setError("");
        try {
            await createLibraryFolder({
                name: trimmed,
                parentId: currentFolder
                    ? getFolderSourceId(currentFolder)
                    : null,
                slot,
            });
            await loadFolders();
            setSyncNote("Folder created");
            setCreateFolderOpen(false);
            setNewFolderName("");
        } catch (err) {
            if (err.status === 401) {
                onRedirectToLogin();
                return;
            }
            setCreateFolderError(err.message || "Could not create folder");
        } finally {
            setFolderBusy(false);
        }
    };

    const handleRenameCurrentFolder = async () => {
        if (!currentFolder) {
            return;
        }
        const name = window.prompt("Rename folder", currentFolder.name || "");
        if (name == null) {
            return;
        }
        const trimmed = name.trim();
        if (!trimmed) {
            setError("Folder name is required");
            return;
        }

        setFolderBusy(true);
        setError("");
        try {
            await renameLibraryFolder(currentFolder, trimmed);
            await loadFolders();
            setSyncNote("Folder renamed");
        } catch (err) {
            if (err.status === 401) {
                onRedirectToLogin();
                return;
            }
            setError(err.message || "Could not rename folder");
        } finally {
            setFolderBusy(false);
        }
    };

    const handleDeleteCurrentFolder = async () => {
        if (!currentFolder) {
            return;
        }
        if (
            !window.confirm(
                `Delete folder "${currentFolder.name || "Untitled"}"? It must be empty.`
            )
        ) {
            return;
        }

        setFolderBusy(true);
        setError("");
        try {
            await deleteLibraryFolder(currentFolder);
            setCurrentFolderId(
                currentFolder.parentFolder
                    ? String(currentFolder.parentFolder)
                    : null
            );
            await loadFolders();
            setSyncNote("Folder deleted");
        } catch (err) {
            if (err.status === 401) {
                onRedirectToLogin();
                return;
            }
            setError(err.message || "Could not delete folder");
        } finally {
            setFolderBusy(false);
        }
    };

    const handleMoveFile = async (file, nextFolderId) => {
        setMovingId(file.id);
        setError("");
        try {
            const updated = await moveFileToFolder(file, nextFolderId || null);
            if (updated) {
                setFiles((prev) =>
                    prev.map((entry) =>
                        entry.id === file.id
                            ? mergeServerFileIntoTagged(entry, updated)
                            : entry
                    )
                );
            } else {
                await loadFiles();
            }
            setSyncNote("File moved");
            setSelectedFileId(null);
        } catch (err) {
            if (err.status === 401) {
                onRedirectToLogin();
                return;
            }
            setError(err.message || "Could not move file");
        } finally {
            setMovingId(null);
            setDragFileId(null);
            setDropTargetKey(null);
        }
    };

    const clearDragState = () => {
        setDragFileId(null);
        setDropTargetKey(null);
    };

    const handleFileDragStart = (event, file) => {
        event.dataTransfer.setData("text/plain", file.id);
        event.dataTransfer.effectAllowed = "move";
        setDragFileId(file.id);
    };

    const handleFolderDragOver = (event, targetKey) => {
        if (!dragFileId) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dropTargetKey !== targetKey) {
            setDropTargetKey(targetKey);
        }
    };

    const handleFolderDrop = async (event, targetFolder) => {
        event.preventDefault();
        event.stopPropagation();
        skipFolderClickRef.current = true;
        const fileId = event.dataTransfer.getData("text/plain") || dragFileId;
        clearDragState();
        if (!fileId) {
            return;
        }

        const file = files.find((entry) => entry.id === fileId);
        if (!file || file.deleted) {
            return;
        }

        if (targetFolder) {
            if (getFileApiSource(file) !== getFolderApiSource(targetFolder)) {
                setError(
                    "Files can only move into folders on the same network (cloud or local)."
                );
                return;
            }
            const nextId = getFolderSourceId(targetFolder);
            if (String(file.folderId || "") === String(nextId || "")) {
                return;
            }
            await handleMoveFile(file, nextId);
            return;
        }

        // Dropped on Library root
        if (!file.folderId) {
            return;
        }
        await handleMoveFile(file, null);
    };

    const handleDelete = async (file) => {
        if (
            !window.confirm(
                `Delete "${file.filename}"? The file will be removed, but a log entry will stay in the library.`
            )
        ) {
            return;
        }

        setDeletingId(file.id);
        setError("");

        try {
            const res = await fileApiFetch(file, "", { method: "DELETE" });

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.message || "Could not delete file");
                return;
            }

            setSelectedFileId(null);
            await loadFiles();
        } catch {
            setError("Could not delete file");
        } finally {
            setDeletingId(null);
        }
    };

    const handleAccessModeChange = async (file, nextMode) => {
        setUpdatingModeId(file.id);
        setError("");

        try {
            const res = await fileApiFetch(file, "/access-mode", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ accessMode: nextMode }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "Could not update access mode");
                return;
            }

            if (data.file) {
                setFiles((prev) =>
                    prev.map((entry) =>
                        entry.id === file.id
                            ? mergeServerFileIntoTagged(entry, data.file)
                            : entry
                    )
                );
            } else {
                await loadFiles();
            }
        } catch {
            setError("Could not update access mode");
        } finally {
            setUpdatingModeId(null);
        }
    };

    const handleDownload = async (file) => {
        try {
            const res = await fileApiFetch(file, "/download");

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message || "Download failed");
                return;
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            setError("Could not download file");
        }
    };

    const closeDetail = () => {
        if (!shareFile) {
            setSelectedFileId(null);
        }
    };

    const isEmptyLibrary =
        !loading &&
        !error &&
        activeFiles.length === 0 &&
        deletedFiles.length === 0 &&
        folders.length === 0;
    const isEmptyFolderView =
        !loading &&
        !error &&
        foldersEnabled &&
        visibleFolders.length === 0 &&
        visibleFiles.length === 0 &&
        (currentFolderId || activeFiles.length > 0 || folders.length > 0);

    return (
        <section className="dashboard-page dashboard-page--wide lib-page">
            <div className="lib-card">
                <div className="lib-header">
                    <div>
                        <h2 className="lib-title">File library</h2>
                        <p className="lib-intro">
                            Click any file to preview it, change who can see it, or send a share
                            link. Organize cloud and local files into virtual folders (they stay
                            flat in the Windows HomeShare folder). Removed files stay listed below
                            for a while, so nothing disappears without a trace.
                        </p>
                    </div>
                    <div className="lib-header-actions">
                        {foldersEnabled && (
                            <button
                                type="button"
                                className="file-download-btn"
                                onClick={openCreateFolderModal}
                                disabled={folderBusy || loading}
                            >
                                New folder
                            </button>
                        )}
                        <button
                            type="button"
                            className="file-download-btn"
                            onClick={handleRefresh}
                            disabled={refreshing || loading}
                        >
                            {refreshing ? "Refreshing…" : "Refresh"}
                        </button>
                        <button
                            type="button"
                            className="logout-btn files-upload-nav-btn"
                            onClick={() =>
                                onGoToUpload(uploadTargetFromFolder(currentFolder))
                            }
                        >
                            Upload
                        </button>
                    </div>
                </div>

                {!loading && linkBanner && (
                    <div className="lib-link-banner" role="status">
                        <span>{linkBanner}</span>
                    </div>
                )}

                {loading && <p className="files-muted">Loading your files…</p>}
                {error && <p className="error">{error}</p>}
                {!error && syncNote && <p className="files-muted">{syncNote}</p>}

                {!loading && !error && (activeFiles.length > 0 || folders.length > 0) && (
                    <div className="file-library-filters" role="group" aria-label="Filter by storage">
                        {STORAGE_FILTERS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`file-library-filter-btn ${
                                    storageFilter === option.value
                                        ? "file-library-filter-btn--active"
                                        : ""
                                }`}
                                aria-pressed={storageFilter === option.value}
                                onClick={() => setStorageFilter(option.value)}
                            >
                                {filterLabel(option.value)}
                            </button>
                        ))}
                    </div>
                )}

                {foldersEnabled && !loading && !error && (
                    <div className="lib-folder-bar">
                        <nav className="lib-folder-crumbs" aria-label="Folder path">
                            <button
                                type="button"
                                className={`lib-folder-crumb${
                                    !currentFolderId ? " lib-folder-crumb--current" : ""
                                }${
                                    dropTargetKey === "root"
                                        ? " lib-folder-crumb--drop"
                                        : ""
                                }`}
                                onClick={() => {
                                    if (skipFolderClickRef.current) {
                                        skipFolderClickRef.current = false;
                                        return;
                                    }
                                    setCurrentFolderId(null);
                                }}
                                onDragOver={(event) =>
                                    handleFolderDragOver(event, "root")
                                }
                                onDragLeave={() => {
                                    if (dropTargetKey === "root") {
                                        setDropTargetKey(null);
                                    }
                                }}
                                onDrop={(event) => handleFolderDrop(event, null)}
                            >
                                Library
                            </button>
                            {folderBreadcrumbs.map((folder) => (
                                <span key={folder.id} className="lib-folder-crumb-wrap">
                                    <span className="lib-folder-crumb-sep" aria-hidden="true">
                                        /
                                    </span>
                                    <button
                                        type="button"
                                        className={`lib-folder-crumb${
                                            String(folder.id) === String(currentFolderId)
                                                ? " lib-folder-crumb--current"
                                                : ""
                                        }${
                                            dropTargetKey === String(folder.id)
                                                ? " lib-folder-crumb--drop"
                                                : ""
                                        }`}
                                        onClick={() => {
                                            if (skipFolderClickRef.current) {
                                                skipFolderClickRef.current = false;
                                                return;
                                            }
                                            setCurrentFolderId(String(folder.id));
                                        }}
                                        onDragOver={(event) =>
                                            handleFolderDragOver(event, String(folder.id))
                                        }
                                        onDragLeave={() => {
                                            if (dropTargetKey === String(folder.id)) {
                                                setDropTargetKey(null);
                                            }
                                        }}
                                        onDrop={(event) => handleFolderDrop(event, folder)}
                                    >
                                        {folder.name}
                                    </button>
                                </span>
                            ))}
                        </nav>
                        {currentFolderId && (
                            <div className="lib-folder-bar-actions">
                                <button
                                    type="button"
                                    className="files-link-btn"
                                    onClick={handleRenameCurrentFolder}
                                    disabled={folderBusy}
                                >
                                    Rename
                                </button>
                                <button
                                    type="button"
                                    className="files-link-btn"
                                    onClick={handleDeleteCurrentFolder}
                                    disabled={folderBusy}
                                >
                                    Delete folder
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {!loading &&
                    !error &&
                    activeFiles.length > 0 &&
                    filteredActiveFiles.length === 0 &&
                    visibleFolders.length === 0 && (
                        <p className="files-muted">
                            No {storageFilter === "cloud" ? "cloud" : "local"} files in your
                            library.{" "}
                            <button
                                type="button"
                                className="files-link-btn"
                                onClick={() => setStorageFilter("all")}
                            >
                                Show all files
                            </button>
                        </p>
                    )}

                {isEmptyFolderView && (
                    <p className="files-muted">
                        This folder is empty.{" "}
                        <button
                            type="button"
                            className="files-link-btn"
                            onClick={() =>
                                onGoToUpload(uploadTargetFromFolder(currentFolder))
                            }
                        >
                            Upload into this folder
                        </button>
                    </p>
                )}

                {!loading && (visibleFolders.length > 0 || visibleFiles.length > 0) && (
                    <div
                        className={`lib-grid${dragFileId ? " lib-grid--dragging" : ""}`}
                        role="list"
                        onDragEnd={clearDragState}
                    >
                        {visibleFolders.map((folder) => (
                            <button
                                key={`folder:${folder.id}`}
                                type="button"
                                role="listitem"
                                className={`lib-tile lib-tile--folder${
                                    dropTargetKey === String(folder.id)
                                        ? " lib-tile--drop-target"
                                        : ""
                                }`}
                                onClick={() => {
                                    if (skipFolderClickRef.current) {
                                        skipFolderClickRef.current = false;
                                        return;
                                    }
                                    setCurrentFolderId(String(folder.id));
                                }}
                                onDragOver={(event) =>
                                    handleFolderDragOver(event, String(folder.id))
                                }
                                onDragLeave={() => {
                                    if (dropTargetKey === String(folder.id)) {
                                        setDropTargetKey(null);
                                    }
                                }}
                                onDrop={(event) => handleFolderDrop(event, folder)}
                            >
                                <div className="lib-thumb lib-thumb--folder" aria-hidden="true">
                                    <span className="lib-folder-glyph" />
                                </div>
                                <div className="lib-tile-body">
                                    <span
                                        className={`lib-tile-storage-inline lib-tile-storage-inline--${
                                            folder.apiSource === "local"
                                                ? "local"
                                                : "cloud"
                                        }`}
                                    >
                                        Folder
                                    </span>
                                    <span className="lib-tile-name" title={folder.name}>
                                        {folder.name}
                                    </span>
                                    <span className="lib-tile-meta">
                                        {folder.apiSource === "local"
                                            ? "Local"
                                            : "Cloud"}
                                    </span>
                                </div>
                            </button>
                        ))}
                        {visibleFiles.map((file) => {
                            const scope = resolveStorageScope(file, {
                                preferLocal: preferLocalLabels,
                            });
                            const scopeClass = scope === "local" ? "local" : "cloud";
                            return (
                                <button
                                    key={file.id}
                                    type="button"
                                    role="listitem"
                                    className={`lib-tile${
                                        dragFileId === file.id ? " lib-tile--dragging" : ""
                                    }`}
                                    draggable
                                    onDragStart={(event) => {
                                        skipFileClickRef.current = true;
                                        handleFileDragStart(event, file);
                                    }}
                                    onDragEnd={clearDragState}
                                    onClick={() => {
                                        if (skipFileClickRef.current) {
                                            skipFileClickRef.current = false;
                                            return;
                                        }
                                        setSelectedFileId(file.id);
                                    }}
                                >
                                    <div className="lib-thumb">
                                        <span
                                            className={`lib-storage-badge lib-storage-badge--${scopeClass}`}
                                        >
                                            {getStorageScopeLabel(scope)}
                                        </span>
                                        <FileThumbnail
                                            file={file}
                                            onAuthError={onRedirectToLogin}
                                        />
                                        <span className="lib-thumb-fallback" aria-hidden="true">
                                            {shortFileType(file)}
                                        </span>
                                    </div>
                                    <div className="lib-tile-body">
                                        <span
                                            className={`lib-tile-storage-inline lib-tile-storage-inline--${scopeClass}`}
                                        >
                                            {getStorageScopeLabel(scope)}
                                        </span>
                                        <span
                                            className="lib-tile-name"
                                            title={file.filename}
                                        >
                                            {file.filename}
                                        </span>
                                        <span className="lib-tile-meta">
                                            by {file.uploadedBy || "Unknown"}
                                        </span>
                                        {(file.accessMode === "local_only" || file.share) && (
                                            <span className="lib-chips">
                                                {file.accessMode === "local_only" && (
                                                    <span className="lib-chip lib-chip--lan">
                                                        LAN only
                                                    </span>
                                                )}
                                                {file.share && (
                                                    <span className="lib-chip lib-chip--shared">
                                                        Shared
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {isEmptyLibrary && (
                    <div className="lib-empty-card">
                        <h3>No files yet</h3>
                        <p>
                            Upload something to start your library — it&apos;ll show up here right
                            away. You can also create cloud folders to organize files.
                        </p>
                        <button
                            type="button"
                            className="logout-btn"
                            onClick={() => onGoToUpload(null)}
                        >
                            Upload a file
                        </button>
                    </div>
                )}

                {!loading && deletedFiles.length > 0 && (
                    <div className="lib-deletion-log">
                        <p className="lib-section-title">Deletion log</p>
                        <div className="lib-deleted-grid" role="list">
                            {deletedFiles.map((file) => (
                                <button
                                    key={file.id}
                                    type="button"
                                    role="listitem"
                                    className="lib-tile lib-tile--deleted"
                                    onClick={() => setSelectedFileId(file.id)}
                                >
                                    <div className="lib-thumb">
                                        <span className="lib-thumb-fallback" aria-hidden="true">
                                            {shortFileType(file)}
                                        </span>
                                    </div>
                                    <div className="lib-tile-body">
                                        <span
                                            className="lib-tile-name"
                                            title={file.filename}
                                        >
                                            {file.filename}
                                        </span>
                                        <span className="lib-tile-meta">
                                            Deleted by {file.deletedBy || "Unknown"}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {selectedFile && (
                <div
                    className="modal-overlay file-detail-overlay"
                    onClick={closeDetail}
                    role="presentation"
                >
                    <div
                        className="modal-card file-detail-modal lib-detail-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="file-detail-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="lib-modal-top">
                            <div>
                                <h3 id="file-detail-title" className="modal-title">
                                    {selectedFile.filename}
                                </h3>
                                <p className="lib-modal-meta">
                                    {selectedFile.deleted
                                        ? `Deleted by ${selectedFile.deletedBy || "Unknown"} · ${formatUploadDate(selectedFile.deletedAt)}`
                                        : `Uploaded by ${selectedFile.uploadedBy || "Unknown"} · ${formatUploadDate(selectedFile.uploadDate)} · ${formatFileSize(selectedFile.fileSize)}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="lib-modal-close"
                                onClick={() => setSelectedFileId(null)}
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        {!selectedFile.deleted && (
                            <div className="file-detail-modal__preview lib-modal-preview">
                                {isTextFile(selectedFile) ? (
                                    <FileTextPreview
                                        file={selectedFile}
                                        onAuthError={onRedirectToLogin}
                                    />
                                ) : isDocumentPreviewFile(selectedFile) ? (
                                    <FileDocumentPreview
                                        file={selectedFile}
                                        onAuthError={onRedirectToLogin}
                                    />
                                ) : (
                                    <FileThumbnail
                                        file={selectedFile}
                                        onAuthError={onRedirectToLogin}
                                    />
                                )}
                            </div>
                        )}

                        {!selectedFile.deleted &&
                            (() => {
                                const scope = resolveStorageScope(selectedFile, {
                                    preferLocal: preferLocalLabels,
                                });
                                const scopeClass = scope === "local" ? "local" : "cloud";
                                return (
                                    <span
                                        className={`lib-modal-storage lib-modal-storage--${scopeClass}`}
                                    >
                                        ● {getStorageScopeLabel(scope)}
                                        {scope === "local" ? " · This Wi‑Fi" : " · Online"}
                                    </span>
                                );
                            })()}

                        <div className="lib-meta-grid">
                            <div className="lib-meta-item">
                                <p className="lib-meta-label">Uploader</p>
                                <p className="lib-meta-value">
                                    {selectedFile.uploadedBy || "Unknown"}
                                </p>
                            </div>
                            <div className="lib-meta-item">
                                <p className="lib-meta-label">Uploaded</p>
                                <p className="lib-meta-value">
                                    {formatUploadDate(selectedFile.uploadDate)}
                                </p>
                            </div>
                            {!selectedFile.deleted && (
                                <>
                                    <div className="lib-meta-item">
                                        <p className="lib-meta-label">Size</p>
                                        <p className="lib-meta-value">
                                            {formatFileSize(selectedFile.fileSize)}
                                        </p>
                                    </div>
                                    <div className="lib-meta-item">
                                        <p className="lib-meta-label">Type</p>
                                        <p className="lib-meta-value">
                                            {selectedFile.fileType || shortFileType(selectedFile)}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        {selectedFile.deleted ? (
                            <p className="files-muted">
                                This file was removed from storage. The log entry is kept for
                                history.
                            </p>
                        ) : (
                            <>
                                <div className="lib-access-wrap">
                                    <p className="lib-meta-label">Access</p>
                                    <select
                                        className="lib-access-select"
                                        value={selectedFile.accessMode || "private"}
                                        disabled={updatingModeId === selectedFile.id}
                                        onChange={(e) =>
                                            handleAccessModeChange(
                                                selectedFile,
                                                e.target.value
                                            )
                                        }
                                    >
                                        {ACCESS_MODES.map((mode) => (
                                            <option key={mode.value} value={mode.value}>
                                                {mode.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {isLoggedInToSlot(getFileApiSource(selectedFile)) && (
                                        <div className="lib-access-wrap">
                                            <p className="lib-meta-label">Folder</p>
                                            <select
                                                className="lib-access-select"
                                                value={
                                                    selectedFile.folderId
                                                        ? String(selectedFile.folderId)
                                                        : ""
                                                }
                                                disabled={movingId === selectedFile.id}
                                                onChange={(e) =>
                                                    handleMoveFile(
                                                        selectedFile,
                                                        e.target.value || null
                                                    )
                                                }
                                            >
                                                {moveFolderOptions.map((option) => (
                                                    <option
                                                        key={option.id || "root"}
                                                        value={option.id}
                                                    >
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                {selectedFile.accessMode === "local_only" && (
                                    <p className="files-muted file-detail-local-only-note">
                                        Local Only range:{" "}
                                        {selectedFile.localOnlyCidr ||
                                            "not set yet — switch to Local Only again on the intended Wi‑Fi"}
                                    </p>
                                )}

                                <div className="file-list-actions file-detail-actions">
                                    <button
                                        type="button"
                                        className="file-share-btn"
                                        onClick={() => setShareFile(selectedFile)}
                                        disabled={!canShareFile(selectedFile)}
                                        title={
                                            canShareFile(selectedFile)
                                                ? "Create a share link"
                                                : "Private files cannot be shared"
                                        }
                                    >
                                        Share
                                    </button>
                                    <button
                                        type="button"
                                        className="file-download-btn"
                                        onClick={() => handleDownload(selectedFile)}
                                    >
                                        Download
                                    </button>
                                    <button
                                        type="button"
                                        className="share-revoke-btn"
                                        onClick={() => handleDelete(selectedFile)}
                                        disabled={deletingId === selectedFile.id}
                                    >
                                        {deletingId === selectedFile.id
                                            ? "Deleting…"
                                            : "Delete"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {createFolderOpen && (
                <div
                    className="modal-overlay"
                    onClick={closeCreateFolderModal}
                    role="presentation"
                >
                    <div
                        className="modal-card lib-create-folder-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-folder-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 id="create-folder-title" className="modal-title">
                            New folder
                        </h3>
                        <p className="files-muted lib-create-folder-hint">
                            {currentFolder
                                ? `Create a folder inside “${currentFolder.name}”.`
                                : "Create a virtual folder in your library."}
                        </p>
                        <form onSubmit={handleCreateFolder}>
                            <label className="lib-create-folder-label" htmlFor="new-folder-name">
                                Folder name
                            </label>
                            <input
                                id="new-folder-name"
                                className="lib-access-select lib-create-folder-input"
                                type="text"
                                value={newFolderName}
                                onChange={(event) => setNewFolderName(event.target.value)}
                                placeholder="e.g. Class notes"
                                maxLength={80}
                                autoFocus
                                disabled={folderBusy}
                            />
                            {showCreateSlotPicker && (
                                <>
                                    <label
                                        className="lib-create-folder-label"
                                        htmlFor="new-folder-slot"
                                    >
                                        Location
                                    </label>
                                    <select
                                        id="new-folder-slot"
                                        className="lib-access-select"
                                        value={createFolderSlot}
                                        onChange={(event) =>
                                            setCreateFolderSlot(event.target.value)
                                        }
                                        disabled={folderBusy}
                                    >
                                        {createSlotChoices.map((choice) => (
                                            <option key={choice.value} value={choice.value}>
                                                {choice.label}
                                            </option>
                                        ))}
                                    </select>
                                </>
                            )}
                            {createFolderError && (
                                <p className="error">{createFolderError}</p>
                            )}
                            <div className="lib-create-folder-actions">
                                <button
                                    type="button"
                                    className="file-download-btn"
                                    onClick={closeCreateFolderModal}
                                    disabled={folderBusy}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="logout-btn"
                                    disabled={folderBusy}
                                >
                                    {folderBusy ? "Creating…" : "Create folder"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {shareFile && (
                <ShareFileModal
                    file={shareFile}
                    onClose={() => setShareFile(null)}
                    onShareUpdated={async () => {
                        await loadFiles();
                    }}
                />
            )}
        </section>
    );
}

export default FileLibrary;
