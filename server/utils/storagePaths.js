const { ensureUploadsDir } = require("./appPaths");

const uploadsDir = ensureUploadsDir();

module.exports = { uploadsDir };
