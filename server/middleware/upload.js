const multer = require("multer");
const {
    shouldUseGridFS,
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
        // Local disk / Explorer folder: keep readable names
        cb(null, makeExplorerFilename(file.originalname));
    },
});

/** Cloud/GridFS default 10MB. Local disk mode: unlimited unless MAX_UPLOAD_BYTES is set. */
function getMaxFileSize() {
    if (process.env.MAX_UPLOAD_BYTES) {
        const n = Number(process.env.MAX_UPLOAD_BYTES);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (!shouldUseGridFS()) {
        return null;
    }
    return 10 * 1024 * 1024;
}

const MAX_FILE_SIZE = getMaxFileSize();

function runUpload(req, res, next) {
    const useGridFS = shouldUseGridFS();
    const storage = useGridFS ? multer.memoryStorage() : diskStorage;
    const maxBytes = getMaxFileSize();
    const limits = maxBytes ? { fileSize: maxBytes } : {};

    multer({ storage, limits }).single("file")(req, res, (err) => {
        if (err) {
            next(err);
            return;
        }

        req.fileStorageMode = useGridFS ? "gridfs" : "disk";
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
