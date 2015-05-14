/* jshint node: true, curly: true, eqeqeq: true, forin: true, immed: true, indent: 4, latedef: true, newcap: true, nonew: true, quotmark: double, strict: true, undef: true, unused: true */
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
var MAX_PLAYERS = 8;


var openRoomID = 0; // Current room index that is accepting players
var waitTime = 0;   // Amount of time remaining in the open room before a game forcibly starts
// Collection of all existing rooms. Holds list of users connected to it, number of spoons on table, and a personal timer element.
var rooms = {"0": {"users": {}, "spoons": [], "timerRunning": false, "timeout": null}};  
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
	"use strict";
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
	"use strict";
	
	for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
	return o;
};

var baseDeck = initDeck(deckSchema); // Deck Initialized

//=============================================================================
// General methods
//=============================================================================

// Creates a new array of length "size" filled with the integer 1. Used for making an instance of spoons in the room.
function newOnesArray(size){
	"use strict";
	return new Array(size+1).join("1").split("").map(parseFloat);
}

// Removes the first spoon available in the room. Needed for when a user disconnects from the game.
function removeSomeSpoon(roomid){
	"use strict";
	var room = rooms[roomid],
		usernames = Object.keys(room.users),
		spoons = room.spoons;
	for (var i = 0; i < spoons.length; i++){
		// There is a spoon here
		if (spoons[i]){
			spoons[i] = 0;
			// Tell the users this spoon is gone now
			for (var j = 0; j < usernames.length; j++){
				userToSocket[usernames[j]].emit("removeSpoon", i, null);
			}
			break;
		}
	}
}

// How many spoons are left on the table?
function numberOfSpoons(roomid){
	"use strict";
	var room = rooms[roomid],
		spoons = room.spoons,
		count = 0;
	for (var i = 0; i < spoons.length; i++){
		// There is a spoon here
		if (spoons[i]){
			count++;
		}
	}
	return count;
}

// Return true if all 4 cards in the hand have the same value
function fourOfKind(cards){
	"use strict";

	var card = cards[0],
		value = card.value;
	for (var i = 1; i < 4; i++){
		card = cards[i];
		if (card.value !== value){
			return false;
		}
	}
	return true;
}

// After having set a timer on for the room, turn it off with this method called in a setTimeout
// This is needed to start the game. Alert the users that the game has started too.
function turnOffTimer(roomid){
	"use strict";

	var room = rooms[roomid],
		users = room.users,
		usernames = Object.keys(users);
	room.timerRunning = false;
	// Tell the users that the game started, even if their timers are still going down
	for (var i = 0; i < usernames.length; i++){
		userToSocket[usernames[i]].emit("time", 0);
	}

}

// Prepares the game by shuffling the deck and dealing out cards
function prepGame(roomid){
	"use strict";

	var room = rooms[roomid],
		users = room.users,
		usernames = Object.keys(users);
	// Shuffle deck of cards
	var deck = shuffle(baseDeck.slice(0));
	// Set the number of spoons in the room
	room.spoons = newOnesArray(usernames.length - 1);
	// Deal out the players' hands and resets variables
	for (var i = 0; i < usernames.length; i++){
		var name = usernames[i],
			user = users[name];
		user.hand = deck.splice(0,4);
		user.pile = [];
		user.hasSpoon = false;
		// Alert player of their hand and start the timer for when the game will begin
		userToSocket[name].emit("playerHand", user.hand);
		userToSocket[name].emit("time", 5);
		// Tell players how many spoons there are
		userToSocket[name].emit("numOfSpoons", usernames.length - 1);
	}
	// Give remaining deck to first player's pile (the dealer)
	var dealerName = usernames[0],
		dealer = users[dealerName];
	dealer.pile = deck;
	userToSocket[dealerName].emit("updatePile", false);
	// Set room timer to 5 seconds, indicating how long of a wait until game starts
	room.timerRunning = true;
	room.timeout = setTimeout(turnOffTimer, 5000, roomid);
}

