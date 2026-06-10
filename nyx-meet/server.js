const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {}; // roomId -> { userId: name }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, userId, name }) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][userId] = name;

    // Tell existing users about the new user
    socket.to(roomId).emit("user-connected", { userId, name });

    console.log(`${name} (${userId}) joined room ${roomId}`);

    socket.on("disconnect", () => {
      if (rooms[roomId]) delete rooms[roomId][userId];
      socket.to(roomId).emit("user-disconnected", { userId, name });
      console.log(`${name} left room ${roomId}`);
    });
  });

  // Relay WebRTC signals
  socket.on("signal", ({ to, from, signal }) => {
    // Find the name of the sender
    let senderName = "Guest";
    for (const room of Object.values(rooms)) {
      if (room[from]) { senderName = room[from]; break; }
    }
    io.to(to).emit("signal", { from, signal, name: senderName });
  });

  // Chat
  socket.on("chat", ({ roomId, name, msg }) => {
    socket.to(roomId).emit("chat-message", { name, msg });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Nyx Meet server running at http://localhost:${PORT}`);
});
