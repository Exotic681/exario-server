
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 50;
const rooms = new Map();

function listRooms() {
  return [...rooms.values()].map(r => ({
    id: r.id,
    name: r.name,
    players: r.players.size,
    maxPlayers: MAX_PLAYERS
  }));
}

function broadcastList() {
  io.emit("servers:list", listRooms());
}

function createRoom() {
  const id = randomUUID().slice(0, 8);
  const room = {
    id,
    name: `Cosmic Arena ${id.toUpperCase()}`,
    players: new Map(),
    emptyTimer: null
  };
  rooms.set(id, room);
  return room;
}

function leaveRoom(socket) {
  const id = socket.data.roomId;
  if (!id) return;

  const room = rooms.get(id);
  delete socket.data.roomId;
  if (!room) return;

  room.players.delete(socket.id);
  socket.leave(id);

  io.to(id).emit("server:players", {
    id,
    players: room.players.size,
    maxPlayers: MAX_PLAYERS
  });

  if (room.players.size === 0) {
    room.emptyTimer = setTimeout(() => {
      if (rooms.get(id)?.players.size === 0) {
        rooms.delete(id);
        broadcastList();
      }
    }, 15000);
  }

  broadcastList();
}

app.get("/", (req, res) => {
  res.json({
    game: "Nexor.io",
    status: "online",
    connected: io.engine.clientsCount,
    servers: listRooms()
  });
});

app.get("/api/servers", (req, res) => {
  res.json(listRooms());
});

io.on("connection", socket => {
  socket.emit("servers:list", listRooms());

  socket.on("servers:list", () => {
    socket.emit("servers:list", listRooms());
  });

  socket.on("servers:join", (data = {}, callback) => {
    const reply = typeof callback === "function"
      ? callback
      : () => {};

    let room = data.serverId
      ? rooms.get(String(data.serverId))
      : [...rooms.values()].find(r => r.players.size < MAX_PLAYERS);

    if (data.serverId && !room) {
      return reply({ ok: false, error: "Server not found." });
    }

    if (room && room.players.size >= MAX_PLAYERS) {
      return reply({ ok: false, error: "Server is full." });
    }

    if (!room) room = createRoom();

    if (socket.data.roomId) leaveRoom(socket);
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    room.emptyTimer = null;

    const name = String(data.name || "CosmoPlayer")
      .replace(/[<>]/g, "")
      .slice(0, 16);

    room.players.set(socket.id, { id: socket.id, name });
    socket.data.roomId = room.id;
    socket.join(room.id);

    reply({
      ok: true,
      server: {
        id: room.id,
        name: room.name,
        players: room.players.size,
        maxPlayers: MAX_PLAYERS
      }
    });

    io.to(room.id).emit("server:players", {
      id: room.id,
      players: room.players.size,
      maxPlayers: MAX_PLAYERS
    });

    broadcastList();
  });

  socket.on("servers:leave", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Nexor.io online on port ${PORT}`);
});
