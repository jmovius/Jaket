// Setting everything up
var http = require("http");
var express = require("express");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var expressSession = require("express-session");
var app = express();

var myCookieParser = cookieParser("f4tk4t4u");
var sessionStore = new expressSession.MemoryStore();

var redis = require("redis");
var rdb = redis.createClient();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(myCookieParser);
app.use(expressSession({
	secret: "f4tk4t4u",
	store: sessionStore,
	resave: true,
	saveUninitialized: true
}));

var server = http.Server(app);
var socketIO = require("socket.io");
var io = socketIO(server);

var SessionSockets = require("session.socket.io");
var sessionSockets = new SessionSockets(io, sessionStore, myCookieParser);

// Loads index.html inside /client folder
app.use(express.static(__dirname + "/client")); // Apparently this line has to be here for sessions to work. Took 7 hours to figure that out.

/////////////////////////////////////////////////////////////////////////////////////////////////////

// Maximum number of players per room. Games can start with fewer players if 30 second timer goes up.
var MAX_PLAYERS = 3;


var openRoomID = 0; // Current room index that is accepting players
var waitTime = 0;   // Amount of time remaining in the open room before a game forcibly starts
// Collection of all existing rooms. Holds list of users connected to it, number of spoons on table, and a personal timer element.
var rooms = {"0": {"users": {}, "spoons": 0, "timer": 0}};  
// Collection of connected sockets. Format: USERNAME => SOCKET
var userToSocket = {};

//=============================================================================
// Creating a standard 52 deck of cards
//=============================================================================

// Initialize deck of cards.
var deckSchema = {
	suits: ["s", "c", "d", "h"],
	values: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"]
};

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
};

// Array shuffle function. Used to shuffle deck of cards.
// Source: http://jsfromhell.com/array/shuffle
var shuffle = function (o) {
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
};

var baseDeck = initDeck(deckSchema); // Deck Initialized

// A new shuffled deck is created. The slice(0) ensures a clone of baseDeck so that baseDeck is not modified by the sort.
var shuffledDeck = shuffle(baseDeck.slice(0)); 


function closeRoom(){
	// Send messages to all users in the room
	Object.keys(rooms[openRoomID].users).forEach(function (uname, index, users){
		sock = userToSocket[uname];
		sock.emit("playerIndex", index);
		sock.emit("gameStart");
		sock.emit("usersInRoom", users);
	});
	// Prepare the cards for the room
	prepGame(openRoomID);

	openRoomID++;
	rooms[openRoomID] = {"users": {}, "spoons": 0, "timer": 0};
}


function prepGame(roomID){
	var room = rooms[roomID],
		users = room.users;
	var deck = shuffle(baseDeck.slice(0));

	// Deal out the players' hands
	for (var i = 0; i < Object.keys(users).length; i++){
		var name = Object.keys(users)[i],
			user = users[name];
		user.hand = deck.splice(0,4);
		userToSocket[name].emit("playerHand", user.hand);
	}
	// Give remaining deck to first player's pile
	Object.keys(users)[0].pile = deck;
}

//=============================================================================
// Socket.IO
//=============================================================================

// Server receives connection from a client
sessionSockets.on("connection", function (err, socket, session){
	//--[ Note ]--------------------------------------------
	// Create data for session: session.<var> = <obj>
	// Then save the data for the session: session.save()
	//------------------------------------------------------

	console.log("some client connected; username: " + session.username);

	// ***** SOCKET.ON("USERNAME", ...) ***** BEGIN
	// Client, with accepted username, is looking for a room to join
	console.log("user " + session.username + " connected.");
	// Associate username with socket object
	userToSocket[session.username] = socket;
	// Save user session by initalizing data
	session.room = openRoomID;
	session.uid = socket.id;
	session.save();

	var userData = {hand: [], pile: [], hasSpoon: false};

	// Add user session to the open room
	rooms[openRoomID].users[session.username] = userData;
	// If room is full now
	var roomsize = Object.keys(rooms[openRoomID].users).length;
	if (roomsize === MAX_PLAYERS){
		closeRoom();
	} else {
		if (roomsize > 1) {
			waitTime = 30;
		} else {
			waitTime = 0;
		}
		// Send message to all users in the room
		Object.keys(rooms[openRoomID].users).forEach(function (user, index, users){
			userToSocket[user].emit("usersInRoom", users);
			userToSocket[user].emit("time", waitTime);
		});
	}
	// ***** SOCKET.ON("USERNAME", ...) ***** END

	// Client disconnects
	socket.on("disconnect", function(){
		// If the user didn't input a name, don't process any further
		if (!session.username) return;

		console.log(session.username + " disconnected with socket id: " + socket.id);
		// Delete presence of the username being logged in
		delete userToSocket[session.username];
		// Get the room this user was in
		var roomid = session.room;
		// Get all users in this room
		var users = rooms[roomid].users;
		// Delete the user from the room
		delete rooms[roomid].users[session.username];
		// No more users in the room, so we can delete it
		if (Object.keys(users).length === 0){
			delete rooms[roomid];
		} else {
			// Send message to all users in the room about disconnect
			Object.keys(users).forEach(function (uname, index, players){
				userToSocket[uname].emit("usersInRoom", players);
				// If only one user left, remove the timer
				if (players.length === 1)
					userToSocket[uname].emit("time", 0);
			});
		}
	});

//--------------------------------------------
// In game messages
//--------------------------------------------
	// User is requesting the top card
	socket.on("reqTopCard", function (){
		// Get first item in user's pile (user.pile[0])
		//socket.emit("getTopCard", card);
	});

	// User chose a card to discard and pass to the player on the left
	socket.on("discard", function (index){
		// Get the card based on the index (0-3 = hand, -1 = top card of pile)
		// Put top card in hand if necessary
		// Find user to the left, which should be a simple add one and modulo
		// Put discarded card on end of pile (user.pile.push)

		// At this point, if anyone's piles just changed from being empty, alert them
		// usersToSocket[username].on("addPile")
	});

	// User is attempting to get the spoon located at some index
	socket.on("getSpoon", function (index){
		// Check if 4 of a Kind in hand or if the number of spoons is not at maximum

		// If valid, confirm taking the spoon by telling all users
		//io.emit("removeSpoon", index, thisUser);
		
		// Otherwise, penalize the player
		//socket.emit("penalty");
	});


});

