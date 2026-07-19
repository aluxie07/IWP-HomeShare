const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const verifyRecaptchaMiddleware = require("../middleware/verifyRecaptcha");
const sendActivationEmail = require("../utils/sendActivationEmail");
const { EmailSendError: ActivationEmailSendError } = require("../utils/sendActivationEmail");
const sendPasswordResetEmail = require("../utils/sendPasswordResetEmail");
const { EmailSendError: ResetEmailSendError } = require("../utils/sendPasswordResetEmail");
const { isValidPassword, PASSWORD_MESSAGE } = require("../utils/passwordValidation");
const {
    generateVerificationToken,
    verificationExpiry,
    passwordResetExpiry,
} = require("../utils/verificationToken");
const { setAuthCookie, clearAuthCookie, readAuthToken } = require("../utils/authCookie");
const { hashSessionToken } = require("../utils/sessionToken");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

function resolveUserRole(email, isFirstUser) {
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (adminEmail && email.trim().toLowerCase() === adminEmail) {
        return "admin";
    }
    return isFirstUser ? "admin" : "user";
}

async function setVerificationToken(user) {
    const token = generateVerificationToken();
    user.verificationToken = token;
    user.verificationTokenExpires = verificationExpiry();
    user.isVerified = false;
    await user.save();

    try {
        const result = await sendActivationEmail(user.email, token);
        return { token, emailSent: result.sent !== false };
    } catch (err) {
        if (err instanceof ActivationEmailSendError) {
            return { token, emailSent: false, emailError: err.message };
        }
        throw err;
    }
}

router.post("/register", verifyRecaptchaMiddleware, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({ message: PASSWORD_MESSAGE });
        }

        const existing = await User.findOne({ $or: [{ email }, { username }] });

        if (existing) {
            if (existing.isVerified) {
                return res
                    .status(409)
                    .json({ message: "Username or email already exists" });
            }

            if (existing.email !== email) {
                return res.status(409).json({ message: "Username already exists" });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            existing.username = username;
            existing.password = hashedPassword;
            const verification = await setVerificationToken(existing);

            return res.status(201).json({
                message: verification.emailSent
                    ? "Account pending activation. Check your email for the activation link."
                    : `Account saved. Email could not be sent (${verification.emailError}). Use Resend activation on the login page.`,
                emailSent: verification.emailSent,
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const isFirstUser = (await User.countDocuments()) === 0;

        const user = new User({
            username,
            email,
            password: hashedPassword,
            isVerified: false,
            role: resolveUserRole(email, isFirstUser),
        });

        await user.save();
        const verification = await setVerificationToken(user);

        res.status(201).json({
            message: verification.emailSent
                ? "Account created. Check your email for the activation link before logging in."
                : `Account created. Email could not be sent (${verification.emailError}). Use Resend activation on the login page.`,
            emailSent: verification.emailSent,
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "Username or email already exists" });
        }
        res.status(500).json({ message: "Registration failed", error: err.message });
    }
});

router.post("/forgot-password", async (req, res) => {
    const genericMessage =
        "If an account exists for this email, a password reset link was sent.";

    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email: email.trim() });

        if (!user) {
            return res.status(200).json({ message: genericMessage });
        }

        const token = generateVerificationToken();
        user.passwordResetToken = token;
        user.passwordResetExpires = passwordResetExpiry();
        await user.save();
        await sendPasswordResetEmail(user.email, token);

        res.status(200).json({ message: genericMessage });
    } catch (err) {
        if (err instanceof ResetEmailSendError) {
            return res.status(503).json({ message: err.message });
        }
        res.status(500).json({ message: "Could not process password reset request" });
    }
});

router.get("/reset-password/validate", async (req, res) => {
    try {
        const token = String(req.query.token || "").trim();

        if (!token) {
            return res.status(400).json({ message: "Reset token is required", valid: false });
        }

        const user = await User.findOne({ passwordResetToken: token });

        if (!user) {
            return res.status(400).json({
                message: "Invalid or expired reset link.",
                valid: false,
                code: "INVALID_TOKEN",
            });
        }

        if (user.passwordResetExpires && user.passwordResetExpires <= new Date()) {
            return res.status(400).json({
                message: "This reset link has expired. Request a new one from the login page.",
                valid: false,
                code: "TOKEN_EXPIRED",
            });
        }

        res.status(200).json({ message: "Reset link is valid", valid: true });
    } catch (err) {
        res.status(500).json({ message: "Validation failed", valid: false });
    }
});

