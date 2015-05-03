// Setting everything up
var http = require('http');  
var express = require('express');
var cookieParser = require('cookie-parser');  
var socketIO = require('socket.io');  
var expressSession = require('express-session');  
var SessionSockets = require('session.socket.io');  
var sessionStore = new expressSession.MemoryStore();  
var app = express();
var server =  http.Server(app);
var io = socketIO(server);  
var bodyParser = require("body-parser");
var redis = require("redis");
var client = redis.createClient();

// Maximum number of players per room. Games can start with fewer players if 30 second timer goes up.
var MAX_PLAYERS = 2;

// Initialize deck of cards.
var deckSchema = {
	suits: ["s", "c", "d", "h"],
	values: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"]
}
var initDeck = function (deck) {
	var i, k,
		retDeck = [],
		lenSuits = deck.suits.length,
		lenVals = deck.values.length;

	for(i = 0; i < lenSuits; i++) {
		for(k = 0; k < lenVals; k++) {
			retDeck.push({ suit:deck.suits[i], value:deck.values[k] });
		}
	}
	return(retDeck);
}
// Array shuffle function. Used to shuffle deck of cards.
// Source: http://jsfromhell.com/array/shuffle
var shuffle = function (o) {
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
};
var baseDeck = initDeck(deckSchema); // Deck Initialized
//shuffledDeck = shuffle(baseDeck); // A new shuffled deck is created.

// Loads index.html inside /client folder
app.use(express.static(__dirname + "/client"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

var myCookieParser = cookieParser('test');

app.use(myCookieParser);
app.use(expressSession( {secret: 'test', store: sessionStore} ));

var sessionSockets = new SessionSockets(io, sessionStore, myCookieParser);

// Socket.IO things============================================================
var openRoomID = 0;
var waitTime = 30;
var rooms = {"0": {"users": [], "spoons": 0}};
var userToSocket = {};

// Server receives connection from a client
sessionSockets.on("connection", function (err, socket, session){
	// Create data for session: session.<var> = <obj>
	// Then save the data for the session: session.save()
	session.foo = "bar";
	session.save();

	"use strict";
	console.log("some client connected");

	// Client disconnects
	socket.on("disconnect", function(){
		console.log("user disconnected with socket id: " + socket.id);
		// Remove the user from the room
		var users = rooms[openRoomID].users;
		var i = users.indexOf(socket);
		users.splice(i, 1);
		// Send message to all users in the room
		users.forEach(function (sock, index, list){
			sock.emit("usersInRoom", list);
		});
	});

	// Client, with accepted username, is looking for a room to join
	sessionSockets.on("username", function (username) {
		console.log("user " + username + " connected.");
		// Associate username with socket object
		userToSocket[username] = socket;
		// Save user session by initalizing data
		session.hand = [];
		session.pile = [];
		session.spoon = false;
		session.room = openRoomID;
		session.username = username;
		session.uid = socket.id;
		session.save();

		// Add user session to the open room
		rooms[openRoomID].users.push(session);
		// If room is full now
		var roomsize = rooms[openRoomID].users.length;
		if (roomsize === MAX_PLAYERS){
			// Send messages to all users in the room
			rooms[openRoomID].users.forEach(function (sock, index, users){
				sock.emit("playerIndex", index);
				sock.emit("gameStart");
				sock.emit("usersInRoom", users);
			});
			openRoomID++;
			rooms[openRoomID] = {"users": [], "spoons": 0};
		} else {
			if (roomsize > 1) {
				waitTime = 30;
			}
			// Send message to all users in the room
			rooms[openRoomID].users.forEach(function (sock, index, users){
				sock.emit("usersInRoom", users);
			});
		}
	});

});
//=============================================================================

// Start the server
server.listen(3000);


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
			// Valid username
			res.json(1);
		}
	});
});

setInterval(function(){
	//console.log("Games in progress: " + inGameRooms.length);
	console.log("Open Room ID: " + openRoomID);
	console.log("Number of users in this room: " + rooms[openRoomID].users.length);
	console.log("Wait time remaining: " + waitTime);
}, 5000);

setInterval(function(){
	if (rooms[openRoomID].users.length > 1){
		waitTime--;
	}
}, 1000);

console.log("Server listening on port 3000...");