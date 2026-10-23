
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const ROOM_TIMEOUT = 30000;

// Salons publics réellement annoncés par les hôtes PeerJS.
const rooms = new Map();

function cleanCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function getPublicRooms() {
  const now = Date.now();

  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_TIMEOUT) {
      rooms.delete(code);
    }
  }

  return Array.from(rooms.values()).map(room => ({
    code: room.code,
    name: room.name,
    players: room.players,
    maxPlayers: room.maxPlayers,
    status: room.status
  }));
}

function broadcastRooms() {
  io.emit("public:rooms", getPublicRooms());
}

app.get("/", (req, res) => {
  res.json({
    game: "exar.io",
    status: "online",
    connected: io.engine.clientsCount,
    servers: getPublicRooms()
  });
});

app.get("/api/servers", (req, res) => {
  res.json(getPublicRooms());
});

io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  // Envoie la liste actuelle au nouveau client.
  socket.emit("public:rooms", getPublicRooms());

  socket.on("public:list", () => {
    socket.emit("public:rooms", getPublicRooms());
  });

  // L'hôte annonce son véritable salon PeerJS.
  socket.on("public:register", (data = {}) => {
    const code = cleanCode(data.code);

    if (!/^[A-Z0-9]{4,6}$/.test(code)) return;

    const maxPlayers = Math.max(
      2,
      Math.min(11, Math.floor(Number(data.maxPlayers) || 2))
    );

    const players = Math.max(
      1,
      Math.min(maxPlayers, Math.floor(Number(data.players) || 1))
    );

    const status = data.status === "game" ? "game" : "lobby";

    const previous = rooms.get(code);

    rooms.set(code, {
      code,
      name: String(data.name || "exar.io Arena")
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 30) || "exar.io Arena",
      players,
      maxPlayers,
      status,
      ownerId: socket.id,
      updatedAt: Date.now()
    });

    console.log(
      `Public room ${code}: ${players}/${maxPlayers} players (${status})`
    );

    // Le salon est actualisé, même si son état a changé.
    broadcastRooms();
  });

  // L'hôte retire son salon de la liste publique.
  socket.on("public:unregister", (data = {}) => {
    const code = cleanCode(data.code);
    const room = rooms.get(code);

    // Un autre client ne peut pas supprimer le salon de l'hôte.
    if (room && room.ownerId === socket.id) {
      rooms.delete(code);
      broadcastRooms();
      console.log(`Public room ${code} removed`);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Retire les salons appartenant à cette connexion.
    let changed = false;

    for (const [code, room] of rooms) {
      if (room.ownerId === socket.id) {
        rooms.delete(code);
        changed = true;
      }
    }

    if (changed) broadcastRooms();
  });
});

// Nettoyage périodique des annonces devenues obsolètes.
setInterval(() => {
  const before = rooms.size;
  getPublicRooms();

  if (rooms.size !== before) {
    broadcastRooms();
  }
}, 10000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`exar.io server running on port ${PORT}`);
});
