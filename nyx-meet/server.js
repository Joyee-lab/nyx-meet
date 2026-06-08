const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// Track users in each room
const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // User joins a room
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(userId);

    // Tell existing users that a new user joined
    socket.to(roomId).emit("user-connected", userId);

    console.log(`User ${userId} joined room ${roomId}`);

    // Handle disconnect
    socket.on("disconnect", () => {
      rooms[roomId] = (rooms[roomId] || []).filter((id) => id !== userId);
      socket.to(roomId).emit("user-disconnected", userId);
      console.log(`User ${userId} left room ${roomId}`);
    });
  });

  // Relay WebRTC signaling messages
  socket.on("signal", ({ to, from, signal }) => {
    io.to(to).emit("signal", { from, signal });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Nyx Meet server running at http://localhost:${PORT}`);
});
