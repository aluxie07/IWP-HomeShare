const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");
const { uploadsDir } = require("./storagePaths");
const { getDataDir, getUploadsDir, ensureUploadsDir } = require("./appPaths");
const {
    areCloudShardsConfigured,
    saveToCloudShards,
    loadFromCloudShards,
    cloudShardsExist,
    deleteCloudShards,
} = require("./cloudShards");

const GRIDFS_BUCKET = "homeshare_files";

/**
 * Storage modes:
 * - disk   → Local Network Mode / Explorer folder
 * - shards → erasure-coded fragments on R2 + B2 + E2 (default when configured)
 * - gridfs → legacy MongoDB GridFS
 */
function getStorageMode() {
    const mode = (process.env.FILE_STORAGE || "").trim().toLowerCase();
    if (mode === "disk" || mode === "shards" || mode === "gridfs") {
        return mode;
    }
    if (areCloudShardsConfigured()) {
        return "shards";
    }
    return "gridfs";
}

function shouldUseGridFS() {
    return getStorageMode() === "gridfs";
}

function shouldUseCloudShards() {
    return getStorageMode() === "shards";
}

function shouldUseDisk() {
    return getStorageMode() === "disk";
}

function makeStoredFilename(originalname) {
    const ext = path.extname(originalname || "");
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

function makeExplorerFilename(originalname) {
    const dir = ensureUploadsDir();
    const raw = path.basename(originalname || "file");
    const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "file";
    const ext = path.extname(safe);
    const stem = path.basename(safe, ext) || "file";

    let candidate = `${stem}${ext}`;
    let n = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
        candidate = `${stem} (${n})${ext}`;
        n += 1;
    }
    return candidate;
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

function isShardsRecord(file) {
    return file.storageKind === "shards" || (file.shards && file.shards.length > 0);
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

function getAllowedUploadRoots() {
    const roots = new Set([
        path.resolve(uploadsDir),
        path.resolve(getUploadsDir()),
        path.resolve(getDataDir(), "uploads"),
    ]);
    return [...roots];
}

function isPathUnderRoot(filePath, root) {
    const resolved = path.resolve(filePath);
    const resolvedRoot = path.resolve(root);
    return (
        resolved === resolvedRoot ||
        resolved.startsWith(resolvedRoot + path.sep)
    );
}

function isForeignDiskPath(storagePath) {
    if (!storagePath) {
        return false;
    }

    const resolved = path.resolve(storagePath);
    if (fs.existsSync(resolved)) {
        return false;
    }

    if (getAllowedUploadRoots().some((root) => isPathUnderRoot(resolved, root))) {
        return false;
    }

    return path.isAbsolute(storagePath);
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
    if (isShardsRecord(file)) {
        return cloudShardsExist(file);
    }

    if (isGridfsRecord(file)) {
        try {
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
        } catch {
            return false;
        }
    }

    if (isForeignDiskPath(file.storagePath)) {
        return false;
    }

    return fs.existsSync(resolveDiskPath(file));
}

function streamFileToResponse(file, res, downloadName) {
    return new Promise(async (resolve, reject) => {
        try {
            if (isShardsRecord(file)) {
                const buffer = await loadFromCloudShards(file);
                res.setHeader(
                    "Content-Disposition",
                    `attachment; filename="${downloadName.replace(/"/g, "")}"`
                );
                if (file.fileType) {
                    res.setHeader("Content-Type", file.fileType);
                }
                res.setHeader("Content-Length", buffer.length);
                res.end(buffer);
                resolve();
                return;
            }

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
        } catch (err) {
            reject(err);
        }
    });
}

async function deleteStoredFile(file) {
    if (isShardsRecord(file)) {
        await deleteCloudShards(file);
    }

    if (isGridfsRecord(file) && file.gridfsId) {
        try {
            const bucket = getBucket();
            await bucket.delete(toObjectId(file.gridfsId));
        } catch (err) {
            console.warn(`[HomeShare] GridFS delete: ${err.message}`);
        }
    }

    const diskPath = file.storagePath || resolveDiskPath(file);
    if (diskPath && fs.existsSync(diskPath)) {
        try {
            fs.unlinkSync(diskPath);
        } catch (err) {
            console.warn(`[HomeShare] Disk delete: ${err.message}`);
        }
    }
}

module.exports = {
    getStorageMode,
    shouldUseGridFS,
    shouldUseCloudShards,
    shouldUseDisk,
    makeStoredFilename,
    makeExplorerFilename,
    saveToGridFS,
    saveToCloudShards,
    fileExists,
    streamFileToResponse,
    deleteStoredFile,
    uploadsDir,
    isForeignDiskPath,
    areCloudShardsConfigured,
};
