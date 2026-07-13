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

const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_BYTES) || 10 * 1024 * 1024;

function runUpload(req, res, next) {
    const useGridFS = shouldUseGridFS();
    const storage = useGridFS ? multer.memoryStorage() : diskStorage;

    multer({ storage, limits: { fileSize: MAX_FILE_SIZE } }).single("file")(req, res, (err) => {
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
    makeStoredFilename,
    makeExplorerFilename,
};
