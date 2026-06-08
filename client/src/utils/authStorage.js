const TOKEN_KEY = "token";
const USER_KEY = "user";

export function saveAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
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
    return Boolean(getToken());
}

export function isAdmin() {
    const user = getUser();
    return user?.role === "admin";
}

export function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}
