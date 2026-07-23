const express = require("express");
const mongoose = require("mongoose");
const Folder = require("../models/Folder");
const File = require("../models/File");
const authMiddleware = require("../middleware/authMiddleware");
const requireMongo = require("../middleware/requireMongo");

const router = express.Router();
const MAX_NAME_LENGTH = 80;

function formatFolder(folder) {
    return {
        id: folder._id,
        name: folder.name,
        parentFolder: folder.parentFolder || null,
        createdAt: folder.createdAt,
    };
}

function normalizeName(raw) {
    return String(raw || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, MAX_NAME_LENGTH);
}

function parseParentId(value) {
    if (value == null || value === "" || value === "root") {
        return null;
    }
    if (!mongoose.Types.ObjectId.isValid(value)) {
        return undefined;
    }
    return value;
}

async function getOwnedFolder(folderId, userId) {
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
        return null;
    }
    return Folder.findOne({ _id: folderId, owner: userId });
}

router.get("/folders", authMiddleware, requireMongo, async (req, res) => {
    try {
        const parentParsed = parseParentId(req.query.parentId);
        if (parentParsed === undefined) {
            return res.status(400).json({ message: "Invalid parentId" });
        }

        if (parentParsed) {
            const parent = await getOwnedFolder(parentParsed, req.user.id);
            if (!parent) {
                return res.status(404).json({ message: "Parent folder not found" });
            }
        }

        const folders = await Folder.find({
            owner: req.user.id,
            parentFolder: parentParsed,
        }).sort({ name: 1 });

        res.json({ folders: folders.map(formatFolder) });
    } catch (err) {
        console.error("[HomeShare] List folders failed:", err.message);
        res.status(500).json({ message: "Could not load folders" });
    }
});

router.get("/folders/tree", authMiddleware, requireMongo, async (req, res) => {
    try {
        const folders = await Folder.find({ owner: req.user.id }).sort({ name: 1 });
        res.json({ folders: folders.map(formatFolder) });
    } catch (err) {
        console.error("[HomeShare] List folder tree failed:", err.message);
        res.status(500).json({ message: "Could not load folders" });
    }
});

router.post("/folders", authMiddleware, requireMongo, async (req, res) => {
    try {
        const name = normalizeName(req.body?.name);
        if (!name) {
            return res.status(400).json({ message: "Folder name is required" });
        }

        const parentParsed = parseParentId(req.body?.parentId);
        if (parentParsed === undefined) {
            return res.status(400).json({ message: "Invalid parentId" });
        }

        if (parentParsed) {
            const parent = await getOwnedFolder(parentParsed, req.user.id);
            if (!parent) {
                return res.status(404).json({ message: "Parent folder not found" });
            }
        }

        const existing = await Folder.findOne({
            owner: req.user.id,
            parentFolder: parentParsed,
            name,
        }).collation({ locale: "en", strength: 2 });

        if (existing) {
            return res.status(409).json({ message: "A folder with that name already exists here" });
        }

        const folder = await Folder.create({
            name,
            owner: req.user.id,
            parentFolder: parentParsed,
        });

        res.status(201).json({
            message: "Folder created",
            folder: formatFolder(folder),
        });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({ message: "A folder with that name already exists here" });
        }
        console.error("[HomeShare] Create folder failed:", err.message);
        res.status(500).json({ message: "Could not create folder" });
    }
});

router.patch("/folders/:id", authMiddleware, requireMongo, async (req, res) => {
    try {
        const folder = await getOwnedFolder(req.params.id, req.user.id);
        if (!folder) {
            return res.status(404).json({ message: "Folder not found" });
        }

        const name = normalizeName(req.body?.name);
        if (!name) {
            return res.status(400).json({ message: "Folder name is required" });
        }

        const existing = await Folder.findOne({
            _id: { $ne: folder._id },
            owner: req.user.id,
            parentFolder: folder.parentFolder,
            name,
        }).collation({ locale: "en", strength: 2 });

        if (existing) {
            return res.status(409).json({ message: "A folder with that name already exists here" });
        }

        folder.name = name;
        await folder.save();

        res.json({
            message: "Folder renamed",
            folder: formatFolder(folder),
        });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({ message: "A folder with that name already exists here" });
        }
        console.error("[HomeShare] Rename folder failed:", err.message);
        res.status(500).json({ message: "Could not rename folder" });
    }
});

router.delete("/folders/:id", authMiddleware, requireMongo, async (req, res) => {
    try {
        const folder = await getOwnedFolder(req.params.id, req.user.id);
        if (!folder) {
            return res.status(404).json({ message: "Folder not found" });
        }

        const [childFolders, childFiles] = await Promise.all([
            Folder.countDocuments({ owner: req.user.id, parentFolder: folder._id }),
            File.countDocuments({
                owner: req.user.id,
                folderId: folder._id,
                deletedAt: null,
            }),
        ]);

        if (childFolders > 0 || childFiles > 0) {
            return res.status(400).json({
                message: "Folder is not empty. Move or delete its contents first.",
            });
        }

        await Folder.deleteOne({ _id: folder._id });
        res.json({ message: "Folder deleted" });
    } catch (err) {
        console.error("[HomeShare] Delete folder failed:", err.message);
        res.status(500).json({ message: "Could not delete folder" });
    }
});

module.exports = router;
