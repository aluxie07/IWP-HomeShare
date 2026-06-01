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

const upload = multer({
    storage: shouldUseGridFS() ? multer.memoryStorage() : diskStorage,
    limits: { fileSize: MAX_FILE_SIZE },
});

module.exports = { upload, uploadsDir, MAX_FILE_SIZE, makeStoredFilename };
