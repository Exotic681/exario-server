
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 50;
const EMPTY_SERVER_DELAY = 15000;

const servers = new Map();

function createServerRoom() {
    const id = randomUUID().slice(0, 8);
    const room = {
        id,
        name: `Cosmic Arena #${servers.size + 1}`,
        players: new Map(),
        createdAt: Date.now(),
        emptyTimer: null
    };

    servers.set(id, room);
    console.log("Server created:", room.name);
    return room;
}

function publicServerList() {
    return [...servers.values()]
        .filter(room => room.players.size > 0)
        .map(room => ({
            id: room.id,
            name: room.name,
            players: room.players.size,
            maxPlayers: MAX_PLAYERS,
            status: "online"
        }))
        .sort((a, b) => a.players - b.players);
}

function updateLists() {
    io.emit("servers:list", publicServerList());
}

function getAvailableServer() {
    for (const room of servers.values()) {
        if (room.players.size < MAX_PLAYERS) {
            return room;
        }
    }

    return createServerRoom();
}

function leaveServer(socket) {
    const id = socket.data.serverId;
    if (!id) return;

    const room = servers.get(id);
    delete socket.data.serverId;

    if (!room) return;

    room.players.delete(socket.id);
    socket.leave(id);

    io.to(id).emit("server:players", {
        serverId: id,
        players: room.players.size,
        maxPlayers: MAX_PLAYERS
    });

    if (room.players.size === 0) {
        room.emptyTimer = setTimeout(() => {
            const current = servers.get(id);

            if (current && current.players.size === 0) {
                servers.delete(id);
                console.log("Server removed:", current.name);
                updateLists();
            }
        }, EMPTY_SERVER_DELAY);
    }

    updateLists();
}

app.get("/", (req, res) => {
    res.json({
        game: "Nexor.io",
        status: "online",
        connectedPlayers: io.engine.clientsCount,
        servers: publicServerList()
    });
});

app.get("/api/servers", (req, res) => {
    res.json(publicServerList());
});

io.on("connection", socket => {
    console.log("Connected:", socket.id);

    socket.emit("servers:list", publicServerList());

    socket.on("servers:list", () => {
        socket.emit("servers:list", publicServerList());
    });

    socket.on("servers:join", (data, callback) => {
        const reply = typeof callback === "function"
            ? callback
            : () => {};

        if (socket.data.serverId) {
            leaveServer(socket);
        }

        let room;

        if (data && typeof data.serverId === "string") {
            room = servers.get(data.serverId);

            if (!room) {
                return reply({
                    ok: false,
                    error: "Ce serveur n'existe plus."
                });
            }

            if (room.players.size >= MAX_PLAYERS) {
                return reply({
                    ok: false,
                    error: "Ce serveur est complet."
                });
            }
        } else {
            room = getAvailableServer();
        }

        if (room.emptyTimer) {
            clearTimeout(room.emptyTimer);
            room.emptyTimer = null;
        }

        const name = String(data?.name || "CosmoPlayer")
            .replace(/[<>]/g, "")
            .trim()
            .slice(0, 16) || "CosmoPlayer";

        room.players.set(socket.id, {
            id: socket.id,
            name
        });

        socket.data.serverId = room.id;
        socket.join(room.id);

        reply({
            ok: true,
            server: {
                id: room.id,
                name: room.name,
                players: room.players.size,
                maxPlayers: MAX_PLAYERS
            },
            playerId: socket.id
        });

        io.to(room.id).emit("server:players", {
            serverId: room.id,
            players: room.players.size,
            maxPlayers: MAX_PLAYERS
        });

        io.to(room.id).emit("server:player-joined", {
            id: socket.id,
            name
        });

        updateLists();
        console.log(`${name} joined ${room.name}`);
    });

    socket.on("servers:leave", () => {
        leaveServer(socket);
    });

    socket.on("disconnect", () => {
        leaveServer(socket);
        console.log("Disconnected:", socket.id);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Nexor.io running on port ${PORT}`);
});
