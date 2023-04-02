import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import * as http from "http";
import { Server } from "socket.io";
import cors from "cors";

import { Game } from "./game";

const app = express();
app.use(cors());
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
	cors: {
		origin: "*",
	},
});

interface gameStorage {
	[key: string]: Game;
}

const games: gameStorage = {};

app.get("/", (req, res) => {
	res.send("Hello World!");
});

io.on("connection", (socket) => {
	socket.on("createGame", () => {
		const game = new Game();
		games[game.getID()] = game;
		socket.emit("gameCreated", game.getID());
	});

	socket.on("joinGame", (gameID: string) => {
		const game = games[gameID];
		const clients = io.sockets.adapter.rooms.get(gameID);
		const roomSize = clients ? clients.size : 0;
		if (game && roomSize < 4) {
			socket.emit("gameJoined", game.state);
		} else {
			socket.emit("gameNotFound", gameID);
		}
	});
});

httpServer.listen(3001, () => {
	console.log("listening on *:3001");
});
