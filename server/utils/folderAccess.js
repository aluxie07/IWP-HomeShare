const mongoose = require("mongoose");
const Folder = require("../models/Folder");

/** Ensure folderId belongs to user; returns { ok, folderId, status, message }. */
async function resolveOwnedFolderId(folderId, userId) {
    if (folderId == null || folderId === "" || folderId === "root") {
        return { ok: true, folderId: null };
    }
    if (!mongoose.Types.ObjectId.isValid(folderId)) {
        return { ok: false, status: 400, message: "Invalid folder" };
    }
    const folder = await Folder.findOne({ _id: folderId, owner: userId });
    if (!folder) {
        return { ok: false, status: 404, message: "Folder not found" };
    }
    return { ok: true, folderId: folder._id };
}

module.exports = {
    resolveOwnedFolderId,
};
