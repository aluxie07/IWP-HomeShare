import { useEffect, useState } from "react";
import {
    MAX_TEXT_PREVIEW_BYTES,
    fetchFileText,
    isTextFile,
} from "../utils/textFilePreview";
import { formatFileSize } from "../utils/api";

function FileTextPreview({ file, onAuthError }) {
    const [text, setText] = useState("");
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!file?.id || !isTextFile(file)) {
            setText("");
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        setError("");
        setText("");
        setTruncated(false);

        (async () => {
            try {
                const result = await fetchFileText(file, {
                    maxBytes: MAX_TEXT_PREVIEW_BYTES,
                    onAuthError,
                });
                if (cancelled) {
                    return;
                }
                if (!result) {
                    setError("Could not load preview");
                    return;
                }
                setText(result.text);
                setTruncated(result.truncated);
            } catch {
                if (!cancelled) {
                    setError("Could not load preview");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [file, onAuthError]);

    if (loading) {
        return (
            <div className="file-text-preview file-text-preview--loading">
                <p className="files-muted">Loading preview…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="file-text-preview file-text-preview--error">
                <p className="files-muted">{error}</p>
            </div>
        );
    }

    return (
        <div className="file-text-preview">
            <div className="file-text-preview__scroll" tabIndex={0}>
                <pre className="file-text-preview__body">{text}</pre>
            </div>
            {truncated && (
                <p className="file-text-preview__note">
                    Showing the first {formatFileSize(MAX_TEXT_PREVIEW_BYTES)} of this
                    file. Download for the full contents.
                </p>
            )}
        </div>
    );
}

export default FileTextPreview;
