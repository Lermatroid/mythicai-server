import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import * as http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { nanoid } from "nanoid";
import { ChatGPTAPI } from "chatgpt";

const api = new ChatGPTAPI({
	apiKey: process.env.OPENAI_API_KEY as string,
	completionParams: {
		temperature: 0.7,
		top_p: 1,
		max_tokens: 256,
	},
});

// intro to the game
// let res = await api.sendMessage("Give the theme of the dungeon and name the two characters. Give the introduction up until the first challenge. Begin.ad", {
// 	systemMessage:
// 		"You are a DND Dungeon Master. Lets play a small dungeon involving two players. Only read out relevant attributes of the character. Randomize all aspects of a DND character sheet for the character.",
// });

export interface messageItem {
	name: string;
	message: string;
	isSystemMessage: boolean;
	isFromAI: boolean;
}

export interface gameState {
	allowMessageSending: boolean;
	hasStarted: boolean;
	players: string[];
}

export default class Game {
	gameID = nanoid();
	prevMsgID: string | null = null;
	state: gameState = {
		allowMessageSending: false,
		hasStarted: false,
		players: [],
	};
	messages: messageItem[] = [
		{ name: "System", message: "Welcome to the game!", isSystemMessage: true, isFromAI: false },
	];

	constructor() {
		console.log("Game constructor");
	}

	addMessage(from: string, msg: string, isSystem: boolean) {
		this.messages.push({
			name: from,
			message: msg,
			isSystemMessage: isSystem,
			isFromAI: false,
		});
		return this.messages[-1];
	}

	joinGame(name: string) {
		this.addMessage("System", `${name} has joined the game!`, true);
		this.state.players.push(name);
		this.state.allowMessageSending = false;
		this.state.hasStarted = false;
	}

	async addOpenAIMessage(msg: string) {
		console.log("New message data: ", msg);
		// Query the Open AI API here, needs to pass along this.parentId

		// send a message and wait for the response
		// first msg does not have a parentId

		// res = await api.sendMessage(msg, {
		// 	parentMessageId: res.id,
		// });

		if (this.prevMsgID) {
			const res = await api.sendMessage(msg, {
				parentMessageId: this.prevMsgID,
			});
			this.prevMsgID = res.id;
			this.messages.push({
				name: "AI",
				message: res.text,
				isSystemMessage: false,
				isFromAI: true,
			});
		} else {
			const res = await api.sendMessage(msg);
			this.prevMsgID = res.id;
			this.messages.push({
				name: "AI",
				message: res.text,
				isSystemMessage: false,
				isFromAI: true,
			});
		}

		return this.messages[-1];
	}

	getMessages() {
		return this.messages;
	}

	getLatestMessage() {
		return this.messages[-1];
	}

	getID() {
		return this.gameID;
	}
}

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

	socket.on("requestGameMessageLog", (gameID: string) => {
		const game = games[gameID];
		if (game) {
			socket.emit("gameMessageLog", game.messages);
		}
	});

	socket.on("joinGame", (gameID: string) => {
		const game = games[gameID];
		const clients = io.sockets.adapter.rooms.get(gameID);
		const roomSize = clients ? clients.size : 0;
		if (game) {
			socket.join(gameID);
			socket.emit("gameJoined", game.state);
		} else {
			socket.emit("gameNotFound", gameID);
		}
	});

	socket.on("postNewMessageToGPT", async (data) => {
		if (data.gameID) {
			const game = games[data.gameID];
			if (game) {
				const resultingMessage = await games[data.gameID].addOpenAIMessage(data.message);
				io.to(data.gameID).emit("updatedMessages", games[data.gameID].getMessages());
			}
		}
	});

	socket.on("gameStart", (gameID: string) => {
		const game = games[gameID];
		const clients = io.sockets.adapter.rooms.get(gameID);
		const roomSize = clients ? clients.size : 0;
		if (game) {
			game.state.hasStarted = true;
			game.state.allowMessageSending = true;
			socket.emit("gameStarted", game.state);
		} else {
			socket.emit("gameNotFound", gameID);
		}
	});
});

httpServer.listen(3001, () => {
	console.log("listening on *:3001");
});
