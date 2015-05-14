/* jshint browser: true, jquery: true, curly: true, eqeqeq: true, forin: true, immed: true, indent: 4, latedef: true, newcap: true, nonew: true, quotmark: double, strict: true, undef: true, unused: true */
// This will disable the penalty and inactivity timers
var DISABLE_TIMERS = false;

var main = function () {
	"use strict";

	var username;
	var hasSpoon = false;
	var topCardVisible = false;
	var socket = io();

	var scene = 1;		// Login is no longer part of this page.
	var WAITING = 1,	// Waiting room scene
		GAME = 2;		// Playing game scene

	// Represents the timer DOM object displayed on the page. Used for indicating when the next game will being.
	var gameTimer = 0;
	var gameInterval;
	// Represents the time the player cannot grab a spoon.
	var penaltyTimer = 0;
	var penaltyInterval;
	// Represents the time since the player's last action. If inactive for too long, penaltyTimer is set. Repeat too long and the user is kicked.
	var inactiveTimer = 0;
	var inactiveInterval;


	// Request player's stats
	socket.emit("getMyStats");

	// Adds a class to any user slot that is not occupied.
	var setEmptyUsers = function (initPage, removeUser) {
		var i;

		// Set default value.
		initPage = (typeof initPage !== "undefined") ? initPage : false;

		if(typeof removeUser !== "undefined") {
			for(i = 0; i < 7; i++) {
				if($("div.u" + i).text() === removeUser) {
					$("div.u" + i).empty();
				}
			}
		}


		for(i = 0; i < 7; i++) {
			if(initPage) {
				$("div.u" + i).empty();
			}
			if( !$.trim( $("div.u" + i).text() ).length ) {
				$("div.u" + i).addClass("emptyPlayer");
			} else {
				$("div.u" + i).removeClass("emptyPlayer");
			}
		}
	};

	// Refreshes the page back to its original state
	var initPage = function () {
		stopInactiveTimer();
		stopGameTimer();
		stopPenaltyTimer();
		scene = WAITING;
		$("div.waitingRoom").show();
		$("div.gameScene").hide();
		$("div.spoons").empty();
		$("div.hand").empty();
		$("div.topcard").empty();
		$("div.pile").empty();
		$("div.timer").empty();
		$("div.timer").removeClass("inGame");
		$("div.timer").show();
		$("td.index").empty();
		$("td.user").empty();
		setEmptyUsers(true);
		socket.emit("getMyStats");
	};

	// User clicks the top link to join a new game; only works if not in one already
	$("#joinLobby").click(function () {
		// Ignore if in a waiting room
		if (scene === WAITING){
			return;
		}
		socket.emit("leaveGame");
		initPage();
		socket.emit("joinLobby");
	});

//=============================================================================
// Socket.IO
//=============================================================================

	// If server was reboot, user must log in!
	socket.on("goToLogin", function () {
		$(location).attr("href","/");
	});

	// Update the page of the player's stats
	socket.on("userStats", function (stats){
		var username = stats.username,
			games = stats.gamesPlayed,
			wins = stats.wins;
		$("div.userinfo").html("User: " + username + " | Games Played: " + games + " | Wins: " + wins);
	});

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
				if (!users[i]){
					continue;
				}
				var dom  = "div.u" + (playerPlacement);
				$(dom).text(users[i]);
				playerPlacement++;
			}
			// Update UI to reflect missing users.
			setEmptyUsers();

			// Also set the username (which should be the last one on the list)
			username = users[users.length - 1];
		}
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
		} else if (scene === GAME){ // If in the game
			// Start inactivity timer if necessary
			if ($("img.cardpile").length){
				restartInactiveTimer();
			}
		}
	});

	// Notify the client that the game is starting. Transition to the new scene
	socket.on("gameStart", function (){
		scene = GAME;
		$("div.timer").text("");
		$("div.timer").addClass("inGame");
		$("div.waitingRoom").hide();
		$("div.gameScene").show();
		
	});

	// Get the hand
	socket.on("playerHand", function (cards){
		// Resets values to the beginning of a game
		$("div.hand").empty();
		$("div.topcard").empty();
		$("div.pile").empty();
		hasSpoon = false;
		topCardVisible = false;
		$("img.gotSpoon").remove();


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
					// Restart inactivity
					restartInactiveTimer();
					// Get card index based on IMG's class
					var index = this.className;
					socket.emit("discard", index);
					var imgsrc = $("#card.top").attr("src");
					$("#card." + index).attr("src", imgsrc);
					$("div.topcard").empty();
					topCardVisible = false;
					// If no more cards to grab from the pile
					if ($("img.cardpile").length === 0){
						stopInactiveTimer();
					}
				}
			});
			// Append image to DIV
			$("div.hand").append($img);
		});
	});

	// Number of spoons on the table to draw (also assign the click event for them)
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
				if (gameTimer === 0 && penaltyTimer === 0 && !hasSpoon){
					socket.emit("getSpoon", this.className);
				}
			});
			$("div.spoons").append($img);
		}
	});

	// Remove the player from the room and darken the DIV object
	socket.on("removePlayer", function (username){
		var i;

		for(i = 0; i < 7; i++) {
			if( $("div.u" + i).text() === username ) {
				$("div.u" + i).empty();
				$("div.u" + i).addClass("emptyPlayer");
			}
		}
		// Create a notification
		var n = noty({
			text: username + " left the game.",
			layout: "center",
			type: "warning",
			theme: "relax",
			animation: {
				open: "animated fadeIn",
				close: "animated fadeOut",
				speed: 500
			},
			timeout: 3000,
			killer: true
		});
	});
