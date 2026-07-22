import { getApiMode, getCloudApiUrl, getDiscoveredApiUrl } from "./apiDiscovery";

const LEGACY_USER_KEY = "user";
const LEGACY_TOKEN_KEY = "homeshare_session_token";

const CLOUD_USER_KEY = "homeshare_cloud_user";
const CLOUD_TOKEN_KEY = "homeshare_cloud_token";
const LOCAL_USER_KEY = "homeshare_local_user";
const LOCAL_TOKEN_KEY = "homeshare_local_token";
const LOCAL_API_URL_KEY = "homeshare_local_api_url";

/** @typedef {'cloud' | 'local'} ApiSlot */

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function readUser(key) {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

function writeUser(key, user) {
    localStorage.setItem(
        key,
        JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || "user",
        })
    );
}

/**
 * Active API slot: cloud vs local/manual LAN.
 */
export function getActiveApiSlot() {
    const mode = getApiMode();
    return mode === "cloud" ? "cloud" : "local";
}

export function isLocalApiSlot(slot = getActiveApiSlot()) {
    return slot === "local";
}

export function getStoredLocalApiUrl() {
    return (localStorage.getItem(LOCAL_API_URL_KEY) || "").replace(/\/$/, "");
}

export function setStoredLocalApiUrl(url) {
    const trimmed = String(url || "").trim().replace(/\/$/, "");
    if (trimmed) {
        localStorage.setItem(LOCAL_API_URL_KEY, trimmed);
    } else {
        localStorage.removeItem(LOCAL_API_URL_KEY);
    }
}

/** Resolve base URL for a slot (even when that slot is not active). */
export function getApiUrlForSlot(slot) {
    if (slot === "cloud") {
        return (getCloudApiUrl() || "").replace(/\/$/, "");
    }

    const mode = getApiMode();
    // When Local/Detect is active, always use the same URL as uploads (getApiUrl).
    // Preferring a stale homeshare_local_api_url caused "Failed to fetch" in Library
    // right after a successful local upload.
    if (mode === "local" || mode === "manual") {
        const active = (getDiscoveredApiUrl() || "").replace(/\/$/, "");
        if (active) {
            setStoredLocalApiUrl(active);
            return active;
        }
    }

    const stored = getStoredLocalApiUrl();
    if (stored) {
        return stored;
    }

    return "http://127.0.0.1:8080";
}

function migrateLegacyAuthIfNeeded() {
    const legacyUser = readUser(LEGACY_USER_KEY);
    if (!legacyUser) {
        return;
    }

    const slot = getActiveApiSlot();
    const targetUserKey = slot === "cloud" ? CLOUD_USER_KEY : LOCAL_USER_KEY;
    if (!localStorage.getItem(targetUserKey)) {
        writeUser(targetUserKey, legacyUser);
    }

    const legacyToken = sessionStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacyToken) {
        const targetTokenKey = slot === "cloud" ? CLOUD_TOKEN_KEY : LOCAL_TOKEN_KEY;
        if (!sessionStorage.getItem(targetTokenKey)) {
            sessionStorage.setItem(targetTokenKey, legacyToken);
        }
    }

    localStorage.removeItem(LEGACY_USER_KEY);
    localStorage.removeItem("token");
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
}

migrateLegacyAuthIfNeeded();

/**
 * Save auth into the slot for the API you just logged into.
 * @param {object} user
 * @param {string|null} sessionToken
 * @param {ApiSlot} [slot] defaults to active API slot
 */
export function saveAuth(user, sessionToken = null, slot = getActiveApiSlot()) {
    if (!user) {
        clearAuth(slot);
        return;
    }

    const userKey = slot === "cloud" ? CLOUD_USER_KEY : LOCAL_USER_KEY;
    const tokenKey = slot === "cloud" ? CLOUD_TOKEN_KEY : LOCAL_TOKEN_KEY;

    writeUser(userKey, user);

    // Keep legacy key in sync for active slot (older helpers / UI)
    if (slot === getActiveApiSlot()) {
        writeUser(LEGACY_USER_KEY, user);
    }

    if (typeof sessionToken === "string" && sessionToken.trim()) {
        sessionStorage.setItem(tokenKey, sessionToken.trim());
        if (slot === "local" || slot === getActiveApiSlot()) {
            sessionStorage.setItem(LEGACY_TOKEN_KEY, sessionToken.trim());
        }
    }

    if (slot === "local") {
        const url = getDiscoveredApiUrl();
        if (url && (getApiMode() === "local" || getApiMode() === "manual")) {
            setStoredLocalApiUrl(url);
        }
    }
}

