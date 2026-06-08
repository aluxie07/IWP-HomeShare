import { useCallback, useEffect, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import { getApiUrl, authHeaders, formatFileSize, formatUploadDate } from "../utils/api";
import { ACCESS_MODES, getAccessModeLabel } from "../utils/accessModes";

function FileUpload({ onRedirectToLogin, onGoToLibrary }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [accessMode, setAccessMode] = useState("private");

    const loadFiles = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await fetch(`${getApiUrl()}/files`, {
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
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        setStatus("");
        setIsError(false);

        if (!selectedFile) {
            setStatus("Please choose a file first.");
            setIsError(true);
            return;
        }

        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("accessMode", accessMode);

        setUploading(true);

        try {
            const res = await fetch(`${getApiUrl()}/files/upload`, {
                method: "POST",
                headers: authHeaders(),
                body: formData,
            });

            const data = await res.json();

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            if (!res.ok) {
                setStatus(data.message || "Upload failed");
                setIsError(true);
                return;
            }

            setStatus(data.message || "File uploaded successfully");
            setIsError(false);
            setSelectedFile(null);
            const input = document.getElementById("file-upload-input");
            if (input) input.value = "";
            loadFiles();
        } catch {
            setStatus("Could not reach server. Is the backend running?");
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
                    Choose a file from your computer and upload it to your HomeShare
                    library. Set an access mode to control who can reach the file.
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
                        {uploading ? "Uploading…" : "Upload"}
                    </button>
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
                    {!loadingList && files.length === 0 && (
                        <p className="files-muted">No files uploaded yet.</p>
                    )}
                    {!loadingList && files.length > 0 && (
                        <ul className="file-list">
                            {files.slice(0, 5).map((file) => (
                                <li key={file.id} className="file-list-item">
                                    <span className="file-list-name">{file.filename}</span>
                                    <span className="file-list-meta">
                                        {getAccessModeLabel(file.accessMode)} ·{" "}
                                        {formatFileSize(file.fileSize)} ·{" "}
                                        {formatUploadDate(file.uploadDate)}
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