//--------------------------------------------
// In game messages
//--------------------------------------------

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
				// Restart inactivity
				restartInactiveTimer();
				// Get card index based on IMG's class
				var index = this.className;
				socket.emit("discard", index);
				$("div.topcard").empty();
				topCardVisible = false;
				// If no more cards to grab from the pile
				if ($("img.cardpile").length === 0){
					stopInactiveTimer();
				}
			}
		});
		// Append image to DIV
		$("div.topcard").append($img);
	});

	// If the pile is empty, this message will alert user that pile has a card in it now
	socket.on("updatePile", function (isEmpty){
		$("div.pile").empty();
		if (!isEmpty){
			// The user can do something, but only restart if the user doesn't have the timer running now
			if (!inactiveInterval){
				restartInactiveTimer();
			}
			// Draw the card back
			var $img = $("<img>").addClass("cardpile").attr({
				src: "images/deck/cardback.png",
				id: "card"
			});
			$img.click(function(){
				// Only allow clicking the pile if not viewing the top card and game has started
				if (!topCardVisible && gameTimer === 0){
					socket.emit("reqTopCard");
				}
			});
			$("div.pile").append($img);
		} else if (!topCardVisible){ // The pile is empty but no top card is showing, stop the inactive timer
			stopInactiveTimer();
		}
	});

	// Tells user that the spoon at "index" was taken by "user"
	socket.on("removeSpoon", function (index, user){
		// Remove the spoon (replaced with empty image) and unbind the click event attached to it
		$("#spoon." + index).unbind("click");
		$("#spoon." + index).attr("src", "images/emptySpoon.png");
		// This player was the one who got the spoon
		if (username === user){
			hasSpoon = true;
			// Turn off inactivity timers
			stopInactiveTimer();
		} else { // Draw spoon-got image next to user's box
			for(var i = 0; i < 7; i++) {
				if($("div.u" + i).text() === user) {
					var $spoon = $("<img>").addClass("gotSpoon").attr({
						src: "images/gotSpoon.png",
						id: "gotSpoon"
					});
					$("div.u" + i).append($spoon);
					break;
				}
			}
		}
	});

	// If tried going for a spoon illegally, get penalized
	socket.on("penalty", function (){
		restartPenaltyTimer();
	});

	// Tells the player who won or lost that game
	socket.on("gameresult", function (uname, gameover){
		// Turn off timers
		stopInactiveTimer();
		stopPenaltyTimer();
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
			socket.emit("forceLeaveGame");
			socket.emit("getMyStats");
		} else {
			$("div.spoons").empty();
			// End of the game (no more rounds left)
			if (gameover){
				$("div.hand").empty();
				$("div.topcard").empty();
				$("div.pile").empty();
				// Message indicating you won
				$("div.spoons").append("YOU WIN!");
				socket.emit("getMyStats");
				stopGameTimer();
			} else {
				// Message indicating who lost
				$("div.spoons").append(uname + " lost!");
				// countdown timer until next round
				gameTimer = 8;
				startGameTimer();
				topCardVisible = false;
				// Remove losing player.
				setEmptyUsers(false, uname);
			}
		}
	});

