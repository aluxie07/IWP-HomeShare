const multer = require("multer");
const {
    getStorageMode,
    makeStoredFilename,
    makeExplorerFilename,
    uploadsDir,
} = require("../utils/fileStorage");
const { ensureUploadsDir } = require("../utils/appPaths");

const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        try {
            cb(null, ensureUploadsDir());
        } catch (err) {
            cb(err);
        }
    },
    filename: (_req, file, cb) => {
        cb(null, makeExplorerFilename(file.originalname));
    },
});

/** Disk: unlimited. Cloud shards/GridFS: 50MB default (or MAX_UPLOAD_BYTES). */
function getMaxFileSize() {
    if (process.env.MAX_UPLOAD_BYTES) {
        const n = Number(process.env.MAX_UPLOAD_BYTES);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    const mode = getStorageMode();
    if (mode === "disk") {
        return null;
    }
    return 50 * 1024 * 1024;
}

const MAX_FILE_SIZE = getMaxFileSize();

function runUpload(req, res, next) {
    const mode = getStorageMode();
    const storage = mode === "disk" ? diskStorage : multer.memoryStorage();
    const maxBytes = getMaxFileSize();
    const limits = maxBytes ? { fileSize: maxBytes } : {};

    multer({ storage, limits }).single("file")(req, res, (err) => {
        if (err) {
            next(err);
            return;
        }

        req.fileStorageMode = mode;
        next();
    });
}

module.exports = {
    runUpload,
    uploadsDir,
    MAX_FILE_SIZE,
    getMaxFileSize,
    makeStoredFilename,
    makeExplorerFilename,
};
