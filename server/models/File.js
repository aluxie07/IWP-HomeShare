const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    storedFilename: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, required: true },
    storagePath: { type: String, required: true },
});

module.exports = mongoose.model("File", fileSchema);