//=============================================================================
// Connect to Redis Database
//=============================================================================

// server establishes connection with Redis server
rdb.on("connect", function(){
	"use strict";
	console.log("Connected to Redis server");
});

//=============================================================================
// AJAX request and responses
//=============================================================================

app.get("/", function (req, res) {
	"use strict";

	console.log("isAuthorized: " + req.session.isAuthorized);

	if(req.session.isAuthorized) {
        res.sendFile(__dirname + "/client/default.html");
	} else {
        res.redirect("/login");
	}
});

app.get("/register", function (req, res) {
	"use strict";

	res.sendFile(__dirname + "/client/register.html");
});

app.post("/register", function (req, res){
	"use strict";

	console.log("Username: " + req.body.username.toLowerCase() + "\nPassword: " + req.body.password);

	rdb.exists(req.body.username.toLowerCase(), function (err, reply) {
		if(err) {
			console.log(err);
			return res.json({ msg:"Server was unable to complete the registration. Please try again."})
		}

	    if (reply === 1) {
			return res.json({ msg:"Username already exists." });
	    } else {
	    	rdb.hmset(req.body.username.toLowerCase(), {
    			"password": req.body.password,
    			"rank":"0",
    			"gamesPlayed": "0"
			});
	    	req.body.password;
	    	return res.json({ msg:"success" })
	    }
	});
});

app.get("/login", function (req, res) {
	"use strict";

	res.sendFile(__dirname + "/client/login.html");
});

app.get("/logout", function (req, res) {
	"use strict";

	req.session.destroy();
	res.sendFile(__dirname + "/client/login.html");
});

// User is checking to connect to server with username. Check if available username.
app.post("/login", function (req, res){
	"use strict";

	var un = req.body.username.toLowerCase();

	console.log("Username: " + un + "\nPassword: " + req.body.password);
	rdb.hgetall(un, function (err, user) {
		if(err) {
			console.log(err);
			return res.json({ msg:"Server was unable to complete the login. Please try again." })
		}

		if (user !== null) {
			if(user.password === req.body.password) {
				console.log(user);
				req.session.isAuthorized = true;
				req.session.username = un;
				req.session.rank = user.rank;
				req.session.gamesPlayed = user.gamesPlayed;
				
				return res.json({ msg:"success" });
			} else {
				req.session.isAuthorized = false;
				console.log("Incorrect Password - isAuthorized: " + req.session.isAuthorized);
				return res.json({ msg:"Invalid username/password." });
			}
		} else {
			req.session.isAuthorized = false;
			return res.json({ msg:"Invalid username/password." });
		}
	});
});

//=============================================================================
// Interval functions
//=============================================================================

// Wait Room timer. Decreases wait time each second and automatically starts the game if not
// enough users are connected.
setInterval(function(){
	// If more than one user in the room
	if (Object.keys(rooms[openRoomID].users).length > 1){
		// Decrease the timer. If elapsed, forcibly start the game.
		waitTime--;
		if (waitTime === 0){
			closeRoom();
		}
	}
}, 1000);



// Prints out server stats every 5 seconds. Can be removed in final version.
setInterval(function(){
	//console.log("Games in progress: " + inGameRooms.length);
	console.log("Open Room ID: " + openRoomID);
	console.log("Number of users in this room: " + Object.keys(rooms[openRoomID].users).length);
	console.log("Wait time remaining: " + waitTime);
}, 5000);


//=============================================================================
// Start-up the server
//=============================================================================

// Start the server
server.listen(3000);
console.log("Server listening on port 3000...");