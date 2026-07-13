require("dotenv").config();
const path = require("path");
const fs = require("fs");
const os = require("os");
const mongoose = require("mongoose");
const File = require("../models/File");

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const dir = path.join(os.homedir(), "HomeShare", "Files");
    const files = await File.find({ storageKind: { $ne: "gridfs" } });
    let n = 0;

    for (const f of files) {
        const next = path.join(dir, f.storedFilename);
        if (fs.existsSync(next)) {
            f.storagePath = next;
            f.storageKind = "disk";
            await f.save();
            n += 1;
        }
    }

    console.log(`updated ${n} of ${files.length}`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
