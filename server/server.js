const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const SECRET = "super_secret_key_change_this";

/* ================= USERS ================= */
const users = [
  {
    username: "admin",
    password: bcrypt.hashSync("admin123", 10),
    role: "admin"
  },
  {
    username: "user",
    password: bcrypt.hashSync("user123", 10),
    role: "user"
  }
];

/* ================= SERVICES STORAGE ================= */
const services = {
  pre: [],
  post: [],
  outdoor: [],
  reels: [],
  maternity: [],
  half: [],
  birthday: []
};

/* ================= LOGIN ================= */
app.post("/login", (req, res) => {
  const { username, password, role } = req.body;

  const user = users.find(
    u => u.username === username && u.role === role
  );

  if (!user) return res.json({ error: "Invalid credentials" });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.json({ error: "Invalid credentials" });

  const token = jwt.sign({ username, role }, SECRET, {
    expiresIn: "2h"
  });

  res.json({ token, role });
});

/* ================= AUTH MIDDLEWARE ================= */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/* ================= IMAGE UPLOAD ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "_" + file.originalname)
});

const upload = multer({ storage });

app.get("/images/:service", (req, res) => {
  res.json(services[req.params.service] || []);
});

app.post("/upload/:service", authenticate, upload.single("image"), (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admins only" });

  const s = req.params.service;
  const imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;
  services[s].push(imageUrl);

  res.json({ success: true });
});

app.delete("/delete/:service", authenticate, (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admins only" });

  const s = req.params.service;
  const { url } = req.body;

  services[s] = services[s].filter(img => img !== url);

  const fileName = url.split("/").pop();
  const filePath = path.join(__dirname, "uploads", fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.json({ success: true });
});

/* ================= REAL-TIME BOOKINGS ================= */
let bookings = [];

io.on("connection", socket => {

  socket.emit("allBookings", bookings);

  socket.on("newBooking", booking => {
    bookings.push(booking);
    io.emit("allBookings", bookings);
  });
});

/* ================= START SERVER ================= */
server.listen(5000, () => {
  console.log("Server running at http://localhost:5000");
});
