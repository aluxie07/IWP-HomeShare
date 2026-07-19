const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
    },
    /** SHA-256 of the current httpOnly session JWT (server-side session binding). */
    sessionTokenHash: { type: String },
});

module.exports = mongoose.model("User", userSchema);
