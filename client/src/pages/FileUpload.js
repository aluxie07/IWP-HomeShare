import { useCallback, useEffect, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import { getApiUrl, authHeaders, formatFileSize, formatUploadDate } from "../utils/api";
import { ACCESS_MODES, getAccessModeLabel } from "../utils/accessModes";
import { getStorageScopeLabel } from "../utils/fileStorageScope";

const FIVE_GB = 5 * 1024 * 1024 * 1024;

async function uploadFileInChunks({ file, accessMode, onProgress, onRedirectToLogin }) {
    const initRes = await fetch(`${getApiUrl()}/files/upload/init`, {
        method: "POST",
        credentials: "include",
        headers: {
            ...authHeaders(),
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

            const chunkRes = await fetch(
                `${getApiUrl()}/files/upload/${uploadId}/chunks/${index}`,
                {
                    method: "PUT",
                    credentials: "include",
                    headers: {
                        ...authHeaders(),
                        "Content-Type": "application/octet-stream",
                    },
                    body: blob,
                }
            );

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

        const doneRes = await fetch(`${getApiUrl()}/files/upload/${uploadId}/complete`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders(),
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
            fetch(`${getApiUrl()}/files/upload/${uploadId}`, {
                method: "DELETE",
                credentials: "include",
                headers: authHeaders(),
            }).catch(() => {});
        }
        throw err;
    }
}

function FileUpload({ onRedirectToLogin, onGoToLibrary }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [files, setFiles] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [accessMode, setAccessMode] = useState("private");

    const loadFiles = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await fetch(`${getApiUrl()}/files`, {
                credentials: "include",
                headers: authHeaders(),
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

    const handleFileChange = (e) => {
        const file = e.target.files?.[0] || null;
        setSelectedFile(file);
        setStatus("");
        setIsError(false);
        setProgress(0);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
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
            const input = document.getElementById("file-upload-input");
            if (input) input.value = "";
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
                    Choose a file from your computer (up to 5 GB). Large files are sent in
                    chunks so uploads stay reliable.
                </p>

                <NetworkStatusIndicator compact />

                <form className="file-upload-form" onSubmit={handleUpload}>
                    <label className="file-upload-label" htmlFor="file-upload-input">
                        Select file
                    </label>
                    <input
                        id="file-upload-input"
                        type="file"
                        className="file-upload-input"
                        onChange={handleFileChange}
                    />
                    {selectedFile && (
                        <p className="file-upload-selected">
                            Selected: <strong>{selectedFile.name}</strong> (
                            {formatFileSize(selectedFile.size)})
                        </p>
                    )}
                    <label className="share-modal-label file-access-mode-label">
                        Access mode
                        <select
                            className="file-access-mode-select"
                            value={accessMode}
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
                        type="submit"
                        className="logout-btn file-upload-submit"
                        disabled={uploading || !selectedFile}
                    >
                        {uploading ? `Uploading… ${progress}%` : "Upload"}
                    </button>
                    {uploading && (
                        <div className="file-upload-progress" aria-valuenow={progress}>
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
                </form>

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
                                        {file.uploadedBy
                                            ? ` · by ${file.uploadedBy}`
                                            : ""}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}

export default FileUpload;
