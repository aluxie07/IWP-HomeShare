import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TUTORIALS = {
    online: {
        src: `${process.env.PUBLIC_URL}/UploadTutorial.png`,
        alt: "Tutorial showing how to upload files Online",
    },
    local: {
        src: `${process.env.PUBLIC_URL}/LocalTutorial.png`,
        alt: "Tutorial showing how to set up This Wi‑Fi",
    },
};

function prefersReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) {
        return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Help({ onBack, onOpenLocalSetup, focusSection }) {
    const [lightbox, setLightbox] = useState(null);
    const pageRef = useRef(null);

    useEffect(() => {
        if (!focusSection) return undefined;
        const id = focusSection === "local" ? "help-local" : "help-online";
        const node = document.getElementById(id);
        if (!node) return undefined;
        const timer = window.setTimeout(() => {
            node.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        return () => window.clearTimeout(timer);
    }, [focusSection]);

    useEffect(() => {
        const root = pageRef.current;
        if (!root) return undefined;

        const cards = root.querySelectorAll(".help-page-card");
        if (!cards.length) return undefined;

        if (prefersReducedMotion()) {
            cards.forEach((card) => {
                card.classList.add("help-page-card--visible");
            });
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    entry.target.classList.toggle(
                        "help-page-card--visible",
                        entry.isIntersecting
                    );
                });
            },
            {
                threshold: 0.2,
                rootMargin: "-8% 0px -8% 0px",
            }
        );

        cards.forEach((card) => observer.observe(card));

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!lightbox) return undefined;

        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                setLightbox(null);
            }
        };

        document.addEventListener("keydown", onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [lightbox]);

    const openTutorial = (key) => setLightbox(TUTORIALS[key]);
    const closeLightbox = () => setLightbox(null);

    return (
        <section ref={pageRef} className="dashboard-page dashboard-page--wide help-page">
            <div className="dashboard-card help-page-card help-page-card--header">
                <div className="network-settings-header">
                    <h2 className="auth-title">Help</h2>
                    <button type="button" className="files-link-btn" onClick={onBack}>
                        Back
                    </button>
                </div>
                <p className="files-page-intro">
                    HomeShare is for homes and classrooms. You can work{" "}
                    <strong>Online (Cloud)</strong> from anywhere, or keep files on a PC on{" "}
                    <strong>this Wi‑Fi (Local)</strong>.
                </p>
            </div>

            <div
                id="help-online"
                className={`dashboard-card help-page-card help-section-card help-section-card--online ${
                    focusSection === "online" ? "help-section-card--focus" : ""
                }`}
            >
                <h3 className="files-section-title">Online (Cloud)</h3>
                <div className="help-section-split help-section-split--cloud">
                    <div className="help-section-split__copy">
                        <p className="files-muted">
                            Log in from anywhere with internet. Files are stored on HomeShare’s
                            cloud service.
                        </p>
                        <ul className="help-list">
                            <li>
                                Create an account with <strong>Get Started</strong>, then upload
                                and share from any device.
                            </li>
                            <li>
                                In the library, files with a <strong>Cloud</strong> badge live on
                                the online service.
                            </li>
                            <li>
                                Use the same email on Online and This Wi‑Fi to see both libraries
                                together.
                            </li>
                        </ul>
                    </div>
                    <button
                        type="button"
                        className="help-tutorial-trigger"
                        onClick={() => openTutorial("online")}
                    >
                        <img
                            className="help-tutorial-img"
                            src={TUTORIALS.online.src}
                            alt={TUTORIALS.online.alt}
                        />
                        <span className="help-tutorial-caption">Click to enlarge</span>
                    </button>
                </div>
            </div>

            <div
                id="help-local"
                className={`dashboard-card help-page-card help-section-card help-section-card--local ${
                    focusSection === "local" ? "help-section-card--focus" : ""
                }`}
            >
                <h3 className="files-section-title">This Wi‑Fi (Local)</h3>
                <div className="help-section-split help-section-split--local">
                    <div className="help-section-split__copy">
                        <p className="files-muted">
                            Pick one Windows PC as the host (the teacher’s computer or a home PC).
                            Students and family members stay on the same Wi‑Fi and use this website
                            — they do not need to install anything. Files stay on that host PC.
                        </p>
                        <ol className="local-setup-join-steps">
                            <li>
                                <strong>Get a free database link</strong> — create a free MongoDB
                                Atlas account, create a free cluster, copy the connection link, and
                                put your real password in the link.
                            </li>
                            <li>
                                <strong>Download and start on this PC</strong> — download the
                                Windows zip, unzip, double‑click{" "}
                                <strong>Start HomeShare.bat</strong>, paste the database link in
                                the popup, and leave the black window open (minimize is fine).
                            </li>
                            <li>
                                <strong>Connect this website</strong> — on that same PC, open{" "}
                                <strong>Use on this Wi‑Fi</strong> and wait for Connected (or tap
                                Try again). Then create an account or log in.
                            </li>
                            <li>
                                <strong>Other devices (optional)</strong> — on a phone or another
                                PC, paste the host’s Wi‑Fi address from step 4 of the setup page.
                                “Try again” only works on the host PC.
                            </li>
                        </ol>
                        {onOpenLocalSetup && (
                            <button
                                type="button"
                                className="auth-form__secondary-btn"
                                onClick={onOpenLocalSetup}
                            >
                                Open “Use on this Wi‑Fi” setup
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        className="help-tutorial-trigger"
                        onClick={() => openTutorial("local")}
                    >
                        <img
                            className="help-tutorial-img"
                            src={TUTORIALS.local.src}
                            alt={TUTORIALS.local.alt}
                        />
                        <span className="help-tutorial-caption">Click to enlarge</span>
                    </button>
                </div>
            </div>

            <div className="dashboard-card help-page-card help-section-card help-section-card--text">
                <h3 className="files-section-title">Cloud vs Local file badges</h3>
                <p className="files-muted">In the library, each file shows a badge:</p>
                <ul className="help-list">
                    <li>
                        <strong>Cloud</strong> — stored on the online service
                    </li>
                    <li>
                        <strong>Local</strong> — stored on the host PC
                    </li>
                </ul>
                <p className="files-muted">
                    Use the All / Cloud / Local filters to show one group at a time. If you log in
                    to both Online and This Wi‑Fi with the <strong>same email</strong>, the library
                    can show both.
                </p>
            </div>

            <div className="dashboard-card help-page-card help-section-card help-section-card--text">
                <h3 className="files-section-title">Access modes</h3>
                <ul className="help-list">
                    <li>
                        <strong>Private</strong> — only you can download; share links are off
                    </li>
                    <li>
                        <strong>Shared</strong> — you can create a share link for others
                    </li>
                    <li>
                        <strong>Local Only</strong> — only people on the same Wi‑Fi / network range
                        as when you set this can download
                    </li>
                </ul>
                <p className="files-muted">
                    Access mode is separate from the Cloud/Local storage badge.
                </p>
            </div>

            <div className="dashboard-card help-page-card help-section-card help-section-card--text">
                <h3 className="files-section-title">Sharing &amp; library</h3>
                <ul className="help-list">
                    <li>Upload from Upload; open files in the Library</li>
                    <li>Click a file for access mode, share link, download, or delete</li>
                    <li>Deleted files keep a short history entry</li>
                    <li>
                        Prefer the website library on phones and student devices. A Windows shared
                        folder is optional and only needed for advanced File Explorer use.
                    </li>
                </ul>
            </div>

            <div className="dashboard-card help-page-card help-section-card help-section-card--text">
                <h3 className="files-section-title">Sessions</h3>
                <p className="files-muted">
                    You are signed out after 15 minutes with no activity on the HomeShare site.
                    Time spent on other tabs or sites still counts toward that limit.
                </p>
            </div>

            {lightbox &&
                createPortal(
                    <div
                        className="help-lightbox"
                        role="dialog"
                        aria-modal="true"
                        aria-label={lightbox.alt}
                        onClick={closeLightbox}
                    >
                        <button
                            type="button"
                            className="help-lightbox__close"
                            onClick={closeLightbox}
                            aria-label="Close enlarged image"
                        >
                            ✕
                        </button>
                        <img
                            className="help-lightbox__img"
                            src={lightbox.src}
                            alt={lightbox.alt}
                            onClick={(event) => event.stopPropagation()}
                        />
                    </div>,
                    document.body
                )}
        </section>
    );
}

export default Help;
