const STORAGE_KEY = "homeshare_api_url";
const STORAGE_MODE_KEY = "homeshare_api_mode";

const CLOUD_API_URL = process.env.REACT_APP_API_URL || "";
const DEFAULT_LOCAL_URL = "http://127.0.0.1:8080";
const PROBE_TIMEOUT_MS = 2500;

let activeApiUrl = CLOUD_API_URL || DEFAULT_LOCAL_URL;
let activeMode = CLOUD_API_URL ? "cloud" : "local";

export function getStoredApiOverride() {
    return localStorage.getItem(STORAGE_KEY) || "";
}

export function getApiMode() {
    return activeMode;
}

export function getDiscoveredApiUrl() {
    return activeApiUrl;
}

export function setApiOverride(url) {
    const trimmed = String(url || "").trim().replace(/\/$/, "");
    if (trimmed) {
        localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

function setActive(url, mode) {
    activeApiUrl = url;
    activeMode = mode;
    localStorage.setItem(STORAGE_MODE_KEY, mode);
}

async function probeApi(baseUrl) {
    const normalized = String(baseUrl || "").trim().replace(/\/$/, "");
    if (!normalized) {
        return false;
    }

    try {
        const res = await fetch(`${normalized}/health`, {
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) {
            return false;
        }
        const data = await res.json();
        return data && typeof data === "object";
    } catch {
        return false;
    }
}

export async function initApiDiscovery() {
    const candidates = [];

    const override = getStoredApiOverride();
    if (override) {
        candidates.push({ url: override, mode: "manual" });
    }

    candidates.push({ url: DEFAULT_LOCAL_URL, mode: "local" });
    candidates.push({ url: "http://localhost:8080", mode: "local" });

    if (CLOUD_API_URL) {
        candidates.push({ url: CLOUD_API_URL, mode: "cloud" });
    }

    const seen = new Set();
    for (const candidate of candidates) {
        if (!candidate.url || seen.has(candidate.url)) {
            continue;
        }
        seen.add(candidate.url);

        if (await probeApi(candidate.url)) {
            setActive(candidate.url, candidate.mode);
            return { url: candidate.url, mode: candidate.mode, connected: true };
        }
    }

    const fallbackUrl = CLOUD_API_URL || DEFAULT_LOCAL_URL;
    const fallbackMode = CLOUD_API_URL ? "cloud" : "local";
    setActive(fallbackUrl, fallbackMode);

    return { url: fallbackUrl, mode: fallbackMode, connected: false };
}

export async function testAndSetApiOverride(url) {
    const normalized = String(url || "").trim().replace(/\/$/, "");
    if (!normalized) {
        throw new Error("Enter a server address, e.g. http://192.168.1.100:8080");
    }

    const ok = await probeApi(normalized);
    if (!ok) {
        throw new Error(
            "Could not reach that server. Check the address and that the local server is running."
        );
    }

    setApiOverride(normalized);
    setActive(normalized, "manual");
    return { url: normalized, mode: "manual", connected: true };
}
