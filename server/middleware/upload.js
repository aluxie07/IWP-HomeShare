const multer = require("multer");
const {
    shouldUseGridFS,
    makeStoredFilename,
    uploadsDir,
} = require("../utils/fileStorage");

const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        cb(null, makeStoredFilename(file.originalname));
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

module.exports = { runUpload, uploadsDir, MAX_FILE_SIZE, makeStoredFilename };
