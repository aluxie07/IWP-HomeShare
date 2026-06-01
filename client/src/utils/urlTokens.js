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

export function clearUrlSearchParams() {
    window.history.replaceState({}, "", window.location.pathname);
}
