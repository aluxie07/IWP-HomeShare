export function getVerifyTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("verify");
    return token ? token.trim() : null;
}

export function getResetTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset");
    return token ? token.trim() : null;
}

export function getShareTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("share");
    return token ? token.trim() : null;
}

export function buildShareLink(shareToken) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?share=${encodeURIComponent(shareToken)}`;
}

export function clearUrlSearchParams() {
    window.history.replaceState({}, "", window.location.pathname);
}

const PENDING_SHARE_KEY = "pendingShare";

export function setPendingShare(token) {
    if (typeof token === "string" && token.trim()) {
        sessionStorage.setItem(PENDING_SHARE_KEY, token.trim());
    }
}

export function peekPendingShare() {
    return sessionStorage.getItem(PENDING_SHARE_KEY) || null;
}

export function consumePendingShare() {
    const token = sessionStorage.getItem(PENDING_SHARE_KEY);
    if (token) {
        sessionStorage.removeItem(PENDING_SHARE_KEY);
    }
    return token;
}

export function clearPendingShare() {
    sessionStorage.removeItem(PENDING_SHARE_KEY);
}

/** Keep ?share= in the address bar so refresh / login return to the same link. */
export function ensureShareInUrl(shareToken) {
    if (!shareToken) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("share") === shareToken) return;
    params.set("share", shareToken);
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
}
