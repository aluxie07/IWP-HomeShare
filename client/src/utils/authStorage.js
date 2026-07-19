const USER_KEY = "user";
const SESSION_TOKEN_KEY = "homeshare_session_token";

/**
 * Store non-secret profile for UI.
 * For Local Network Mode (HTTP API from HTTPS GitHub Pages), also keep a
 * session token — Secure cookies cannot be set/sent to http://LAN-IP.
 */
export function saveAuth(user, sessionToken = null) {
    if (!user) {
        clearAuth();
        return;
    }
    localStorage.setItem(
        USER_KEY,
        JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || "user",
        })
    );

    if (typeof sessionToken === "string" && sessionToken.trim()) {
        sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken.trim());
    }
}

export function getSessionToken() {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
}

export function clearSessionToken() {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export function getUser() {
    const stored = localStorage.getItem(USER_KEY);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

export function isLoggedIn() {
    return Boolean(getUser());
}

export function isAdmin() {
    const user = getUser();
    return user?.role === "admin";
}

export function clearAuth() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("token");
    clearSessionToken();
}
