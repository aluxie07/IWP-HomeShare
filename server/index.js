require("dotenv").config();

const mongoose = require("mongoose");

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

app.get("/", (req, res) => {
    res.send("Backend running");
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});