const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = {}; // roomId -> { socketId: { userId, name } }

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join-room", ({ roomId, userId, name }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.userName = name;

    if (!rooms[roomId]) rooms[roomId] = {};

    // Send the new user a list of everyone already in the room
    const existingUsers = Object.values(rooms[roomId]);
    socket.emit("existing-users", existingUsers);

    // Tell everyone else this person joined
    socket.to(roomId).emit("user-connected", { userId, name });

    // Now add this user to the room
    rooms[roomId][socket.id] = { userId, name };

    console.log(`${name} joined room ${roomId}. Total: ${Object.keys(rooms[roomId]).length}`);
  });

  // Relay WebRTC signals
  socket.on("signal", ({ to, from, signal, name }) => {
    // find socket with matching userId
    const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === to);
    if (targetSocket) {
      targetSocket.emit("signal", { from, signal, name: socket.userName });
    }
  });

  // Chat relay
  socket.on("chat", ({ roomId, name, msg }) => {
    socket.to(roomId).emit("chat-message", { name, msg });
  });

  socket.on("disconnect", () => {
    const { roomId, userId, userName } = socket;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId][socket.id];
      socket.to(roomId).emit("user-disconnected", { userId, name: userName });
      console.log(`${userName} left room ${roomId}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Nyx Meet server running at http://localhost:${PORT}`);
});
