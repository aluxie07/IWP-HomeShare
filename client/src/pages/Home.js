import { useEffect, useLayoutEffect, useRef, useState } from "react";

const HOME_STEPS = [
    { num: "1", label: "Register" },
    { num: "2", label: "Pick a mode" },
    { num: "3", label: "Share" },
];

/** Panels start after hero finishes; keep gaps short. */
const SPLIT_DELAY_MS = 680;
const SPLIT_DURATION_MS = 400;
const OUTLINE_START_MS = SPLIT_DELAY_MS + SPLIT_DURATION_MS + 40;
const OUTLINE_DURATION_MS = 504;
const STEPS_START_MS = OUTLINE_START_MS + OUTLINE_DURATION_MS;
const TYPE_MS = 30;
const STEP_PAUSE_MS = 140;

function prefersReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) {
        return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Rounded-rect outline path starting at bottom-left, going clockwise. */
function roundedRectPath(width, height, radius, inset = 0.75) {
    const w = Math.max(0, width - inset * 2);
    const h = Math.max(0, height - inset * 2);
    const r = Math.min(radius, w / 2, h / 2);
    const x = inset;
    const y = inset;
    return [
        `M ${x + r} ${y + h}`,
        `L ${x + w - r} ${y + h}`,
        `A ${r} ${r} 0 0 0 ${x + w} ${y + h - r}`,
        `L ${x + w} ${y + r}`,
        `A ${r} ${r} 0 0 0 ${x + w - r} ${y}`,
        `L ${x + r} ${y}`,
        `A ${r} ${r} 0 0 0 ${x} ${y + r}`,
        `L ${x} ${y + h - r}`,
        `A ${r} ${r} 0 0 0 ${x + r} ${y + h}`,
        "Z",
    ].join(" ");
}

function CloudIcon() {
    return (
        <svg className="home-split__icon" viewBox="0 0 48 48" aria-hidden="true">
            <path
                fill="currentColor"
                d="M38.5 20.2A12.5 12.5 0 0 0 15.2 16 9.5 9.5 0 0 0 16 35h21.5A8.5 8.5 0 0 0 38.5 20.2Z"
            />
        </svg>
    );
}

function RouterIcon() {
    return (
        <svg className="home-split__icon" viewBox="0 0 48 48" aria-hidden="true">
            <path
                fill="currentColor"
                d="M10 30h28a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm4 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8.5-14.2a1.5 1.5 0 0 1 0-3 8 8 0 0 1 0 16 1.5 1.5 0 0 1 0-3 5 5 0 0 0 0-10Zm0-6.5a1.5 1.5 0 0 1 0-3 14.5 14.5 0 0 1 0 29 1.5 1.5 0 1 1 0-3 11.5 11.5 0 0 0 0-23Z"
            />
        </svg>
    );
}

function Home({
    onGetStarted,
    onLocalNetworkSetup,
    onGoToDashboard,
    onOpenHelp,
    showGetStarted,
    showLocalWifi,
}) {
    const [splitReady, setSplitReady] = useState(() => prefersReducedMotion());
    const [outlineActive, setOutlineActive] = useState(() => prefersReducedMotion());
    const [stepIndex, setStepIndex] = useState(-1);
    const [typedLabels, setTypedLabels] = useState(["", "", ""]);
    const [stepsDone, setStepsDone] = useState(() => prefersReducedMotion());
    const stepsStripRef = useRef(null);
    const [outlinePath, setOutlinePath] = useState("");
    const [outlineSize, setOutlineSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!showGetStarted) {
            return undefined;
        }

        const el = stepsStripRef.current;
        if (!el) {
            return undefined;
        }

        const updatePath = () => {
            const { width, height } = el.getBoundingClientRect();
            if (width < 1 || height < 1) {
                return;
            }
            setOutlineSize({ width, height });
            setOutlinePath(roundedRectPath(width, height, 12));
        };

        updatePath();
        const observer = new ResizeObserver(updatePath);
        observer.observe(el);
        return () => observer.disconnect();
    }, [showGetStarted]);

    useEffect(() => {
        if (prefersReducedMotion()) {
            setSplitReady(true);
            return undefined;
        }

        const readyTimer = window.setTimeout(() => {
            setSplitReady(true);
        }, SPLIT_DELAY_MS + SPLIT_DURATION_MS);

        return () => window.clearTimeout(readyTimer);
    }, []);

    useEffect(() => {
        if (!showGetStarted) {
            return undefined;
        }

        if (prefersReducedMotion()) {
            setOutlineActive(true);
            setTypedLabels(HOME_STEPS.map((step) => step.label));
            setStepIndex(HOME_STEPS.length);
            setStepsDone(true);
            return undefined;
        }

        setOutlineActive(false);
        setStepIndex(-1);
        setTypedLabels(["", "", ""]);
        setStepsDone(false);

        const outlineTimer = window.setTimeout(() => {
            setOutlineActive(true);
        }, OUTLINE_START_MS);

        const startTimer = window.setTimeout(() => {
            setStepIndex(0);
        }, STEPS_START_MS);

        return () => {
            window.clearTimeout(outlineTimer);
            window.clearTimeout(startTimer);
        };
    }, [showGetStarted]);

    useEffect(() => {
        if (!showGetStarted || stepIndex < 0 || stepIndex >= HOME_STEPS.length) {
            return undefined;
        }

        const full = HOME_STEPS[stepIndex].label;
        let char = 0;
        let advanceTimer = null;

        const typeTimer = window.setInterval(() => {
            char += 1;
            setTypedLabels((prev) => {
                const next = [...prev];
                next[stepIndex] = full.slice(0, char);
                return next;
            });

            if (char >= full.length) {
                window.clearInterval(typeTimer);
                advanceTimer = window.setTimeout(() => {
                    if (stepIndex >= HOME_STEPS.length - 1) {
                        setStepsDone(true);
                    } else {
                        setStepIndex((i) => i + 1);
                    }
                }, STEP_PAUSE_MS);
            }
        }, TYPE_MS);

        return () => {
            window.clearInterval(typeTimer);
            if (advanceTimer) {
                window.clearTimeout(advanceTimer);
            }
        };
    }, [showGetStarted, stepIndex]);

    return (
        <div className="home-landing">
            <section className="home-hero-text">
                <p className="home-hero-text__eyebrow home-enter home-enter--1">
                    Homes &amp; classrooms
                </p>
                <h1 className="home-hero-text__headline home-enter home-enter--2">
                    One library, two networks.
                </h1>
                <p className="home-hero-text__sub home-enter home-enter--3">
                    Share files Online from anywhere, or keep them on a host PC for This Wi‑Fi —
                    same login, one library.
                </p>
            </section>

            <section className="home-split" aria-label="Online and This Wi‑Fi">
                <button
                    type="button"
                    className={`home-split__panel home-split__panel--online${
                        splitReady ? "" : " home-enter home-enter--split"
                    }`}
                    onClick={() => onOpenHelp("online")}
                >
                    <CloudIcon />
                    <div className="home-split__panel-copy">
                        <span className="home-split__pill home-split__pill--online">CLOUD</span>
                        <h2 className="home-split__title">Online</h2>
                        <p className="home-split__desc">
                            Use HomeShare from anywhere with internet. Files live in the cloud.
                        </p>
                        <span className="home-split__cta home-split__cta--on-rose">Learn more</span>
                    </div>
                </button>

                <div
                    className={`home-split__seam${splitReady ? "" : " home-enter--split"}`}
                    aria-hidden="true"
                >
                    <span className="home-split__seam-line" />
                </div>

                <button
                    type="button"
                    className={`home-split__panel home-split__panel--wifi${
                        splitReady ? "" : " home-enter home-enter--split"
                    }`}
                    onClick={() => onOpenHelp("local")}
                >
                    <RouterIcon />
                    <div className="home-split__panel-copy">
                        <span className="home-split__pill home-split__pill--wifi">LOCAL</span>
                        <h2 className="home-split__title">This Wi‑Fi</h2>
                        <p className="home-split__desc">
                            Keep files on a host PC at home or school. Everyone else just uses this
                            site.
                        </p>
                        <span className="home-split__cta">Learn more</span>
                    </div>
                </button>
            </section>

            {showGetStarted && (
                <>
                    <div
                        ref={stepsStripRef}
                        className={`home-steps-strip${
                            outlineActive ? " home-steps-strip--draw" : ""
                        }`}
                    >
                        <svg
                            className="home-steps-strip__outline"
                            viewBox={
                                outlineSize.width > 0
                                    ? `0 0 ${outlineSize.width} ${outlineSize.height}`
                                    : undefined
                            }
                            preserveAspectRatio="none"
                            aria-hidden="true"
                        >
                            <rect
                                className="home-steps-strip__fill"
                                x="0"
                                y="0"
                                width="100%"
                                height="100%"
                                rx="12"
                                ry="12"
                            />
                            {outlinePath ? (
                                <path
                                    className="home-steps-strip__stroke"
                                    d={outlinePath}
                                    pathLength="1"
                                />
                            ) : null}
                        </svg>
                        <ol className="home-steps-strip__list" aria-label="Getting started steps">
                            {HOME_STEPS.map((step, index) => {
                                const typing = stepIndex === index;
                                const complete =
                                    stepsDone || (stepIndex > index && stepIndex >= 0);
                                return (
                                    <li key={step.num} className="home-steps-strip__item">
                                        <span
                                            className={`home-steps-strip__num${
                                                stepIndex >= 0 || stepsDone
                                                    ? " home-steps-strip__num--visible"
                                                    : ""
                                            }`}
                                        >
                                            {step.num}
                                        </span>
                                        <span
                                            className="home-steps-strip__label"
                                            aria-label={step.label}
                                        >
                                            <span
                                                className="home-steps-strip__label-sizer"
                                                aria-hidden="true"
                                            >
                                                {step.label}
                                            </span>
                                            <span className="home-steps-strip__label-typed">
                                                {complete ? step.label : typedLabels[index]}
                                                {typing &&
                                                typedLabels[index].length < step.label.length ? (
                                                    <span
                                                        className="home-steps-strip__caret"
                                                        aria-hidden="true"
                                                    >
                                                        |
                                                    </span>
                                                ) : null}
                                            </span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    <div className="home-cta-row">
                        <button
                            type="button"
                            className={`home-cta-row__primary${
                                stepsDone ? " home-enter home-enter--cta" : " home-cta-row__btn--hidden"
                            }`}
                            onClick={onGetStarted}
                        >
                            Get Started
                        </button>
                        <button
                            type="button"
                            className={`home-cta-row__help${
                                stepsDone ? " home-enter home-enter--cta-late" : " home-cta-row__btn--hidden"
                            }`}
                            onClick={() => onOpenHelp()}
                        >
                            How does it work?
                        </button>
                    </div>
                </>
            )}

            {showLocalWifi && (
                <div className="home-action-tiles">
                    <button
                        type="button"
                        className="home-action-tile home-action-tile--primary home-enter home-enter--4"
                        onClick={onGoToDashboard}
                    >
                        <span className="home-action-tile__title">Go to Dashboard</span>
                        <span className="home-action-tile__hint">
                            Upload, library, and your connection status.
                        </span>
                    </button>
                    <button
                        type="button"
                        className="home-action-tile home-enter home-enter--5"
                        onClick={onLocalNetworkSetup}
                    >
                        <span className="home-action-tile__title">Use on this Wi‑Fi</span>
                        <span className="home-action-tile__hint">
                            Set up once on a home or classroom PC, then everyone on the same Wi‑Fi
                            can use this website.
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}

export default Home;
