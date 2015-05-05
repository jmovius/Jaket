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
};

$(document).ready(main);