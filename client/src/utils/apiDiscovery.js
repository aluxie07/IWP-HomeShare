const STORAGE_KEY = "homeshare_api_url";
const STORAGE_MODE_KEY = "homeshare_api_mode";

const CLOUD_API_URL = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const DEFAULT_LOCAL_URL = "http://127.0.0.1:8080";
const LOCAL_CANDIDATES = [
    "http://127.0.0.1:8080",
    "http://localhost:8080",
];
const PROBE_TIMEOUT_MS = 2500;

let activeApiUrl = CLOUD_API_URL || DEFAULT_LOCAL_URL;
let activeMode = CLOUD_API_URL ? "cloud" : "local";

function isLoopbackUrl(url) {
    try {
        const host = new URL(url).hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "::1";
    } catch {
        return false;
    }
}

function isHttpsPage() {
    return typeof window !== "undefined" && window.location.protocol === "https:";
}

export function getStoredApiOverride() {
    return localStorage.getItem(STORAGE_KEY) || "";
}

export function getApiMode() {
    return activeMode;
}

export function getDiscoveredApiUrl() {
    return activeApiUrl;
}

export function getCloudApiUrl() {
    return CLOUD_API_URL;
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

/**
 * Probe a base URL. For loopback from HTTPS (GitHub Pages), hint Chrome
 * Private Network Access with targetAddressSpace: "local".
 */
async function probeApi(baseUrl) {
    const normalized = String(baseUrl || "").trim().replace(/\/$/, "");
    if (!normalized) {
        return false;
    }

    const options = {
        mode: "cors",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    };

    if (isLoopbackUrl(normalized) && isHttpsPage()) {
        // Chrome PNA: public HTTPS → local loopback
        options.targetAddressSpace = "local";
    } else if (!isLoopbackUrl(normalized) && isHttpsPage()) {
        try {
            const host = new URL(normalized).hostname;
            if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
                options.targetAddressSpace = "private";
            }
        } catch {
            // ignore
        }
    }

    try {
        const res = await fetch(`${normalized}/health`, options);
        if (!res.ok) {
            return false;
        }
        const data = await res.json();
        return data && typeof data === "object";
    } catch {
        return false;
    }
}

/**
 * Prefer cloud on the live HTTPS site so normal login works without a local server.
 * Saved overrides (including localhost after Detect) are still tried.
 */
export async function initApiDiscovery() {
    const override = getStoredApiOverride();
    const onHttps = isHttpsPage();

    if (override) {
        if (await probeApi(override)) {
            const mode = isLoopbackUrl(override) ? "local" : "manual";
            setActive(override, mode);
            return { url: override, mode, connected: true };
        }
        // Stale preference (local server closed, etc.)
        setApiOverride("");
    }

    // Live GitHub Pages: stay on cloud unless the user clicks Detect
    if (onHttps) {
        if (CLOUD_API_URL) {
            const ok = await probeApi(CLOUD_API_URL);
            setActive(CLOUD_API_URL, "cloud");
            return { url: CLOUD_API_URL, mode: "cloud", connected: ok };
        }
        setActive(DEFAULT_LOCAL_URL, "local");
        return {
            url: DEFAULT_LOCAL_URL,
            mode: "local",
            connected: false,
            error: "REACT_APP_API_URL is not set for this build",
        };
    }

    // Local React dev (http://localhost:3000): try local server, then cloud
    const candidates = [
        { url: DEFAULT_LOCAL_URL, mode: "local" },
        { url: "http://localhost:8080", mode: "local" },
    ];
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

/**
 * Explicit Detect on Local Network setup — probes localhost even from GitHub Pages.
 */
export async function detectLocalServer() {
    const seen = new Set();
    for (const url of LOCAL_CANDIDATES) {
        if (seen.has(url)) {
            continue;
        }
        seen.add(url);
        if (await probeApi(url)) {
            setApiOverride(url);
            setActive(url, "local");
            return { url, mode: "local", connected: true };
        }
    }

    if (CLOUD_API_URL) {
        const ok = await probeApi(CLOUD_API_URL);
        setActive(CLOUD_API_URL, "cloud");
        return { url: CLOUD_API_URL, mode: "cloud", connected: ok };
    }

    setActive(DEFAULT_LOCAL_URL, "local");
    return { url: DEFAULT_LOCAL_URL, mode: "local", connected: false };
}

/** Force cloud API (e.g. user wants to log in without local server). */
export async function switchToCloudApi() {
    setApiOverride("");
    if (!CLOUD_API_URL) {
        throw new Error(
            "Cloud API URL is not configured for this site (REACT_APP_API_URL)."
        );
    }
    const ok = await probeApi(CLOUD_API_URL);
    setActive(CLOUD_API_URL, "cloud");
    return { url: CLOUD_API_URL, mode: "cloud", connected: ok };
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
    setActive(normalized, isLoopbackUrl(normalized) ? "local" : "manual");
    return {
        url: normalized,
        mode: isLoopbackUrl(normalized) ? "local" : "manual",
        connected: true,
    };
}