export function getUserForSlot(slot) {
    migrateLegacyAuthIfNeeded();
    const key = slot === "cloud" ? CLOUD_USER_KEY : LOCAL_USER_KEY;
    return readUser(key);
}

export function getSessionTokenForSlot(slot) {
    migrateLegacyAuthIfNeeded();
    const key = slot === "cloud" ? CLOUD_TOKEN_KEY : LOCAL_TOKEN_KEY;
    return sessionStorage.getItem(key) || "";
}

/** Active-slot user (header / dashboard). */
export function getUser() {
    return getUserForSlot(getActiveApiSlot());
}

/**
 * Bearer token for the active API only.
 * Never fall back to the other mode's token — cloud JWTs are rejected by the local server (401).
 */
export function getSessionToken() {
    return getSessionTokenForSlot(getActiveApiSlot());
}

export function clearSessionToken() {
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(CLOUD_TOKEN_KEY);
    sessionStorage.removeItem(LOCAL_TOKEN_KEY);
}

/** True if any cloud or local session exists (for dual-library linking). */
export function isLoggedIn() {
    return Boolean(getUserForSlot("cloud") || getUserForSlot("local"));
}

export function isLoggedInToSlot(slot) {
    return Boolean(getUserForSlot(slot));
}

/** True if signed in for the API mode currently in use (cloud vs local). */
export function isLoggedInToActiveApi() {
    return isLoggedInToSlot(getActiveApiSlot());
}

export function isAdmin() {
    const user = getUser();
    return user?.role === "admin";
}

/**
 * Clear one slot (default: active). Pass 'both' to clear cloud + local.
 * @param {ApiSlot | 'both'} [slot]
 */
export function clearAuth(slot = getActiveApiSlot()) {
    if (slot === "both") {
        localStorage.removeItem(CLOUD_USER_KEY);
        localStorage.removeItem(LOCAL_USER_KEY);
        sessionStorage.removeItem(CLOUD_TOKEN_KEY);
        sessionStorage.removeItem(LOCAL_TOKEN_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
        localStorage.removeItem("token");
        sessionStorage.removeItem(LEGACY_TOKEN_KEY);
        return;
    }

    if (slot === "cloud") {
        localStorage.removeItem(CLOUD_USER_KEY);
        sessionStorage.removeItem(CLOUD_TOKEN_KEY);
    } else {
        localStorage.removeItem(LOCAL_USER_KEY);
        sessionStorage.removeItem(LOCAL_TOKEN_KEY);
    }

    // Refresh legacy mirrors from remaining active slot user
    const active = getActiveApiSlot();
    const remaining = getUserForSlot(active);
    if (remaining) {
        writeUser(LEGACY_USER_KEY, remaining);
        const token = getSessionTokenForSlot(active);
        if (token) {
            sessionStorage.setItem(LEGACY_TOKEN_KEY, token);
        } else {
            sessionStorage.removeItem(LEGACY_TOKEN_KEY);
        }
    } else {
        localStorage.removeItem(LEGACY_USER_KEY);
        localStorage.removeItem("token");
        sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    }
}

/** True when both slots exist and emails match (case-insensitive). */
export function canMergeLibraries() {
    const cloud = getUserForSlot("cloud");
    const local = getUserForSlot("local");
    if (!cloud?.email || !local?.email) {
        return false;
    }
    return normalizeEmail(cloud.email) === normalizeEmail(local.email);
}

export function getLibraryLinkStatus() {
    const cloud = getUserForSlot("cloud");
    const local = getUserForSlot("local");
    const cloudEmail = normalizeEmail(cloud?.email);
    const localEmail = normalizeEmail(local?.email);

    if (cloud && local && cloudEmail && cloudEmail === localEmail) {
        return { linked: true, reason: "matched" };
    }
    if (cloud && local && cloudEmail !== localEmail) {
        return {
            linked: false,
            reason: "email_mismatch",
            message:
                "Cloud and local are signed in with different emails — libraries are not merged. Use the same email on both.",
        };
    }
    if (cloud && !local) {
        return {
            linked: false,
            reason: "missing_local",
            message:
                "Local library not linked — Detect the local server and log in with the same email to see both libraries.",
        };
    }
    if (local && !cloud) {
        return {
            linked: false,
            reason: "missing_cloud",
            message:
                "Cloud library not linked — Exit local (or switch to cloud) and log in with the same email to see both libraries.",
        };
    }
    return { linked: false, reason: "none", message: "" };
}

export { normalizeEmail };
