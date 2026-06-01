const crypto = require("crypto");

function generateVerificationToken() {
    return crypto.randomBytes(32).toString("hex");
}

function verificationExpiry() {
    const hours = Number(process.env.VERIFICATION_EXPIRES_HOURS) || 24;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function passwordResetExpiry() {
    const hours = Number(process.env.PASSWORD_RESET_EXPIRES_HOURS) || 1;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

module.exports = {
    generateVerificationToken,
    verificationExpiry,
    passwordResetExpiry,
};
