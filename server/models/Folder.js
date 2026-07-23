const mongoose = require("mongoose");

const folderSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    parentFolder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Folder",
        default: null,
        index: true,
    },
    createdAt: { type: Date, default: Date.now },
});

folderSchema.index(
    { owner: 1, parentFolder: 1, name: 1 },
    { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Folder", folderSchema);