//=============================================================================
// Interval functions
//=============================================================================

	// If there is a timer going on, decrease it and display on page
	function startGameTimer() {
		if (gameInterval){
			return;
		}
		$("div.timer").text(gameTimer);
		$("div.timer").show();
		gameInterval = setInterval(function (){
			gameTimer--;
			$("div.timer").text(gameTimer);
			if (gameTimer <= 0){
				stopGameTimer(gameInterval);
			}
		}, 1000);
	}

	function stopGameTimer() {
		clearInterval(gameInterval);
		$("div.timer").text("");
		$("div.timer").hide();
		gameInterval = null;
	}

	// Inactivity timer
	function restartInactiveTimer() {
		// Do nothing if the player already has a spoon
		if (hasSpoon || DISABLE_TIMERS){
			return;
		}
		// Clear the last timer
		console.log("Inactivity timer restarted");
		clearInterval(inactiveInterval);
		inactiveTimer = 0;

		inactiveInterval = setInterval(function (){
			inactiveTimer++;
			// Waited too long, penalize the player
			if (inactiveTimer % 10 === 0){
				console.log("You were inactive for too long! PENALTY");
				// Waited way too long, kick them!
				if (inactiveTimer >= 30){
					// Create a notification
					var n = noty({
						text: "You were kicked from the game for being inactive!",
						layout: "center",
						type: "error",
						theme: "relax",
						animation: {
							open: "animated fadeIn",
							close: "animated fadeOut",
							speed: 500
						},
						timeout: 10000,
						killer: true
					});
					socket.emit("leaveGame");
					stopInactiveTimer();
					// Delete objects
					$("div.hand").empty();
					$("div.topcard").empty();
					$("div.pile").empty();
					$("div.spoons").empty();

					stopInactiveTimer();
				} else {
					// Penalty timer
					restartPenaltyTimer();
					// Make the server auto perform a discard by sending the top card to the next player
					socket.emit("discard", "top");
					$("div.topcard").empty();
					topCardVisible = false;
				}
			}
		}, 1000);
	}

	function stopInactiveTimer(){
		inactiveTimer = 0;
		console.log("Inactive timer stopped!");
		clearInterval(inactiveInterval);
		inactiveInterval = null;
	}

	// Penalty timer
	function restartPenaltyTimer() {
		if (DISABLE_TIMERS){ 
			return;
		}
		// Create a notification
		var n = noty({
			text: "Cannot click spoons for 5 seconds!",
			layout: "center",
			type: "warning",
			theme: "relax",
			animation: {
				open: "animated fadeIn",
				close: "animated fadeOut",
				speed: 500 
			},
			timeout: 5000,
			killer: true
		});
		clearInterval(penaltyInterval);
		penaltyTimer = 5;
		penaltyInterval = setInterval(function (){
			penaltyTimer--;
			if (penaltyTimer <= 0){
				stopPenaltyTimer();
			}
		}, 1000);
	}

	function stopPenaltyTimer() {
		// Create a notification
		penaltyTimer = 0;
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

