var main = function () {
	"use strict";

	var username;
	var playerIndex = 0;
	var topCardVisible = false;
	var inactiveCounter = 0; // Counts how many times in a row the game catches the player not doing anything. Too many and the user is kicked.
	var socket = io();

	var scene = 1;		// Login is no longer part of this page.
	var WAITING = 1,	// Waiting room scene
		GAME = 2,		// Playing game scene
		TRANSITION = 3;	// Scene where it's transitioning to another scene

	// Represents the timer DOM object displayed on the page. Used for indicating when the next game will being.
	var gameTimer = 0;
	var gameInterval;
	// Represents the time the player cannot grab a spoon.
	var penaltyTimer = 0;
	var penaltyInterval;
	// Represents the time since the player's last action. If inactive for too long, penaltyTimer is set. Repeat too long and the user is kicked.
	var inactiveTimer = 0;
	var inactiveInterval;

//=============================================================================
// Socket.IO
//=============================================================================

	// Get a list of all users in the same room and, depending on the scene, display
	// the results to DOM elements
	socket.on("usersInRoom", function (users){
		// In the waiting room
		if (scene === WAITING) {
			// Draw names to a table
			$("td.index").empty();
			$("td.user").empty();
			users.forEach(function (e, i, a){
				var $uid = $("<tr>").text(i+1);
				var $name = $("<tr>").text(e);
				$("td.index").append($uid);
				$("td.user").append($name);
			});
		// Playing the game
		} else if (scene === GAME) {
			// Draw all the users' names around the screen in the DIV boxes
			var playerPlacement = 0,
				i;

			for (i = 0; i < users.length - 1; i++){
				if (!users[i]) continue;
				var dom  = "div.u" + (playerPlacement);
				$(dom).text(users[i]);
				playerPlacement++;
			}
			// Also set the username (which should be the last one on the list)
			username = users[users.length - 1];
		}
	});

	// Get this client's index in the room--the equivalence to "what seat are you sitting in"
	socket.on("playerIndex", function (index){
		playerIndex = index;
	});

	// Get some time element from the server to display and countdown on the page
	socket.on("time", function (time){
		gameTimer = time;
		stopGameTimer();
		if (time > 0){
			// Ensure that the current timer is stopped before starting a new one. If you DON'T stop the timer's setInterval, it will have two intervals running in parallel.
			// If you say "let's just not put either of these here", then you are continuing the currently running interval, which may be ahead by a few milliseconds.
			// Stopping and starting ensures that the interval will start at zero.
			startGameTimer();
		}
	});

	// Notify the client that the game is starting. Transition to the new scene
	socket.on("gameStart", function (){
		scene = GAME;
		$("div.timer").text("");
		$("div.waitingRoom").hide();
		$("div.gameScene").show();
		
	});

	socket.on("numOfSpoons", function (spoons){
		// Draw spoons
		$("div.spoons").empty();
		for (var i = 0; i < spoons; i++){
			var $img = $("<img>").addClass(i.toString()).attr({
				src: "images/spoon.png",
				id: "spoon"
			});
			// Clicking the spoon (only allowed if game is actually running and not penalized). Sends the spoon's index.
			$img.click(function(){
				if (gameTimer === 0 && penaltyTimer === 0)
					socket.emit("getSpoon", this.className);
			});
			$("div.spoons").append($img);
		}
	})

	socket.on("removePlayer", function (user){
		// TODO
	});
//--------------------------------------------
// In game messages
//--------------------------------------------
	// Get the hand
	socket.on("playerHand", function (cards){
		$("div.hand").empty();
		$("div.topcard").empty();
		$("div.pile").empty();

		cards.forEach(function (card, index){
			var cardname = card.suit + card.value;
			var $img = $("<img>").addClass(index.toString()).attr({
				src: "images/deck/" + cardname + ".png",
				id: "card"
			});
			
			// Give the card a click event
			$img.click(function(){
				// Top card is showing
				if (topCardVisible && gameTimer === 0) {
					// Get card index based on IMG's class
					var index = this.className;
					socket.emit("discard", index);
					var imgsrc = $("#card.top").attr("src");
					$("#card." + index).attr("src", imgsrc);
					$("div.topcard").empty();
					topCardVisible = false;
				}
			});
			// Append image to DIV
			$("div.hand").append($img);
		});
	});

	// Get the top card from the pile
	socket.on("getTopCard", function (card){
		var cardname = card.suit + card.value;
		var $img = $("<img>").addClass("top").attr({
			src: "images/deck/" + cardname + ".png",
			id: "card"
		});
		topCardVisible = true;
		// Give the card a click event
		$img.click(function(){
			// Top card is showing
			if (topCardVisible && gameTimer === 0) {
				// Get card index based on IMG's class
				var index = this.className;
				socket.emit("discard", index);
				$("div.topcard").empty();
				topCardVisible = false;
			}
		});
		// Append image to DIV
		$("div.topcard").append($img);
	});

	// If the pile is empty, this message will alert user that pile has a card in it now
	socket.on("updatePile", function (isEmpty){
		$("div.pile").empty();
		if (!isEmpty){
			var $img = $("<img>").addClass("cardpile").attr({
				src: "images/deck/cardback.png",
				id: "card"
			});
			$img.click(function(){
				// Only allow clicking the pile if not viewing the top card and game has started
				if (!topCardVisible && gameTimer === 0)
					socket.emit("reqTopCard");
			});
			$("div.pile").append($img);
		}
	});

	// Tells user that the spoon at "index" was taken by "user"
	socket.on("removeSpoon", function (index, user){
		// Remove the spoon (replaced with empty image) and unbind the click event attached to it
		$("#spoon." + index).unbind("click");
		$("#spoon." + index).attr("src", "images/emptySpoon.png");
	});

	// If tried going for a spoon illegally, get penalized
	socket.on("penalty", function (){
		console.log("PENALTY");
	});

	// Tells the player who won or lost that game
	socket.on("gameresult", function (uname, gameover){
		// If you are the loser
		if (username === uname) {
			// Delete objects
			$("div.hand").empty();
			$("div.topcard").empty();
			$("div.pile").empty();
			$("div.spoons").empty();
			// Message indicating the player lost
			$("div.spoons").append("YOU LOSE!");
			// Ask server to remove them from the room via their session
			socket.emit("removeMeFromRoom");
			// display button that will send user to open room
			// TODO!
		} else {
			$("div.spoons").empty();
			// End of the game (no more rounds left)
			console.log(gameover);
			if (gameover){
				$("div.hand").empty();
				$("div.topcard").empty();
				$("div.pile").empty();
				// Message indicating you won
				$("div.spoons").append("YOU WIN!");
				stopGameTimer();
				// display button that will send user to open room
				// TODO!
			} else {
				// Message indicating who lost
				$("div.spoons").append(uname + " lost!");
				// countdown timer until next round
				gameTimer = 8;
				startGameTimer();
			}
		}
	});


//=============================================================================
// Interval functions
//=============================================================================

	// If there is a timer going on, decrease it and display on page
	function startGameTimer() {
		if (gameInterval) return;
		$("div.timer").text(gameTimer);

		gameInterval = setInterval(function (){
			if (gameTimer > 0){
				gameTimer--;
				$("div.timer").text(gameTimer);
			} else {
				stopGameTimer(gameInterval);
			}
		}, 1000);
	}

	function stopGameTimer() {
		clearInterval(gameInterval);
		$("div.timer").text("");
		gameInterval = null;
	}

	// Inactivity timer
	function startInactiveTimer() {
		if (inactiveInterval) return;
		inactiveInterval = setInterval(function (){
			if (inactiveTimer > 0){
				inactiveTimer--;
			} else {
				stopInactiveTimer(inactiveInterval);
			}
		}, 1000);
	}

	function stopInactiveTimer() {
		clearInterval(inactiveInterval);
		inactiveInterval = null;
	}

	// Penalty timer
	function startPenaltyTimer() {
		if (penaltyInterval) return;
		penaltyInterval = setInterval(function (){
			if (penaltyTimer > 0){
				penaltyTimer--;
			} else {
				stopPenaltyTimer(penaltyInterval);
			}
		}, 1000);
	}

	function stopPenaltyTimer() {
		clearInterval(penaltyInterval);
		penaltyInterval = null;
	}
};

//=============================================================================
// Start the page
//=============================================================================

// Initially hiding these DIV elements as they are for different scenes
//$("div.waitingRoom").hide();
$("div.gameScene").hide();

$(document).ready(main);

