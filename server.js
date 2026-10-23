
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

// Route de test du serveur
app.get("/", (req, res) => {
    res.json({
        game: "Exar.io",
        status: "online",
        players: io.engine.clientsCount
    });
});

// Connexions des joueurs
io.on("connection", (socket) => {
    console.log("Joueur connecté :", socket.id);

    socket.emit("server:welcome", {
        message: "Bienvenue sur le serveur Exar.io !"
    });

    socket.on("disconnect", () => {
        console.log("Joueur déconnecté :", socket.id);
    });
});

// Démarrage du serveur
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur Exar.io lancé sur le port ${PORT}`);
});
