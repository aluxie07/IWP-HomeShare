import { useCallback, useEffect, useRef, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import { apiFetch, formatFileSize, formatUploadDate } from "../utils/api";
import { ACCESS_MODES, getAccessModeLabel } from "../utils/accessModes";
import { getStorageScopeLabel } from "../utils/fileStorageScope";

const FIVE_GB = 5 * 1024 * 1024 * 1024;

async function uploadFileInChunks({ file, accessMode, onProgress, onRedirectToLogin }) {
    const initRes = await apiFetch("/files/upload/init", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            filename: file.name,
            fileSize: file.size,
            fileType: file.type || "application/octet-stream",
            accessMode,
        }),
    });

    if (initRes.status === 401) {
        onRedirectToLogin();
        throw new Error("UNAUTHORIZED");
    }

    const initData = await initRes.json();
    if (!initRes.ok) {
        throw new Error(initData.message || "Could not start upload");
    }

    const { uploadId, chunkSize, chunkCount } = initData;

    try {
        for (let index = 0; index < chunkCount; index += 1) {
            const start = index * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const blob = file.slice(start, end);

            const chunkRes = await apiFetch(`/files/upload/${uploadId}/chunks/${index}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/octet-stream",
                },
                body: blob,
            });

            if (chunkRes.status === 401) {
                onRedirectToLogin();
                throw new Error("UNAUTHORIZED");
            }

            const chunkData = await chunkRes.json().catch(() => ({}));
            if (!chunkRes.ok) {
                throw new Error(chunkData.message || `Chunk ${index + 1} failed`);
            }

            onProgress?.(Math.round(((index + 1) / chunkCount) * 100));
        }

        const doneRes = await apiFetch(`/files/upload/${uploadId}/complete`, {
            method: "POST",
        });

        if (doneRes.status === 401) {
            onRedirectToLogin();
            throw new Error("UNAUTHORIZED");
        }

        const doneData = await doneRes.json();
        if (!doneRes.ok) {
            throw new Error(doneData.message || "Could not finalize upload");
        }

        return doneData;
    } catch (err) {
        if (err.message !== "UNAUTHORIZED") {
            apiFetch(`/files/upload/${uploadId}`, {
                method: "DELETE",
            }).catch(() => {});
        }
        throw err;
    }
}

function FileUpload({ onRedirectToLogin, onGoToLibrary }) {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [files, setFiles] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [accessMode, setAccessMode] = useState("private");
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef(null);

    const loadFiles = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await apiFetch("/files", {
                cache: "no-store",
            });

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            const data = await res.json();
            if (res.ok) {
                setFiles(data.files || []);
            }
        } catch {
            // list is optional on this page
        } finally {
            setLoadingList(false);
        }
    }, [onRedirectToLogin]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    useEffect(() => {
        if (!modalOpen) return undefined;

        const onKeyDown = (event) => {
            if (event.key === "Escape" && !uploading) {
                setModalOpen(false);
            }
        };

        document.addEventListener("keydown", onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [modalOpen, uploading]);

    const assignFile = (file) => {
        if (!file) return;
        setSelectedFile(file);
        setStatus("");
        setIsError(false);
        setProgress(0);
    };

    const handleFileChange = (e) => {
        assignFile(e.target.files?.[0] || null);
    };

    const openModal = () => {
        setModalOpen(true);
        setStatus("");
        setIsError(false);
        setProgress(0);
    };

    const closeModal = () => {
        if (uploading) return;
        setModalOpen(false);
        setDragging(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const file = e.dataTransfer.files?.[0] || null;
        assignFile(file);
    };

    const handleUpload = async () => {
        setStatus("");
        setIsError(false);
        setProgress(0);

        if (!selectedFile) {
            setStatus("Please choose a file first.");
            setIsError(true);
            return;
        }

        if (selectedFile.size > FIVE_GB) {
            setStatus("File is too large. Maximum size is 5 GB.");
            setIsError(true);
            return;
        }

        setUploading(true);

        try {
            const data = await uploadFileInChunks({
                file: selectedFile,
                accessMode,
                onProgress: setProgress,
                onRedirectToLogin,
            });

            setStatus(data.message || "File uploaded successfully");
            setIsError(false);
            setSelectedFile(null);
            setProgress(100);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            loadFiles();
        } catch (err) {
            if (err.message === "UNAUTHORIZED") {
                return;
            }
            setStatus(err.message || "Could not reach server. Is the backend running?");
            setIsError(true);
        } finally {
            setUploading(false);
        }
    };

    return (
        <section className="dashboard-page">
            <div className="dashboard-card files-page-card">
                <h2 className="auth-title">Upload file</h2>
                <p className="files-page-intro">
                    Upload a file from your computer (up to 5 GB). Large files are sent in chunks so
                    uploads stay reliable.
                </p>

                <NetworkStatusIndicator compact />

                <button
                    type="button"
                    className="file-upload-open-btn"
                    onClick={openModal}
                >
                    Upload a file
                </button>

                {status && !modalOpen && (
                    <div className="message-area">
                        <p className={isError ? "error" : "success"}>{status}</p>
                    </div>
                )}

                <div className="files-section">
                    <div className="files-section-header">
                        <h3 className="files-section-title">Your recent uploads</h3>
                        <button type="button" className="files-link-btn" onClick={onGoToLibrary}>
                            View full library
                        </button>
                    </div>
                    {loadingList && <p className="files-muted">Loading files…</p>}
                    {!loadingList && files.filter((f) => !f.deleted).length === 0 && (
                        <p className="files-muted">No files uploaded yet.</p>
                    )}
                    {!loadingList && files.some((f) => !f.deleted) && (
                        <ul className="file-list">
                            {files
                                .filter((f) => !f.deleted)
                                .slice(0, 5)
                                .map((file) => (
                                    <li key={file.id} className="file-list-item">
                                        <span className="file-list-name">{file.filename}</span>
                                        <span className="file-list-meta">
                                            {getStorageScopeLabel(file.storageScope)} ·{" "}
                                            {getAccessModeLabel(file.accessMode)} ·{" "}
                                            {formatFileSize(file.fileSize)} ·{" "}
                                            {formatUploadDate(file.uploadDate)}
                                            {file.uploadedBy ? ` · by ${file.uploadedBy}` : ""}
                                        </span>
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>
            </div>

            {modalOpen && (
                <div
                    className="modal-overlay file-upload-modal-overlay"
                    onClick={closeModal}
                    role="presentation"
                >
                    <div
                        className="modal-card file-upload-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="file-upload-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="file-upload-modal__header">
                            <h3 id="file-upload-modal-title" className="modal-title">
                                Upload a file
                            </h3>
                            <button
                                type="button"
                                className="files-link-btn"
                                onClick={closeModal}
                                disabled={uploading}
                            >
                                Close
                            </button>
                        </div>

                        <p className="files-muted file-upload-modal__hint">
                            Drag a file into the box below, or click the box to choose one. Then
                            press Upload.
                        </p>

                        <input
                            ref={fileInputRef}
                            id="file-upload-input"
                            type="file"
                            className="file-upload-input-hidden"
                            onChange={handleFileChange}
                        />

                        <button
                            type="button"
                            className={`file-upload-dropzone ${
                                dragging ? "file-upload-dropzone--active" : ""
                            } ${selectedFile ? "file-upload-dropzone--has-file" : ""}`}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDragEnter={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            disabled={uploading}
                        >
                            {selectedFile ? (
                                <>
                                    <span className="file-upload-dropzone__title">
                                        {selectedFile.name}
                                    </span>
                                    <span className="file-upload-dropzone__meta">
                                        {formatFileSize(selectedFile.size)} · Click or drop to
                                        replace
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="file-upload-dropzone__title">
                                        Drop a file here
                                    </span>
                                    <span className="file-upload-dropzone__meta">
                                        or click to choose from your computer
                                    </span>
                                </>
                            )}
                        </button>

                        <label className="share-modal-label file-access-mode-label">
                            Access mode
                            <select
                                className="file-access-mode-select"
                                value={accessMode}
                                disabled={uploading}
                                onChange={(e) => setAccessMode(e.target.value)}
                            >
                                {ACCESS_MODES.map((mode) => (
                                    <option key={mode.value} value={mode.value}>
                                        {mode.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <p className="file-access-mode-hint">
                            {ACCESS_MODES.find((m) => m.value === accessMode)?.description}
                        </p>

                        <button
                            type="button"
                            className="logout-btn file-upload-submit"
                            onClick={handleUpload}
                            disabled={uploading || !selectedFile}
                        >
                            {uploading ? `Uploading… ${progress}%` : "Upload"}
                        </button>

                        {uploading && (
                            <div
                                className="file-upload-progress"
                                role="progressbar"
                                aria-valuenow={progress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            >
                                <div
                                    className="file-upload-progress__bar"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}

                        <div className="message-area">
                            {status && (
                                <p className={isError ? "error" : "success"}>{status}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

export default FileUpload;