// Close the waiting room and prepare for a new game
function closeRoom(){
	"use strict";

	var room = rooms[openRoomID],
		users = room.users,
		usernames = Object.keys(users),
		username;
	
	// Tell the users the game is starting and give them the final list of all players
	for (var i = 0; i < usernames.length; i++){
		// Puts the username of the receiving client at the end of the list; repeated for each user so that player order is maintained
		username = usernames[0];
		usernames.push(usernames.shift());
		userToSocket[username].emit("gameStart");
		userToSocket[username].emit("usersInRoom", usernames);
		rdb.hincrby(username, "gamesPlayed", 1);
	}
	// Prepare the cards for the room
	prepGame(openRoomID);
	// Make a new open room
	openRoomID++;
	rooms[openRoomID] = {"users": {}, "spoons": [], "timerRunning": false, "timeout": null};
}

// The brief pause between each round. Preps for the next round
function nextRound(roomid){
	"use strict";

	var room = rooms[roomid],
		users = room.users,
		usernames = Object.keys(users);
	// Move the previous dealer to the end of the users list by removing and adding back into the JSON. This makes the next user the dealer!
	var lastDealer = users[usernames[0]];
	delete users[usernames[0]];
	users[usernames[0]] = lastDealer;
	// Now make the preparations for the next game
	prepGame(roomid);
}

// Round has finished. Send results of the round to the users. The game is complete if two or fewer users remain by the time this is called.
function gameover(roomid){
	"use strict";

	var room = rooms[roomid],
		users = room.users,
		usernames = Object.keys(users),
		user;
	var gameComplete = (usernames.length === 2);

	// If only one user in this room, win by default (caused when all other players disconnect)
	if (usernames.length === 1){
		userToSocket[usernames[0]].emit("gameresult", null, true);
		rdb.hincrby(usernames[0], "wins", 1);
		clearTimeout(room.timeout);
	} else {
		// Evaluate each user to find the one who did not get the spoon
		var i = 0,
			j = 0;
		for (i; i < usernames.length; i++){
			user = users[usernames[i]];
			if (!user.hasSpoon){
				break;
			}
		}
		// Now tell the players the results
		for (j; j < usernames.length; j++){
			var uname = usernames[j];
			userToSocket[uname].emit("gameresult", usernames[i], gameComplete);
			// If this is the winner
			if (gameComplete && uname !== usernames[i]){
				rdb.hincrby(uname, "wins", 1);
				clearTimeout(room.timeout);
			}
		}
		// Set room timer to 8 seconds, indicating how long of a wait until next round (unless the game is over)
		// Note that I don't need to send the "time" message as this is handled client-side in the "gameresult" message
		if (!gameComplete){
			room.timerRunning = true;
			room.timeout = setTimeout(nextRound, 8000, roomid);
		}
	}
}






//=============================================================================
// Functions called by Socket.IO
// Mostly things related to joining and leaving rooms
//=============================================================================

// User is joining the waiting room
var joinLobby = function (session) {
	"use strict";

	// Save user session by initalizing data
	session.room = openRoomID;
	session.save();
	// The user data to be saved in the room
	var userData = {hand: [], pile: [], hasSpoon: false};
	// Add user session to the open room
	rooms[openRoomID].users[session.username] = userData;
	// If room is full now
	var roomsize = Object.keys(rooms[openRoomID].users).length;
	if (roomsize === MAX_PLAYERS){
		// Close the room and start the game
		closeRoom();
	} else {
		// If more than one player waiting in the room, reset the timer back to 30 seconds
		if (roomsize > 1) {
			waitTime = 30;
		} else { // Only one user here so stop the timer
			waitTime = 0;
		}
		// Send message to all users in the room
		Object.keys(rooms[openRoomID].users).forEach(function (user, index, users){
			userToSocket[user].emit("usersInRoom", users);
			userToSocket[user].emit("time", waitTime);
		});
	}
};

