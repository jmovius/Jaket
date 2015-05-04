var scene = 0;
var LOGIN = 0,		// Login scene
	WAITING = 1,	// Waiting room scene
	GAME = 2,		// Playing game scene
	TRANSITION = 3;	// Scene where it's transitioning to another scene


var main = function () {
	"use strict";

	var username;
	var playerIndex = 0;
	var socket = io();
	var timer = 0;

	var countdownInterval;

//=============================================================================
// DOM Events
//=============================================================================

	// Assign action to submit button
	$("input.userSubmit").on("click", function(event){
		event.preventDefault();
		// Get username
		username = $("input.username").val();
		// Send username to server and determine if already used
		$.post("/connect", {"username": username}, function (res){
			var msg;
			
			if (res === 1){
				// Username is accepted
				socket.emit("username", username);
				// Remove input stuff
				$("div.initialView").empty();
				$("div.waitingRoom").show();
				scene = 1;
			} else {
				// Write message based on server's response
				if (res === 0){ 
					msg = "An error occurred. Try Again.";
				} else if (res === -1){ 
					msg = "This username is already used!";
				}
				// Create DOM
				$("input.username").val("");
				var $msg = $("<h3>").text(msg);
				$("div.result").empty().append($msg);
			}
		});
	});

//=============================================================================
// Socket.IO
//=============================================================================

	// Get a list of all users in the same room and, depending on the scene, display
	// the results to DOM elements
	socket.on("usersInRoom", function (users){
		// In the waiting room
		if (scene === WAITING) {
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
			var playerPlacement = 0;
			for (var i = (playerIndex + 1) % 8; i != playerIndex; i = (i + 1) % 8){
				if (!users[i]) continue;
				var dom  = "div.u" + (playerPlacement);
				$(dom).text(users[i]);
				console.log(dom, users[i]);
				playerPlacement++;
			}
		}
	});

	// Get this client's index in the room--the equivalence to "what seat are you sitting in"
	socket.on("playerIndex", function (index){
		playerIndex = index;
	});

	// Get some time element from the server to display and countdown on the page
	socket.on("time", function (time){
		timer = time;
		if (time > 0){
			$("div.timer").text(timer);
			console.log(countdownInterval);
			startTimer();
		} else {
			$("div.timer").text("");
			stopTimer();
		}
	});

	// Notify the client that the game is starting. Transition to the new scene
	socket.on("gameStart", function(){
		scene = 2;
		timer = 0;
		stopTimer();
		$("div.timer").text("");
		$("div.waitingRoom").hide();
		$("div.gameScene").show();
	});
//--------------------------------------------
// In game messages
//--------------------------------------------
	// Get the hand
	socket.on("playerHand", function (cards){
		cards.forEach(function (card, index){
			var cardname = card.suit + card.value;
			var $img = $("<img>").addClass("card").attr("src", "images/deck/" + cardname + ".png");
			$("div.hand").append($img);
		});
		console.log(cards);
	});

	// Get the top card from the pile
	socket.on("getTopCard", function (card){

	});

	// If the pile is empty, this message will alert user that pile has a card in it now
	socket.on("addPile", function (){

	});

	// Tells user that the spoon at "index" was taken by "user"
	socket.on("removeSpoon", function (index, user){

	});

	// If tried going for a spoon illegally, get penalized
	socket.on("penalty", function (){

	});

//=============================================================================
// Interval functions
//=============================================================================

	// If there is a timer going on, decrease it and display on page
	function startTimer() {
		if (countdownInterval) return;
		console.log("was null");
		countdownInterval = setInterval(function(){
			if (timer > 0){
				timer--;
				$("div.timer").text(timer);
			} else {
				$("div.timer").text("");
				stopTimer();
			}
		}, 1000);
	}

	function stopTimer() {
		clearInterval(countdownInterval);
		countdownInterval = null;
	}

};

//=============================================================================
// Start the page
//=============================================================================

// Initially hiding these DIV elements as they are for different scenes
$("div.waitingRoom").hide();
$("div.gameScene").hide();

$(document).ready(main);

