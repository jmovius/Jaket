var main = function () {
    "use strict";

    var $username = $("#username").attr("placeholder", "Username"),
        $password = $("#password").attr("placeholder", "Password"),
        $btn_login = $("#btn_login");

    $btn_login.on("click", function () {
        if($username.val() !== "" && $password.val() !== "") {
            var hash = CryptoJS.SHA256($password.val()).toString();

            $.post("/login",{ username:$username.val(), password:hash }).done(function (response) {
                if(response.msg === "success") {
                    $(location).attr("href","/spoons");
                } else {
                    document.getElementById("alert").innerHTML = response.msg;
                }
                $password.val("");
            });
        } else {
            document.getElementById("alert").innerHTML = "Username/Password required.";
            $password.val("");
        }
    });
    
    $("#username, #password").on("focus", function (e) {
        document.getElementById("alert").innerHTML = "";
    });

    $username.on("keyup", function (e) {
        if (e.keyCode === 13) {
            $password.focus();
        }
    });

    $password.on("keyup", function (e) {
        if (e.keyCode === 13) {
            $btn_login.click();
        }
    });

    // Pre-load images ========================================================================
    var deck = {
        suits: ["s", "c", "d", "h"],
        values: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"]
    };
    var i, k,
        imageList = [],
        lenSuits = deck.suits.length,
        lenVals = deck.values.length,
        cardname;
    for(i = 0; i < lenSuits; i++) {
        for(k = 0; k < lenVals; k++) {
            cardname = deck.suits[i] + deck.values[k];
            imageList.push("images/deck/" + cardname + ".png");
        }
    }
    imageList.push("images/deck/cardback.png");
    imageList.push("images/spoon.png");
    // Preload images
    var images = [];
    function preload(list) {
        for (i = 0; i < list.length; i++) {
            images[i] = new Image();
            images[i].src = list[i];
        }
    }
    preload(imageList);
    //=========================================================================================
};

$(document).ready(main);