import { useEffect, useRef } from "react";
import { isLoggedIn } from "./authStorage";

const LAST_ACTIVITY_KEY = "homeshare_last_activity";
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;

/** Only real interaction on this site resets the timer — not switching tabs back. */
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"];

export function touchSessionActivity() {
    try {
        sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch {
        // ignore
    }
}

export function clearSessionActivity() {
    try {
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
        // ignore
    }
}

function getLastActivity() {
    try {
        const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    } catch {
        return 0;
    }
}

/**
 * Logs the user out after 15 minutes with no interaction on HomeShare.
 * Time spent on other tabs/sites counts toward the timeout.
 * Returning to this tab does not reset the clock — only clicks, keys, scroll, or touch do.
 */
export function useIdleTimeout(enabled, onTimeout) {
    const onTimeoutRef = useRef(onTimeout);
    onTimeoutRef.current = onTimeout;

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }

        touchSessionActivity();

        let throttled = false;

        const expireIfIdle = () => {
            if (!isLoggedIn()) {
                return;
            }
            const last = getLastActivity();
            if (!last) {
                touchSessionActivity();
                return;
            }
            if (Date.now() - last >= IDLE_TIMEOUT_MS) {
                clearSessionActivity();
                onTimeoutRef.current?.();
            }
        };

        const onActivity = () => {
            // Ignore events while this tab is in the background
            if (document.visibilityState === "hidden") {
                return;
            }
            if (throttled) {
                return;
            }
            throttled = true;
            touchSessionActivity();
            window.setTimeout(() => {
                throttled = false;
            }, 1000);
        };

        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                // Check immediately when they return — do not treat return as activity
                expireIfIdle();
            }
        };

        ACTIVITY_EVENTS.forEach((eventName) => {
            window.addEventListener(eventName, onActivity, { passive: true });
        });
        document.addEventListener("visibilitychange", onVisibility);

        const checkTimerId = window.setInterval(expireIfIdle, CHECK_INTERVAL_MS);
        expireIfIdle();

        return () => {
            ACTIVITY_EVENTS.forEach((eventName) => {
                window.removeEventListener(eventName, onActivity);
            });
            document.removeEventListener("visibilitychange", onVisibility);
            window.clearInterval(checkTimerId);
        };
    }, [enabled]);
}

export { IDLE_TIMEOUT_MS };
