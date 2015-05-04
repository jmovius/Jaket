var main = function () {
	"use strict";

	var username;
	var playerIndex = 0;
	var socket = io();
	var timer = 0;
	var scene = 1;		// Login is no longer part of this page.
	var WAITING = 1,	// Waiting room scene
		GAME = 2,		// Playing game scene
		TRANSITION = 3;	// Scene where it's transitioning to another scene
	var topCardVisible = false;

	var countdownInterval;

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
			var playerPlacement = 0,
				i;
			for (i = (playerIndex + 1) % 8; i != playerIndex; i = (i + 1) % 8){
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
	socket.on("gameStart", function (spoons){
		scene = 2;
		timer = 0;
		stopTimer();
		$("div.timer").text("");
		$("div.waitingRoom").hide();
		$("div.gameScene").show();
		// Draw spoons
		for (var i = 0; i < spoons; i++){
			var $img = $("<img>").addClass(i.toString()).attr({
				src: "images/spoon.png",
				id: "spoon"
			});
			$img.click(function(){
				socket.emit("getSpoon", this.className);
			});
			$("div.spoons").append($img);
		}
	});
//--------------------------------------------
// In game messages
//--------------------------------------------
	// Get the hand
	socket.on("playerHand", function (cards){
		cards.forEach(function (card, index){
			var cardname = card.suit + card.value;
			var $img = $("<img>").addClass(index.toString()).attr({
				src: "images/deck/" + cardname + ".png",
				id: "card"
			});
			
			// Give the card a click event
			$img.click(function(){
				// Top card is showing
				if (topCardVisible) {
					// Get card index based on IMG's class
					var index = this.className;
					socket.emit("discard", index);
					var imgsrc = $("#card.-1").attr("src");
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
		console.log(card);
		var cardname = card.suit + card.value;
		var $img = $("<img>").addClass("-1").attr({
			src: "images/deck/" + cardname + ".png",
			id: "card"
		});
		topCardVisible = true;
		// Give the card a click event
		$img.click(function(){
			// Top card is showing
			if (topCardVisible) {
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
		if (isEmpty){
			$("div.pile").empty();
		}else{
			var $img = $("<img>").addClass("cardpile").attr({
				src: "images/deck/cardback.png",
				id: "card"
			});
			$img.click(function(){
				// Only allow clicking the pile if not viewing the top card
				if (!topCardVisible)
					socket.emit("reqTopCard");
			});
			$("div.pile").append($img);
		}
	});

	// Tells user that the spoon at "index" was taken by "user"
	socket.on("removeSpoon", function (index, user){
		$("#spoon." + index).remove();
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
//$("div.waitingRoom").hide();
$("div.gameScene").hide();

$(document).ready(main);

