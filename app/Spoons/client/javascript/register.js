var main = function () {
    "use strict";

    var $username = $("#username").attr("placeholder", "Username"),
        $password = $("#password").attr("placeholder", "Password"),
        $confirmPassword = $("#confirmPassword").attr("placeholder", "Confirm Password"),
    	$btn_submit = $("#btn_submit");

    $btn_submit.on("click", function () {
        if($password.val() === $confirmPassword.val() && $username.val() !== "" && $password.val() !== "") {
            var hash = CryptoJS.SHA256($password.val()).toString();

            $.post("/register",{ username:$username.val(), password:hash }).done(function (response) {
                if(response.msg === "success") {
                    document.getElementById("alert").innerHTML = "<p style=\"color:blue\">Registration successful!</p>";
                    window.setTimeout(function () {
                        $(location).attr("href","/");
                    }, 1000);
                } else {
                    document.getElementById("alert").innerHTML = response.msg;
                }
            });
        } else if ($username.val() === "" || $password.val() === "") {
            document.getElementById("alert").innerHTML = "Username/Password required.";
            $password.val("");
            $confirmPassword.val("");
        } else {
            document.getElementById("alert").innerHTML = "Passwords do not match.";
            $password.val("");
            $confirmPassword.val("");
        }
    });

    $("#username, #password, #confirmPassword").on("focus", function (e) {
        document.getElementById("alert").innerHTML = "";
    });

    $username.on("keyup", function (e) {
        if (e.keyCode === 13) {
            $password.focus();
        }
    });

    $password.on("keyup", function (e) {
        if (e.keyCode === 13) {
            $confirmPassword.focus();
        }
    });

    $confirmPassword.on("keyup", function (e) {
        if (e.keyCode === 13) {
            $btn_submit.click();
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