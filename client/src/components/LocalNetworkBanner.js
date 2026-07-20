function LocalNetworkBanner({ apiMode, apiUrl, connected, onOpenSetup }) {
    if (apiMode === "detecting") {
        return null;
    }

    const isLocal = apiMode === "local" || apiMode === "manual";

    return (
        <div
            className={`local-network-banner ${
                isLocal && connected
                    ? "local-network-banner--active"
                    : "local-network-banner--cloud"
            }`}
        >
            <div className="local-network-banner__text">
                <strong>
                    {isLocal && connected
                        ? "Local Network Mode active"
                        : "Cloud mode"}
                </strong>
                <span>
                    {isLocal && connected
                        ? ` Connected to ${apiUrl}. Local Only files and trusted-network features are available.`
                        : " Download and run the local zip to enable Local Network Mode."}
                </span>
            </div>
            <button type="button" className="local-network-banner__btn" onClick={onOpenSetup}>
                {isLocal && connected ? "Local setup" : "Enable local mode"}
            </button>
        </div>
    );
}

export default LocalNetworkBanner;
