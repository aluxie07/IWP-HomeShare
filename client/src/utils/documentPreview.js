import { fileApiFetch } from "./mergedLibrary";
import { snippetForThumbnail, TEXT_THUMB_CHARS } from "./textFilePreview";

export const MAX_DOC_PREVIEW_BYTES = 20 * 1024 * 1024;
export const MAX_DOC_THUMB_BYTES = 12 * 1024 * 1024;

const PDF_MIME = /^application\/pdf$/i;

let pdfjsModulePromise = null;

async function loadPdfjs() {
    if (!pdfjsModulePromise) {
        pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then(
            (pdfjs) => {
                const version = pdfjs.version || "4.10.38";
                pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/legacy/build/pdf.worker.min.mjs`;
                return pdfjs;
            }
        );
    }
    return pdfjsModulePromise;
}

export function isPdfFile(file) {
    if (file?.fileType && PDF_MIME.test(file.fileType)) {
        return true;
    }
    return /\.pdf$/i.test(file?.filename || "");
}

export function isDocxFile(file) {
    const name = file?.filename || "";
    if (/\.docx$/i.test(name)) {
        return true;
    }
    if (file?.fileType && /wordprocessingml\.document/i.test(file.fileType)) {
        return true;
    }
    return false;
}

export function isDocumentPreviewFile(file) {
    return isPdfFile(file) || isDocxFile(file);
}

export async function fetchFileBuffer(
    file,
    { maxBytes = MAX_DOC_PREVIEW_BYTES, onAuthError } = {}
) {
    if (!file?.id) {
        return null;
    }

    if ((file.fileSize || 0) > maxBytes) {
        const err = new Error(
            `File is too large to preview (max ${Math.round(maxBytes / (1024 * 1024))} MB). Download instead.`
        );
        err.code = "TOO_LARGE";
        throw err;
    }

    const res = await fileApiFetch(file, "/download");

    if (res.status === 401) {
        onAuthError?.();
        return null;
    }

    if (!res.ok) {
        throw new Error("Could not load preview");
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
        const err = new Error(
            `File is too large to preview (max ${Math.round(maxBytes / (1024 * 1024))} MB). Download instead.`
        );
        err.code = "TOO_LARGE";
        throw err;
    }

    return buffer;
}

/** Render PDF page 1 to a JPEG data URL for grid thumbnails. */
export async function renderPdfThumbnail(arrayBuffer, { maxWidth = 160 } = {}) {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
        .promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.25, maxWidth / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.75);
}

export async function extractDocxThumbnailText(arrayBuffer) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer });
    return snippetForThumbnail(result.value || "", TEXT_THUMB_CHARS);
}

export async function convertDocxToHtml(arrayBuffer) {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value || "";
}

export function createPdfObjectUrl(arrayBuffer) {
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    return URL.createObjectURL(blob);
}
