const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    storedFilename: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, required: true },
    storageKind: { type: String, enum: ["disk", "gridfs"] },
    gridfsId: { type: mongoose.Schema.Types.ObjectId },
    storagePath: { type: String },
    shareToken: { type: String, unique: true, sparse: true },
    shareExpiresAt: { type: Date },
    shareMaxDownloads: { type: Number },
    shareDownloadCount: { type: Number, default: 0 },
    sharePermission: {
        type: String,
        enum: ["download", "view"],
        default: "download",
    },
    accessMode: {
        type: String,
        enum: ["private", "shared", "local_only"],
        default: "private",
    },
});

module.exports = mongoose.model("File", fileSchema);
