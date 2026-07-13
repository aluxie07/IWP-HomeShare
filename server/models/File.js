const mongoose = require("mongoose");

const shardSchema = new mongoose.Schema(
    {
        index: { type: Number, required: true },
        provider: { type: String, enum: ["r2", "b2", "e2"], required: true },
        bucket: { type: String, required: true },
        key: { type: String, required: true },
    },
    { _id: false }
);

const chunkSchema = new mongoose.Schema(
    {
        index: { type: Number, required: true },
        size: { type: Number, required: true },
        shards: [shardSchema],
        shardMeta: {
            dataShards: Number,
            parityShards: Number,
            shardSize: Number,
            originalSize: Number,
        },
    },
    { _id: false }
);

const fileSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    storedFilename: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, required: true },
    storageKind: { type: String, enum: ["disk", "gridfs", "shards"] },
    gridfsId: { type: mongoose.Schema.Types.ObjectId },
    storagePath: { type: String },
    shards: [shardSchema],
    shardMeta: {
        dataShards: Number,
        parityShards: Number,
        shardSize: Number,
        originalSize: Number,
    },
    chunks: [chunkSchema],
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
