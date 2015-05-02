// Setting everything up
var express = require("express"),
	app = express(),
    http = require("http").Server(app),
	sio = require("socket.io")(http),
    redis = require("redis"),
    bodyParser = require("body-parser"),
    client = redis.createClient();

// Maximum number of players per room. Games can start with fewer players if 30 second timer goes up.
var MAX_PLAYERS = 2;

// Loads index.html inside /client folder
app.use(express.static(__dirname + "/client"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Socket.IO things============================================================
var openRoomID = 0;
var waitTime = 30;
var inGameRooms = [];
var userToSocket = {};

// Server receives connection from a client
sio.on("connection", function (socket){
	"use strict";
	console.log("user connected");

	// Client disconnects
	socket.on("disconnect", function(){
		console.log("user disconnected with socket id: " + socket.id);
		// Remove the user from the room
		client.hmget(socket.id, "room", "username", function (e, datalist){
			client.lrem("roomusers" + datalist[0], 1, datalist[1]);
			// Remove user from database
			client.hget(socket.id, "username", function (e, name){
				client.del(name);
				client.del(socket.id);
				// Refresh player list in waiting room
				client.lrange("roomusers" + datalist[0], 0, -1, function (e, array){
					array.forEach(function (e, i, a){
						userToSocket[e].emit("usersInRoom", array);
					});
				});
			});
		});
	});

	// Client, with accepted username, is looking for a room to join
	socket.on("username", function (username) {
		console.log("user " + username + " connected.");
		// Associate username with socket object
		userToSocket[username] = socket;
		// Save socket in database based on socket ID
		client.hmset(socket.id, "username", username, "room", openRoomID, "hand", 0, "pile", 0, "spoon", 0);
		client.set(username, socket.id);
		// Add user to the open room
		client.rpush("roomusers" + openRoomID, username, function (e){
			// If room is full, proceed to move to the actual game
			client.llen("roomusers" + openRoomID, function (e, numUsers){
				// Room is at max players, start the game
				if (numUsers === MAX_PLAYERS){
					client.lrange("roomusers" + openRoomID, 0, -1, function (e, array){
						array.forEach(function (e, i, a){
							userToSocket[e].emit("usersInRoom", array);
						});
					});
					sio.emit("gameStart");
					inGameRooms.push(openRoomID);
					openRoomID++;
				} else {
					if (numUsers > 1) { // Found a player, now allow 30 seconds for more players to show up
						waitTime = 30;
					}
					client.lrange("roomusers" + openRoomID, 0, -1, function (e, array){
						array.forEach(function (e, i, a){
							userToSocket[e].emit("usersInRoom", array);
						});
					});
				}
			});
		});
	});

});
//=============================================================================

// Start the server
http.listen(3000);


// server establishes connection with Redis server
client.on("connect", function(){
	"use strict";
	console.log("Connected to Redis server");
});


// User is checking to connect to server with username. Check if available username.
app.post("/connect", function (req, res){
	"use strict";
	var username = req.body.username;
	client.exists(username, function(e, r){
		if (e){
			console.error(e);
			res.json(0);
		} else if (r !== 0){
			// Username is already in use
			res.json(-1);
		} else { // Username is available
			// Check if a room is open
			var roomUsers = "roomusers" + openRoomID;
			client.exists(roomUsers, function (e, result){
				if (e){
					console.error(e);
				} else if (result !== 0) { // Romm exists, check if open still
					client.llen(roomUsers, function (e, users){
						if (users === MAX_PLAYERS){
							// Make a new open room
							openRoomID++;
						}
					});
				}
			});
			// Valid username
			res.json(1);
		}
	});
});

setInterval(function(){
	console.log("Games in progress: " + inGameRooms.length);
	console.log("Open Room ID: " + openRoomID);
	client.llen("roomusers" + openRoomID, function (e, num){
		console.log("Number of users in this room: " + num);
	});
	console.log("Wait time remaining: " + waitTime);
}, 5000);

setInterval(function(){
	client.llen("roomusers" + openRoomID, function (e, num){
		if (num > 1){
			waitTime--;
		}
	});
}, 1000);

// Array shuffle function. Used to shuffle deck of cards.
// Source: http://jsfromhell.com/array/shuffle
function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
};

console.log("Server listening on port 3000...");