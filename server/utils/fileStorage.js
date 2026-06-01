const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");
const { uploadsDir } = require("./storagePaths");

const GRIDFS_BUCKET = "homeshare_files";

/** GridFS in MongoDB by default so files work on Render and match Atlas. Set FILE_STORAGE=disk for local-only disk. */
function shouldUseGridFS() {
    const mode = (process.env.FILE_STORAGE || "gridfs").trim().toLowerCase();
    return mode !== "disk";
}

function makeStoredFilename(originalname) {
    const ext = path.extname(originalname || "");
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

function getDb() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("MongoDB is not connected yet");
    }

    if (mongoose.connection.db) {
        return mongoose.connection.db;
    }

    const client = mongoose.connection.getClient();
    return client.db(mongoose.connection.name);
}

function getBucket() {
    return new GridFSBucket(getDb(), { bucketName: GRIDFS_BUCKET });
}

function toObjectId(value) {
    if (!value) {
        return null;
    }
    if (value instanceof ObjectId) {
        return value;
    }
    return new ObjectId(String(value));
}

function isGridfsRecord(file) {
    return file.storageKind === "gridfs" || Boolean(file.gridfsId);
}

function resolveDiskPath(file) {
    if (file.storagePath) {
        const absolute = path.isAbsolute(file.storagePath)
            ? file.storagePath
            : path.join(uploadsDir, file.storagePath);

        if (fs.existsSync(absolute)) {
            return absolute;
        }
    }

    return path.join(uploadsDir, file.storedFilename);
}

function isForeignDiskPath(storagePath) {
    if (!storagePath) {
        return false;
    }

    return /^[A-Za-z]:\\/.test(storagePath) || storagePath.includes("\\");
}

async function saveToGridFS(storedFilename, buffer, contentType) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("Upload buffer is empty — file was not received correctly");
    }

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
        const bucket = getBucket();
        const id = toObjectId(file.gridfsId);

        if (id) {
            const matches = await bucket.find({ _id: id }).limit(1).toArray();
            return matches.length > 0;
        }

        const matches = await bucket
            .find({ filename: file.storedFilename })
            .limit(1)
            .toArray();
        return matches.length > 0;
    }

    if (isForeignDiskPath(file.storagePath)) {
        return false;
    }

    return fs.existsSync(resolveDiskPath(file));
}

function streamFileToResponse(file, res, downloadName) {
    return new Promise((resolve, reject) => {
        if (isGridfsRecord(file)) {
            const bucket = getBucket();
            const id = toObjectId(file.gridfsId);
            const downloadStream = id
                ? bucket.openDownloadStream(id)
                : bucket.openDownloadStreamByName(file.storedFilename);

            downloadStream.on("error", reject);

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

        if (isForeignDiskPath(file.storagePath)) {
            reject(new Error("FILE_FOREIGN_PATH"));
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
    isForeignDiskPath,
};
