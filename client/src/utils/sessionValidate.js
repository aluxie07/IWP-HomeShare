import { fetchForSlot } from "./api";
import {
    clearAuth,
    getUserForSlot,
    isLoggedIn,
    isLoggedInToSlot,
    saveAuth,
} from "./authStorage";

/**
 * Confirm each stored cloud/local user still has a valid server session.
 * Clears slots that return 401. Leaves slots alone on network errors
 * (e.g. local server offline) so Detect can still work later.
 * @returns {Promise<boolean>} whether any valid session remains
 */
export async function validateAndPruneSessions() {
    const slots = ["cloud", "local"];

    await Promise.all(
        slots.map(async (slot) => {
            if (!isLoggedInToSlot(slot)) {
                return;
            }

            try {
                const res = await fetchForSlot(slot, "/me", { cache: "no-store" });
                if (res.status === 401) {
                    clearAuth(slot);
                    return;
                }
                if (!res.ok) {
                    return;
                }
                const data = await res.json().catch(() => ({}));
                if (data.user) {
                    const existing = getUserForSlot(slot);
                    saveAuth(
                        {
                            id: data.user.id || existing?.id,
                            username: data.user.username,
                            email: data.user.email,
                            role: data.user.role || "user",
                        },
                        null,
                        slot
                    );
                }
            } catch {
                // Unreachable API — keep stored user for that slot
            }
        })
    );

    return isLoggedIn();
}
