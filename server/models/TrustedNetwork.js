const mongoose = require("mongoose");

const trustedNetworkSchema = new mongoose.Schema({
    label: { type: String, default: "Trusted network" },
    subnet: { type: String, required: true },
    gatewayIp: { type: String },
    registeredFromIp: { type: String, required: true },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    registeredAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TrustedNetwork", trustedNetworkSchema);
