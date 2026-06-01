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

export function consumePendingShare() {
    const token = sessionStorage.getItem("pendingShare");
    if (token) {
        sessionStorage.removeItem("pendingShare");
    }
    return token;
}
