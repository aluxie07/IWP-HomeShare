import { fileApiFetch } from "./mergedLibrary";

const TEXT_MIME =
    /^(text\/|application\/(json|xml|javascript|x-javascript|typescript|x-yaml|yaml|x-sh|sql|csv|graphql|ld\+json|x-httpd-php))/i;

const TEXT_EXT =
    /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|ps1|bat|cmd|yml|yaml|toml|ini|cfg|conf|env|log|sql|graphql|vue|svelte|r|lua|swift|m|mm|pl|pm|dart)$/i;

/** Grid thumbnail: only fetch small files / first slice. */
export const MAX_TEXT_THUMB_BYTES = 64 * 1024;
/** Detail preview: larger but still capped. */
export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;
export const TEXT_THUMB_CHARS = 280;

export function isTextFile(file) {
    if (file?.fileType && TEXT_MIME.test(file.fileType)) {
        return true;
    }
    return TEXT_EXT.test(file?.filename || "");
}

export function canPreviewTextFile(file, maxBytes = MAX_TEXT_PREVIEW_BYTES) {
    return isTextFile(file) && (file.fileSize || 0) <= maxBytes * 4;
}

/**
 * Download file bytes and decode as text (UTF-8), capped at maxBytes.
 * @returns {{ text: string, truncated: boolean } | null}
 */
export async function fetchFileText(file, { maxBytes = MAX_TEXT_PREVIEW_BYTES, onAuthError } = {}) {
    if (!file?.id || !isTextFile(file)) {
        return null;
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
    const slice = buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;
    const truncated =
        buffer.byteLength > maxBytes || (file.fileSize || 0) > maxBytes;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);

    return { text, truncated };
}

export function snippetForThumbnail(text, maxChars = TEXT_THUMB_CHARS) {
    const normalized = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\t/g, "  ")
        .trimStart();
    if (normalized.length <= maxChars) {
        return normalized;
    }
    return `${normalized.slice(0, maxChars).trimEnd()}…`;
}
