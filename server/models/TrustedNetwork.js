const mongoose = require("mongoose");

const trustedNetworkSchema = new mongoose.Schema({
    label: { type: String, default: "Trusted network" },
    /** CIDR for this LAN, e.g. 192.168.1.0/24 — one record per subnet */
    subnet: { type: String, required: true, unique: true },
    gatewayIp: { type: String },
    registeredFromIp: { type: String, required: true },
    /** First user to register this subnet — network admin for settings only */
    registeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    registeredAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TrustedNetwork", trustedNetworkSchema);
