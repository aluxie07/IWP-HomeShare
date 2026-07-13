const path = require("path");
const fs = require("fs");
const { getUploadsDir, ensureUploadsDir } = require("./appPaths");

/**
 * Move older uploads from server/uploads into the HomeShare Explorer folder
 * and rewrite storagePath on File documents when possible.
 */
async function migrateLegacyUploadsToExplorer() {
    const File = require("../models/File");
    const legacyDir = path.join(__dirname, "..", "uploads");
    const targetDir = ensureUploadsDir();

    if (!fs.existsSync(legacyDir) || path.resolve(legacyDir) === path.resolve(targetDir)) {
        return { moved: 0 };
    }

    const names = fs.readdirSync(legacyDir).filter((n) => n !== ".gitkeep");
    let moved = 0;

    for (const name of names) {
        const from = path.join(legacyDir, name);
        const to = path.join(targetDir, name);

        try {
            if (!fs.statSync(from).isFile()) {
                continue;
            }
            if (!fs.existsSync(to)) {
                fs.copyFileSync(from, to);
            }

            await File.updateMany(
                {
                    $or: [{ storagePath: from }, { storedFilename: name }],
                    storageKind: { $ne: "gridfs" },
                },
                { $set: { storagePath: to, storageKind: "disk" } }
            );

            moved += 1;
        } catch (err) {
            console.warn(`[HomeShare] Could not migrate ${name}: ${err.message}`);
        }
    }

    return { moved, targetDir };
}

module.exports = {
    migrateLegacyUploadsToExplorer,
};