router.post("/reset-password", async (req, res) => {
    try {
        const { token, password } = req.body;
        const resetToken = String(token || "").trim();

        if (!resetToken || !password) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({ message: PASSWORD_MESSAGE });
        }

        const user = await User.findOne({ passwordResetToken: resetToken });

        if (!user) {
            return res.status(400).json({
                message: "Invalid or expired reset link. Request a new one from the login page.",
            });
        }

        if (user.passwordResetExpires && user.passwordResetExpires <= new Date()) {
            return res.status(400).json({
                message: "This reset link has expired. Request a new one from the login page.",
            });
        }

        user.password = await bcrypt.hash(password, 10);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        res.status(200).json({
            message: "Password updated successfully. You can now log in.",
        });
    } catch (err) {
        res.status(500).json({ message: "Could not reset password" });
    }
});

router.get("/verify-email", async (req, res) => {
    try {
        const token = String(req.query.token || "").trim();

        if (!token) {
            return res.status(400).json({ message: "Activation token is required" });
        }

        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            return res.status(400).json({
                message: "Invalid activation link. Request a new one from the login page.",
                code: "INVALID_TOKEN",
            });
        }

        if (user.isVerified) {
            return res.status(200).json({
                message: "Email verified successfully. You can now log in.",
                alreadyVerified: true,
            });
        }

        if (
            user.verificationTokenExpires &&
            user.verificationTokenExpires <= new Date()
        ) {
            return res.status(400).json({
                message: "This activation link has expired. Request a new one from the login page.",
                code: "TOKEN_EXPIRED",
            });
        }

        user.isVerified = true;
        await user.save();

        res.status(200).json({
            message: "Email verified successfully. You can now log in.",
        });
    } catch (err) {
        res.status(500).json({ message: "Verification failed", error: err.message });
    }
});

router.post("/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(200).json({
                message:
                    "If an unverified account exists for this email, a new activation link was sent.",
            });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: "This account is already activated." });
        }

        await setVerificationToken(user);

        res.status(200).json({
            message: "A new activation link was sent to your email.",
        });
    } catch (err) {
        if (err instanceof ActivationEmailSendError) {
            return res.status(503).json({ message: err.message });
        }
        res.status(500).json({
            message: "Could not resend activation email",
            error: err.message,
        });
    }
});

router.post("/login", verifyRecaptchaMiddleware, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (user.isVerified === false) {
            return res.status(403).json({
                message:
                    "Please activate your account using the link sent to your email before logging in.",
                code: "EMAIL_NOT_VERIFIED",
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ message: "Server configuration error" });
        }

        const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
        if (adminEmail && user.email.trim().toLowerCase() === adminEmail && user.role !== "admin") {
            user.role = "admin";
            await user.save();
        }

        const token = jwt.sign(
            {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role || "user",
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
        );

        user.sessionTokenHash = hashSessionToken(token);
        await user.save();

        setAuthCookie(res, token);

        res.status(200).json({
            message: "Login successful",
            username: user.username,
            email: user.email,
            role: user.role || "user",
        });
    } catch (err) {
        res.status(500).json({ message: "Login failed", error: err.message });
    }
});

router.post("/logout", async (req, res) => {
    const token = readAuthToken(req);
    if (token && process.env.JWT_SECRET) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            await User.findByIdAndUpdate(decoded.id, {
                $unset: { sessionTokenHash: 1 },
            });
        } catch {
            // Cookie may already be invalid; still clear it
        }
    }

    clearAuthCookie(res);
    res.status(200).json({ message: "Logged out" });
});

router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("username email role");
        if (!user) {
            clearAuthCookie(res);
            return res.status(401).json({ message: "Unauthorized" });
        }

        res.status(200).json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role || "user",
            },
        });
    } catch {
        res.status(500).json({ message: "Could not load session" });
    }
});

module.exports = router;