// Socket function to handle leaving a game lobby (waiting and active game). Reduces reusing code.
var leaveLobby = function (session, roomid, room, users, usernames) {
	"use strict";

	// Delete the user from the room
	delete rooms[roomid].users[session.username];
	session.room = null;
	// Send message to all users in the room about disconnect
	usernames = Object.keys(users); // Redo since we deleted a user
	usernames.forEach(function (uname, index, players){
		userToSocket[uname].emit("usersInRoom", players);
		// If only one user left, remove the timer
		if (players.length === 1){
			userToSocket[uname].emit("time", 0);
		}
	});
};
var leaveActiveGame = function (session, roomid, room, users, usernames, user) {
	"use strict";

	// True if the current game has finished
	var gameFinished = (numberOfSpoons(roomid) === 0 || usernames.length === 2);
	// The last user of the room is leaving
	if (usernames.length === 1){
		// We can delete the room and unassign the room to the user
		delete rooms[roomid];
		session.room = null;
		return;
	} else if (!gameFinished && room.timerRunning){ // Check if in the setup phase of the game (timer is counting down)
		// If the player was the dealer (first person in users array)
		if (usernames[0] === session.username){
			// Their hand and pile will shift to the next user
			users[usernames[1]].pile = users[usernames[1]].pile.concat(user.hand, user.pile);
			userToSocket[usernames[1]].emit("updatePile", false);
		} else { 
			// The player's hand will be sent to the bottom of the dealer's pile
			users[usernames[0]].pile = users[usernames[0]].pile.concat(user.hand);
		}
	} else if (!gameFinished){ // Currently IN game
		// Put player's pile and hand into next person's pile
		var seatid = usernames.indexOf(session.username),
			nextseatid = (seatid + 1) % usernames.length,
			nextplayer = users[usernames[nextseatid]];
		nextplayer.pile = nextplayer.pile.concat(user.hand, user.pile);
		// The player should be aware that their pile is loaded now
		userToSocket[usernames[nextseatid]].emit("updatePile", false);
	}
	// Tell clients that this user disconnected
	for (var i = 0; i < usernames.length; i++){
		// Can't tell the removed user that they disconnected for obvious reasons
		if (usernames[i] === session.username){
			continue;
		}
		userToSocket[usernames[i]].emit("removePlayer", session.username);
	}
	// Remove a spoon from the game
	if (!users[session.username].hasSpoon){
		removeSomeSpoon(roomid);
	}
	// Delete the user from the room
	delete rooms[roomid].users[session.username];
	session.room = null;

	// If doing this causes the game to end, end the game
	if (gameFinished || numberOfSpoons(roomid) === 0) {
		gameover(roomid);
	}
};
// NOTE: isDisconnect defaults to false; however, if true, it means the user is currently in a lobby
//		 and they have "registered users only" section of the website and their information
//		 is handled accordingly. If the user is not disconnecting (clicking the "Join Lobby" button),
//		 then no action should be taken.
var leaveGame = function (session, forced) {
	"use strict";

	// If not associated with a room (perhaps lost a game and is closing the window)
	if (session.room === null){
		// No need to do anything (completely harmless user)
		return;
	}
	// Get the room this user was in and its players
	var roomid = session.room,
		room = rooms[roomid],
		users = room.users,
		usernames = Object.keys(users),
		user = users[session.username];

	if (forced){
		// Delete the user from the room
		delete rooms[roomid].users[session.username];
		session.room = null;
		return;
	}

	// Check if player is in the waiting room.
	if (roomid === openRoomID){
		leaveLobby(session, roomid, room, users, usernames);
	} else { // Player is playing the game.
		leaveActiveGame(session, roomid, room, users, usernames, user);
	}
};

//=============================================================================
// Socket.IO
//=============================================================================

