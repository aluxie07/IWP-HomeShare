function Help({ onBack, onOpenLocalSetup }) {
    return (
        <section className="dashboard-page dashboard-page--wide">
            <div className="dashboard-card help-page-card">
                <div className="network-settings-header">
                    <h2 className="auth-title">Help</h2>
                    <button type="button" className="files-link-btn" onClick={onBack}>
                        Back
                    </button>
                </div>

                <p className="files-page-intro">
                    HomeShare lets you share files with people on the same Wi‑Fi or through the
                    cloud site. This page explains the core features.
                </p>

                <div className="help-section">
                    <h3 className="files-section-title">Cloud mode</h3>
                    <p className="files-muted">
                        Cloud mode allows you to upload files online.. You can log in, upload, and manage files from anywhere with internet. File contents are stored in the cloud. Use this when you are not running a local server.
                        File contents are stored in the cloud.
                    </p>
                </div>

                <div className="help-section">
                    <h3 className="files-section-title">Local Network Mode</h3>
                    <p className="files-muted">
                        The website connects to a HomeShare server on a PC on your Wi‑Fi. To set up a free server, follow the steps below. Uploads
                        on that server are kept on the host PC’s HomeShare folder. Other
                        devices on the same Wi‑Fi can connect with the host’s LAN address (for
                        example <code>http://192.168.x.x:8080</code>).
                    </p>
                    <ol className="local-setup-join-steps">
                        <li>Create a MongoDB account and create a new cluster for free. Click connect, then drivers and copy the connection string, replacing dbpassword with your cluster password. </li>
                        <li>Download and run the local package as an administrator on the host PC. Follow the setup instructions and wait until you see "MongoDB connected". </li>
                        <li>On that PC, open Local Network Mode on the HomeShare website and click Detect</li>
                        <li>Copy the LAN address for phones or other PCs</li>
                        <li>Register your Wi‑Fi under Network settings (first person becomes admin)</li>
                    </ol>
                    {onOpenLocalSetup && (
                        <button
                            type="button"
                            className="auth-form__secondary-btn"
                            onClick={onOpenLocalSetup}
                        >
                            Open Local Mode setup
                        </button>
                    )}
                </div>

                <div className="help-section">
                    <h3 className="files-section-title">Cloud vs Local file badges</h3>
                    <p className="files-muted">
                        In the library, each file shows a badge:
                    </p>
                    <ul className="help-list">
                        <li>
                            <strong>Cloud</strong> — stored on the online service
                        </li>
                        <li>
                            <strong>Local</strong> — stored on the host PC’s disk
                        </li>
                    </ul>
                    <p className="files-muted">
                        Use the All / Cloud / Local filters to show one group at a time.
                    </p>
                </div>

                <div className="help-section">
                    <h3 className="files-section-title">Access modes</h3>
                    <ul className="help-list">
                        <li>
                            <strong>Private</strong> — only you can download; share links are off
                        </li>
                        <li>
                            <strong>Shared</strong> — you can create a share link for others
                        </li>
                        <li>
                            <strong>Local Only</strong> — download works only on a registered
                            trusted Wi‑Fi (LAN), not from the public internet
                        </li>
                    </ul>
                    <p className="files-muted">
                        Access mode is separate from the Cloud/Local storage badge.
                    </p>
                </div>

                <div className="help-section">
                    <h3 className="files-section-title">Trusted network</h3>
                    <p className="files-muted">
                        The first person to register a Wi‑Fi network becomes the network admin.
                        Others on that network can use shared files for that network. A different
                        Wi‑Fi network needs its own registration. Register from Local
                        Network Mode, as the cloud site cannot see your home Wi‑Fi address.
                    </p>
                </div>

                <div className="help-section">
                    <h3 className="files-section-title">Sharing &amp; library</h3>
                    <ul className="help-list">
                        <li>Upload files from Upload; open them in the Library</li>
                        <li>Click a file for access mode, share link, download, or delete</li>
                        <li>Deleted files keep a short history entry (who uploaded / deleted)</li>
                        <li>
                            On Windows, other PCs may open the shared folder{" "}
                            <code>\\HOST-IP\HomeShare</code> (may ask for Windows sign-in), recommended for users other than the host to use the website's file library instead.
                        </li>
                    </ul>
                </div>

                <div className="help-section">
                    <h3 className="files-section-title">Sessions</h3>
                    <p className="files-muted">
                        You are signed out after 15 minutes with no activity on the HomeShare
                        site. Time spent on other tabs or sites still counts toward that limit.
                    </p>
                </div>
            </div>
        </section>
    );
}

export default Help;
