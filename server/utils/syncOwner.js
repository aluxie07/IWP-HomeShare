/** Last authenticated user id on this local server — used to own Explorer drops. */
let lastOwnerId = null;

function setLastSyncOwnerId(userId) {
    if (userId) {
        lastOwnerId = String(userId);
    }
}

function getLastSyncOwnerId() {
    return lastOwnerId;
}

module.exports = {
    setLastSyncOwnerId,
    getLastSyncOwnerId,
};
