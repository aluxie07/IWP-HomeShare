import { useEffect, useState } from "react";
import { fileApiFetch } from "../utils/mergedLibrary";

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
    const [failed, setFailed] = useState(false);

    const showImage = isImageFile(file) && (file.fileSize || 0) <= MAX_THUMB_BYTES;

    useEffect(() => {
        if (!showImage || !file?.id) {
            setSrc("");
            setFailed(false);
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
    }, [
        file?.id,
        file?.apiSource,
        file?.sourceId,
        file?.fileType,
        file?.fileSize,
        file?.filename,
        showImage,
        onAuthError,
    ]);
    if (showImage && src && !failed) {
        return (
            <div className="file-thumb file-thumb--image">
                <img src={src} alt="" className="file-thumb__img" />
            </div>
        );
    }

    if (showImage && !failed) {
        return (
            <div className="file-thumb file-thumb--loading" aria-hidden="true">
                <span className="file-thumb__placeholder">…</span>
            </div>
        );
    }

    const label = isImageFile(file) ? "IMG" : fileExtLabel(file?.filename);
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
