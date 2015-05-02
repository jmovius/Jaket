var scene = 0;

var main = function () {
    "use strict";

    var username;
    var socket = io();
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

    socket.on("usersInRoom", function (users){
        if (scene === 1) {
            $("td.index").empty();
            $("td.user").empty();
            users.forEach(function (e, i, a){
                var $uid = $("<tr>").text(i+1);
                var $name = $("<tr>").text(e);
                $("td.index").append($uid);
                $("td.user").append($name);
            });
        } else if (scene === 2) {
            users.forEach(function (e, i, a){
                $("div.u1").append(e);
            });
        }
    });

    socket.on("gameStart", function(){
        scene = 2;
        $("div.waitingRoom").hide();

        $("div.gameScene").show();
    });

};

$("div.waitingRoom").hide();
$("div.gameScene").hide();

$(document).ready(main);

