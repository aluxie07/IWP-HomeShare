import { useEffect, useState } from "react";
import { formatFileSize } from "../utils/api";
import {
    MAX_DOC_PREVIEW_BYTES,
    convertDocxToHtml,
    createPdfObjectUrl,
    fetchFileBuffer,
    isDocxFile,
    isPdfFile,
} from "../utils/documentPreview";

function FileDocumentPreview({ file, onAuthError }) {
    const [pdfUrl, setPdfUrl] = useState("");
    const [html, setHtml] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const isPdf = isPdfFile(file);
    const isDocx = isDocxFile(file);

    useEffect(() => {
        if (!file?.id || (!isPdf && !isDocx)) {
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        let objectUrl = "";
        setLoading(true);
        setError("");
        setPdfUrl("");
        setHtml("");

        (async () => {
            try {
                const buffer = await fetchFileBuffer(file, {
                    maxBytes: MAX_DOC_PREVIEW_BYTES,
                    onAuthError,
                });
                if (cancelled || !buffer) {
                    if (!cancelled && !buffer) {
                        setError("Could not load preview");
                    }
                    return;
                }

                if (isPdf) {
                    objectUrl = createPdfObjectUrl(buffer);
                    if (cancelled) {
                        URL.revokeObjectURL(objectUrl);
                        objectUrl = "";
                        return;
                    }
                    setPdfUrl(objectUrl);
                } else {
                    const converted = await convertDocxToHtml(buffer);
                    if (!cancelled) {
                        setHtml(converted || "<p><em>No preview content.</em></p>");
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.message || "Could not load preview");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [file, isPdf, isDocx, onAuthError]);

    if (loading) {
        return (
            <div className="file-doc-preview file-doc-preview--loading">
                <p className="files-muted">Loading preview…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="file-doc-preview file-doc-preview--error">
                <p className="files-muted">{error}</p>
            </div>
        );
    }

    if (isPdf && pdfUrl) {
        return (
            <div className="file-doc-preview file-doc-preview--pdf">
                <iframe
                    className="file-doc-preview__pdf"
                    title={`Preview of ${file.filename}`}
                    src={pdfUrl}
                />
                <p className="file-doc-preview__note">
                    Scroll inside the preview to browse pages. Files larger than{" "}
                    {formatFileSize(MAX_DOC_PREVIEW_BYTES)} need a download.
                </p>
            </div>
        );
    }

    if (isDocx && html) {
        return (
            <div className="file-doc-preview file-doc-preview--docx">
                <div
                    className="file-doc-preview__scroll"
                    tabIndex={0}
                    // mammoth strips scripts; HTML is generated from the DOCX only
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            </div>
        );
    }

    return null;
}

export default FileDocumentPreview;
