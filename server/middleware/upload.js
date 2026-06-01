const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const uploadsDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const unique = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
        cb(null, unique);
    },
});

const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_BYTES) || 10 * 1024 * 1024;

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
});

module.exports = { upload, uploadsDir, MAX_FILE_SIZE };