// Server receives connection from a client
sessionSockets.on("connection", function (err, socket, session){
	"use strict";

	if(typeof session === "undefined") {
		socket.emit("goToLogin");
		return;
	} else if(typeof session.username === "undefined") {
		socket.emit("goToLogin");
		return;
	}
	//--[ Note ]--------------------------------------------
	// Create data for session: session.<var> = <obj>
	// Then save the data for the session: session.save()
	//------------------------------------------------------
	console.log("user " + session.username + " connected.");
	// Associate username with socket object
	userToSocket[session.username] = socket;
	// Joins an active lobby.
	joinLobby(session);

	// Client disconnects
	socket.on("disconnect", function(){
		// If the user didn't input a name, don't process any further 
		// (pretty sure this is never true but who knows?)
		if (!session.username){
			return;
		}
		console.log(session.username + " disconnected with socket id: " + socket.id);
		// Call function to handle logic for leaving the game.
		leaveGame(session, false);
		// Delete presence of the username being logged in
		delete userToSocket[session.username];
	});

	// Send the player's stats which will be updated on the user info at the top right of the page
	socket.on("getMyStats", function (){
		// Get username from database
		rdb.hgetall(session.username, function (err, user) {
			if(err) {
				console.log(err);
			}
			// Username exists
			if (user !== null) {
				session.wins = user.wins;
				session.gamesPlayed = user.gamesPlayed;
				socket.emit("userStats", {username: session.username, gamesPlayed: session.gamesPlayed, wins: session.wins});
			}
		});
	});


	// User is leaving a game
	socket.on("leaveGame", function () {
		// If the user is not in a lobby and the user is not sitting in a losing game state.
		if(session.room !== openRoomID && session.room !== null) {
			leaveGame(session, false);
		}
	});


	socket.on("forceLeaveGame", function () {
		// If the user is not in a lobby and the user is not sitting in a losing game state.
		if(session.room !== openRoomID && session.room !== null) {
			leaveGame(session, true);
		}
	});

	// User wants to join a new game
	socket.on("joinLobby", function () {
		// If the user is not already in a lobby.
		if(session.room !== openRoomID) {
			// Connect to an open lobby.
			joinLobby(session);
		}
	});

//--------------------------------------------
// In game messages
//--------------------------------------------
	// User is requesting the top card
	socket.on("reqTopCard", function (){
		var username = session.username,
			roomid = session.room,
			pile = rooms[roomid].users[username].pile;
		// Send the top card of the pile
		socket.emit("getTopCard", pile[0]);
		// Pile is now empty. Tell player this.
		if (pile.length === 1){
			socket.emit("updatePile", true);
		}
	});

	// User chose a card to discard and pass to the player on the left
	socket.on("discard", function (index){
		var username = session.username,
			roomid = session.room,
			users = rooms[roomid].users,
			hand = users[username].hand,
			pile = users[username].pile;
		// Get the card based on the index (0-3 = hand, top = top card of pile)
		var card;
		if (index === "top"){
			card = pile.shift();
		} else {
			card = hand[index];
			// Put top card in hand
			hand[index] = pile.shift();
		}
		// Find user to the left, which should be a simple add one and modulo
		var usernames = Object.keys(users),
			playerSeat = usernames.indexOf(username),
			leftSeat = (playerSeat + 1) % usernames.length,
			leftPlayerName = usernames[leftSeat],
			playerSocket = userToSocket[leftPlayerName];
		// Put discarded card on end of pile (user.pile.push)
		users[leftPlayerName].pile.push(card);
		// At this point, if anyone's piles just changed from being empty, alert them
		// Reason for 2 instead of 1 is because when the top card is revealed, it technically is still in the pile. If the player is looking at their last card in the pile, the
		// pile will appear to be empty to them even though the pile's size is 1.
		if (users[leftPlayerName].pile.length <= 2){
			playerSocket.emit("updatePile", false);
		}
	});

	// User is attempting to get the spoon located at some index
	socket.on("getSpoon", function (index){
		var username = session.username,
			roomid = session.room,
			users = rooms[roomid].users,
			usernames = Object.keys(users),
			hand = users[username].hand;
		// Don't allow taking spoon if they already have it
		if (users[username].hasSpoon){
			// DO NOTHING LOL
		// Check if 4 of a Kind in hand or if the number of spoons is not at maximum
		} else if (fourOfKind(hand) || numberOfSpoons(roomid) !== usernames.length - 1){
		//} else if (true){ // FOR TESTING PURPOSES ONLY
			// If valid, confirm taking the spoon by telling all users
			for (var i = 0; i < usernames.length; i++){
				userToSocket[usernames[i]].emit("removeSpoon", index, username);
			}
			// This spoon doesn't exist here anymore
			rooms[roomid].spoons[index] = 0;
			// This user now has spoon (yay)
			users[username].hasSpoon = true;
			// If no more spoons, send message to end game
			if (numberOfSpoons(roomid) === 0){
				gameover(roomid);
			}
		} else {
			// Otherwise, penalize the player 5 seconds for grabbing another spoon
			socket.emit("penalty");
		}
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

// Defaults to the login page.
app.get("/", function (req, res) {
	"use strict";

	res.redirect("/login");
	return;
});

// If a user has logged in (isAuthorized == true), then they are directed to the maing page;
// otherwise, the user is directed to the login page.
// Also, this user may not open another tab under themself so they will be redirected to the login page.
app.get("/spoons", function (req, res) {
	"use strict";

	if(req.session.isAuthorized && !userToSocket[req.session.username]) {
		res.sendFile(__dirname + "/client/default.html");
	} else {
		res.redirect("/login");
	}
	return;
});

// User requesting to register for an account; redirect to registration page.
app.get("/register", function (req, res) {
	"use strict";

	req.session.destroy();
	res.sendFile(__dirname + "/client/register.html");
	return;
});

// User submits their registration data and it is saved to the database.
app.post("/register", function (req, res){
	"use strict";

	console.log("Username: " + req.body.username.toLowerCase() + "\nPassword: " + req.body.password);
	// Check if the username already exists in the database
	rdb.exists(req.body.username.toLowerCase(), function (err, reply) {
		if(err) {
			console.log(err);
			return res.json({ msg:"Server was unable to complete the registration. Please try again."});
		}
		// Username exists
		if (reply === 1) {
			return res.json({ msg:"Username already exists." });
		} else {
			rdb.hmset(req.body.username.toLowerCase(), {
				"password": req.body.password,
				"wins":"0",
				"gamesPlayed": "0"
			});
			return res.json({ msg:"success" }); // We really should redirect back to home page
		}
	});
});

// When a user is directed to the login route, the login page is loaded.
app.get("/login", function (req, res) {
	"use strict";

	req.session.destroy();
	res.sendFile(__dirname + "/client/login.html");
	return;
});

// Logs the user out of the server by destroying their active session and redirecting to the login route.
// At this point the user would have to log in again.
app.get("/logout", function (req, res) {
	"use strict";

	req.session.destroy();
	res.redirect("/login");
	return;
});

// User requesting to login to their account
app.post("/login", function (req, res){
	"use strict";

	var un = req.body.username.toLowerCase();
	console.log("Username: " + un + "\nPassword: " + req.body.password);
	// Get username from database
	rdb.hgetall(un, function (err, user) {
		if(err) {
			console.log(err);
			return res.json({ msg:"Server was unable to complete the login. Please try again." });
		}
		// Username exists
		if (user !== null) {
			// Check that password matches
			if(user.password === req.body.password) {
				// Checking if this user isn't already logged in
				if (!userToSocket[un]){
					console.log(user);
					req.session.isAuthorized = true;
					req.session.username = un;
					req.session.wins = user.wins;
					req.session.gamesPlayed = user.gamesPlayed;
					
					return res.json({ msg:"success" });
				} else {
					return res.json({ msg:"User is already logged in." });
				}
				
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
	"use strict";

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
/*setInterval(function(){
	//console.log("Games in progress: " + inGameRooms.length);
	console.log("Open Room ID: " + openRoomID);
	console.log("Number of users in this room: " + Object.keys(rooms[openRoomID].users).length);
	console.log("Wait time remaining: " + waitTime);
}, 5000);
*/

//=============================================================================
// Start-up the server
//=============================================================================

// Start the server
server.listen(3000);
console.log("Server listening on port 3000...");