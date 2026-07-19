import { getDiscoveredApiUrl } from "./apiDiscovery";
import { getSessionToken } from "./authStorage";

const REQUEST_TIMEOUT_MS = 45000;

export function getApiUrl() {
    return getDiscoveredApiUrl();
}

/**
 * Session auth: httpOnly cookie when possible (cloud HTTPS).
 * Bearer token fallback for Local Network Mode (HTTPS site → HTTP LAN API),
 * because Secure cookies cannot attach to http://192.168.x.x.
 */
export function authHeaders(extra = {}) {
    const headers = { ...extra };
    const token = getSessionToken();
    if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

export function getNetworkErrorMessage(err) {
    if (err?.name === "AbortError") {
        return (
            "Request timed out. On Render free tier the server may be waking up—wait 30 seconds and try again."
        );
    }

    if (err instanceof TypeError) {
        return `Cannot reach the API at ${getApiUrl()}. If using Local Network Mode, run the local server starter and refresh. Otherwise confirm REACT_APP_API_URL points to your Render URL.`;
    }

    return "Could not reach server. Is the backend running?";
}

export async function apiFetch(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const { headers: optionHeaders, ...rest } = options;
        return await fetch(`${getApiUrl()}${path}`, {
            ...rest,
            credentials: "include",
            headers: authHeaders(optionHeaders || {}),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUploadDate(dateString) {
    return new Date(dateString).toLocaleString();
}
