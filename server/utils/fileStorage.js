const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");
const { isCloudHost } = require("./emailConfig");
const { uploadsDir } = require("./storagePaths");

const GRIDFS_BUCKET = "homeshare_files";

function shouldUseGridFS() {
    const mode = (process.env.FILE_STORAGE || "").trim().toLowerCase();
    if (mode === "gridfs") return true;
    if (mode === "disk") return false;
    return isCloudHost();
}

function makeStoredFilename(originalname) {
    const ext = path.extname(originalname || "");
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

function getBucket() {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error("MongoDB is not connected");
    }
    return new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
}

function isGridfsRecord(file) {
    return file.storageKind === "gridfs" || Boolean(file.gridfsId);
}

function resolveDiskPath(file) {
    if (file.storagePath && fs.existsSync(file.storagePath)) {
        return file.storagePath;
    }
    return path.join(uploadsDir, file.storedFilename);
}

async function saveToGridFS(storedFilename, buffer, contentType) {
    const bucket = getBucket();

    return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(storedFilename, {
            contentType,
        });

        uploadStream.on("error", reject);
        uploadStream.on("finish", () => {
            resolve({
                storageKind: "gridfs",
                gridfsId: uploadStream.id,
            });
        });

        uploadStream.end(buffer);
    });
}

async function fileExists(file) {
    if (isGridfsRecord(file)) {
        try {
            const bucket = getBucket();
            if (file.gridfsId) {
                const matches = await bucket
                    .find({ _id: new ObjectId(file.gridfsId) })
                    .limit(1)
                    .toArray();
                return matches.length > 0;
            }

            const matches = await bucket
                .find({ filename: file.storedFilename })
                .limit(1)
                .toArray();
            return matches.length > 0;
        } catch {
            return false;
        }
    }

    return fs.existsSync(resolveDiskPath(file));
}

function streamFileToResponse(file, res, downloadName) {
    return new Promise((resolve, reject) => {
        if (isGridfsRecord(file)) {
            const bucket = getBucket();
            const downloadStream = file.gridfsId
                ? bucket.openDownloadStream(new ObjectId(file.gridfsId))
                : bucket.openDownloadStreamByName(file.storedFilename);

            downloadStream.on("error", (err) => {
                reject(err);
            });

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${downloadName.replace(/"/g, "")}"`
            );
            if (file.fileType) {
                res.setHeader("Content-Type", file.fileType);
            }

            downloadStream.pipe(res);
            res.on("finish", resolve);
            res.on("close", resolve);
            return;
        }

        const diskPath = resolveDiskPath(file);
        if (!fs.existsSync(diskPath)) {
            reject(new Error("FILE_MISSING"));
            return;
        }

        res.download(path.resolve(diskPath), downloadName, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

module.exports = {
    shouldUseGridFS,
    makeStoredFilename,
    saveToGridFS,
    fileExists,
    streamFileToResponse,
    uploadsDir,
};
