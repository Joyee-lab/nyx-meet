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
const roomHosts = {}; // roomId -> hostUserId

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join-room", ({ roomId, userId, name }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.userName = name;

    if (!rooms[roomId]) rooms[roomId] = {};

    // First person in room = host
    const isHost = Object.keys(rooms[roomId]).length === 0;
    if (isHost) roomHosts[roomId] = userId;
    socket.isHost = isHost;

    // Send new user the existing users list + who is host
    const existingUsers = Object.values(rooms[roomId]);
    socket.emit("existing-users", existingUsers);
    socket.emit("host-assigned", { hostId: roomHosts[roomId], isYou: isHost });

    // Tell everyone else this person joined
    socket.to(roomId).emit("user-connected", { userId, name });

    // Add to room
    rooms[roomId][socket.id] = { userId, name };
    console.log(`${name} (${isHost ? "HOST" : "guest"}) joined room ${roomId}`);
  });

  // Relay WebRTC signals
  socket.on("signal", ({ to, from, signal, name }) => {
    const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === to);
    if (targetSocket) targetSocket.emit("signal", { from, signal, name: socket.userName });
  });

  // Chat relay (public)
  socket.on("chat", ({ roomId, name, msg }) => {
    socket.to(roomId).emit("chat-message", { name, msg });
  });

  socket.on("screen-share-started", ({ roomId, userId, name }) => {
    socket.to(roomId).emit("screen-share-started", { userId, name });
  });

  socket.on("screen-share-stopped", ({ roomId, userId }) => {
    socket.to(roomId).emit("screen-share-stopped", { userId });
  });

  // Rename relay
  socket.on("rename", ({ roomId, userId, name }) => {
    socket.userName = name;
    // Update in rooms tracker
    if (rooms[roomId] && rooms[roomId][socket.id]) {
      rooms[roomId][socket.id].name = name;
    }
    socket.to(roomId).emit("user-renamed", { userId, name });
  });

  // DM relay
  socket.on("dm", ({ toUserId, fromName, msg }) => {
    const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === toUserId);
    if (targetSocket) {
      targetSocket.emit("dm-received", { fromId: socket.userId, fromName, msg });
    }
  });

  // Host mutes a participant
  socket.on("host-mute", ({ roomId, targetUserId }) => {
    if (roomHosts[roomId] !== socket.userId) return; // only host
    const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === targetUserId);
    if (targetSocket) targetSocket.emit("force-mute");
    socket.to(roomId).emit("participant-muted", { userId: targetUserId });
  });

  // Host allows a participant to unmute again
  socket.on("host-unmute", ({ roomId, targetUserId }) => {
    if (roomHosts[roomId] !== socket.userId) return; // only host
    const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === targetUserId);
    if (targetSocket) targetSocket.emit("force-unmute-allowed");
    socket.to(roomId).emit("participant-unmuted", { userId: targetUserId });
  });

  // Host kicks a participant
  socket.on("host-kick", ({ roomId, targetUserId }) => {
    if (roomHosts[roomId] !== socket.userId) return; // only host
    const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === targetUserId);
    if (targetSocket) {
      targetSocket.emit("you-were-kicked");
      targetSocket.leave(roomId);
    }
    io.to(roomId).emit("participant-kicked", { userId: targetUserId, name: targetSocket?.userName || "Someone" });
  });

  socket.on("disconnect", () => {
    const { roomId, userId, userName } = socket;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId][socket.id];
      socket.to(roomId).emit("user-disconnected", { userId, name: userName });
      // If host left, assign new host
      if (roomHosts[roomId] === userId) {
        const remaining = Object.values(rooms[roomId]);
        if (remaining.length > 0) {
          const newHost = remaining[0];
          roomHosts[roomId] = newHost.userId;
          io.to(roomId).emit("host-assigned", { hostId: newHost.userId, isYou: false });
          const newHostSocket = [...io.sockets.sockets.values()].find(s => s.userId === newHost.userId);
          if (newHostSocket) newHostSocket.emit("host-assigned", { hostId: newHost.userId, isYou: true });
        } else {
          delete roomHosts[roomId];
          delete rooms[roomId];
        }
      }
      console.log(`${userName} left room ${roomId}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Nyx Meet server running at http://localhost:${PORT}`);
});
