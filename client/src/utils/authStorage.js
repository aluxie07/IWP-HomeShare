const USER_KEY = "user";

/** Store non-secret profile for UI only. JWT lives in an httpOnly cookie. */
export function saveAuth(user) {
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
    // Remove legacy JWT if present from older builds
    localStorage.removeItem("token");
}
