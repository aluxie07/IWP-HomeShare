import {
    getCloudApiUrl,
    getDiscoveredApiUrl,
    buildApiFetchOptions,
} from "./apiDiscovery";
import {
    getActiveApiSlot,
    getApiUrlForSlot,
    getSessionToken,
    getSessionTokenForSlot,
} from "./authStorage";

const REQUEST_TIMEOUT_MS = 45000;

export function getApiUrl() {
    return getDiscoveredApiUrl();
}

/**
 * Session auth: httpOnly cookie when possible (cloud HTTPS).
 * Bearer token fallback for Local Network Mode (HTTPS site → HTTP LAN API).
 */
export function authHeaders(extra = {}) {
    const headers = { ...extra };
    const token = getSessionToken();
    if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

/** Headers for a specific API slot (cloud or local). */
export function authHeadersFor(slot, extra = {}) {
    const headers = { ...extra };
    const token = getSessionTokenForSlot(slot);
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
        return `Cannot reach the API at ${getApiUrl()}. For Local Network Mode, start the server on this PC (see Local setup) and Detect again. Otherwise confirm REACT_APP_API_URL points to your Render URL.`;
    }

    return "Could not reach server. Is the backend running?";
}

async function fetchAgainstBase(baseUrl, path, options = {}, slot = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const base = String(baseUrl || "").replace(/\/$/, "");

    try {
        const { headers: optionHeaders, signal: _ignored, ...rest } = options;
        const headers = slot
            ? authHeadersFor(slot, optionHeaders || {})
            : authHeaders(optionHeaders || {});

        const probeHints = buildApiFetchOptions(base, REQUEST_TIMEOUT_MS);
        const { signal: _probeSignal, ...fetchHints } = probeHints;

        return await fetch(`${base}${path}`, {
            ...fetchHints,
            ...rest,
            credentials: "include",
            headers,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function apiFetch(path, options = {}) {
    return fetchAgainstBase(getApiUrl(), path, options, getActiveApiSlot());
}

export async function fetchCloud(path, options = {}) {
    const base = getCloudApiUrl();
    if (!base) {
        throw new Error("Cloud API URL is not configured");
    }
    return fetchAgainstBase(base, path, options, "cloud");
}

export async function fetchLocal(path, options = {}) {
    const base = getApiUrlForSlot("local");
    if (!base) {
        throw new Error("Local API URL is not available — Detect the local server first");
    }
    return fetchAgainstBase(base, path, options, "local");
}

/** Fetch against a named slot. */
export async function fetchForSlot(slot, path, options = {}) {
    if (slot === "cloud") {
        return fetchCloud(path, options);
    }
    return fetchLocal(path, options);
}

export function getBaseUrlForSlot(slot) {
    return getApiUrlForSlot(slot);
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUploadDate(dateString) {
    return new Date(dateString).toLocaleString();
}
