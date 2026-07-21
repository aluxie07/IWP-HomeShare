import { useEffect, useState } from "react";
import { fileApiFetch } from "../utils/mergedLibrary";
import {
    MAX_TEXT_THUMB_BYTES,
    TEXT_THUMB_CHARS,
    fetchFileText,
    isTextFile,
    snippetForThumbnail,
} from "../utils/textFilePreview";
import {
    MAX_DOC_THUMB_BYTES,
    extractDocxThumbnailText,
    fetchFileBuffer,
    isDocxFile,
    isPdfFile,
    renderPdfThumbnail,
} from "../utils/documentPreview";

const IMAGE_TYPES = /^(image\/(jpeg|jpg|png|gif|webp|bmp|svg\+xml))$/i;
const MAX_THUMB_BYTES = 8 * 1024 * 1024;

function isImageFile(file) {
    if (file?.fileType && IMAGE_TYPES.test(file.fileType)) {
        return true;
    }
    return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file?.filename || "");
}

function FileThumbnail({ file, onAuthError }) {
    const [src, setSrc] = useState("");
    const [textSnippet, setTextSnippet] = useState("");
    const [failed, setFailed] = useState(false);

    const showImage = isImageFile(file) && (file.fileSize || 0) <= MAX_THUMB_BYTES;
    const showText =
        !showImage &&
        isTextFile(file) &&
        (file.fileSize || 0) <= MAX_TEXT_THUMB_BYTES * 8;
    const showPdf =
        !showImage &&
        !showText &&
        isPdfFile(file) &&
        (file.fileSize || 0) <= MAX_DOC_THUMB_BYTES;
    const showDocx =
        !showImage &&
        !showText &&
        !showPdf &&
        isDocxFile(file) &&
        (file.fileSize || 0) <= MAX_DOC_THUMB_BYTES;

    const showRich = showImage || showText || showPdf || showDocx;

    useEffect(() => {
        if (!showImage || !file?.id) {
            if (!showPdf) {
                setSrc("");
            }
            if (!showRich) {
                setFailed(false);
            }
            return undefined;
        }

        let cancelled = false;
        let objectUrl = "";

        (async () => {
            try {
                const res = await fileApiFetch(file, "/download");

                if (res.status === 401) {
                    onAuthError?.();
                    return;
                }

                if (!res.ok) {
                    if (!cancelled) {
                        setFailed(true);
                    }
                    return;
                }

                const blob = await res.blob();
                if (cancelled) {
                    return;
                }

                objectUrl = URL.createObjectURL(blob);
                setSrc(objectUrl);
                setFailed(false);
            } catch {
                if (!cancelled) {
                    setFailed(true);
                }
            }
        })();

        return () => {
            cancelled = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [file, showImage, showPdf, showRich, onAuthError]);

    useEffect(() => {
        if (!showText || !file?.id) {
            if (!showDocx) {
                setTextSnippet("");
            }
            return undefined;
        }

        let cancelled = false;

        (async () => {
            try {
                const result = await fetchFileText(file, {
                    maxBytes: MAX_TEXT_THUMB_BYTES,
                    onAuthError,
                });
                if (cancelled) {
                    return;
                }
                if (!result?.text) {
                    setFailed(true);
                    return;
                }
                setTextSnippet(snippetForThumbnail(result.text, TEXT_THUMB_CHARS));
                setFailed(false);
            } catch {
                if (!cancelled) {
                    setFailed(true);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [file, showText, showDocx, onAuthError]);

    useEffect(() => {
        if (!showPdf || !file?.id) {
            return undefined;
        }

        let cancelled = false;

        (async () => {
            try {
                const buffer = await fetchFileBuffer(file, {
                    maxBytes: MAX_DOC_THUMB_BYTES,
                    onAuthError,
                });
                if (cancelled || !buffer) {
                    if (!cancelled) {
                        setFailed(true);
                    }
                    return;
                }
                const dataUrl = await renderPdfThumbnail(buffer);
                if (cancelled) {
                    return;
                }
                setSrc(dataUrl);
                setFailed(false);
            } catch {
                if (!cancelled) {
                    setFailed(true);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [file, showPdf, onAuthError]);

    useEffect(() => {
        if (!showDocx || !file?.id) {
            return undefined;
        }

        let cancelled = false;

        (async () => {
            try {
                const buffer = await fetchFileBuffer(file, {
                    maxBytes: MAX_DOC_THUMB_BYTES,
                    onAuthError,
                });
                if (cancelled || !buffer) {
                    if (!cancelled) {
                        setFailed(true);
                    }
                    return;
                }
                const snippet = await extractDocxThumbnailText(buffer);
                if (cancelled) {
                    return;
                }
                if (!snippet) {
                    setFailed(true);
                    return;
                }
                setTextSnippet(snippet);
                setFailed(false);
            } catch {
                if (!cancelled) {
                    setFailed(true);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [file, showDocx, onAuthError]);

    if ((showImage || showPdf) && src && !failed) {
        return (
            <div
                className={`file-thumb file-thumb--image${
                    showPdf ? " file-thumb--pdf" : ""
                }`}
            >
                <img src={src} alt="" className="file-thumb__img" />
            </div>
        );
    }

    if ((showText || showDocx) && textSnippet && !failed) {
        return (
            <div
                className={`file-thumb file-thumb--text${
                    showDocx ? " file-thumb--docx" : ""
                }`}
                aria-hidden="true"
            >
                <pre className="file-thumb__text">{textSnippet}</pre>
            </div>
        );
    }

    if (showRich && !failed) {
        return (
            <div className="file-thumb file-thumb--loading" aria-hidden="true">
                <span className="file-thumb__placeholder">…</span>
            </div>
        );
    }

    const label = isImageFile(file)
        ? "IMG"
        : isPdfFile(file)
          ? "PDF"
          : isDocxFile(file)
            ? "DOCX"
            : isTextFile(file)
              ? "TXT"
              : fileExtLabel(file?.filename);
    return (
        <div className="file-thumb file-thumb--icon" aria-hidden="true">
            <span className="file-thumb__placeholder">{label}</span>
        </div>
    );
}

function fileExtLabel(filename) {
    const ext = String(filename || "")
        .split(".")
        .pop()
        ?.toUpperCase();
    if (!ext || ext.length > 4 || ext === String(filename || "").toUpperCase()) {
        return "FILE";
    }
    return ext;
}

export default FileThumbnail;
export { isImageFile };
