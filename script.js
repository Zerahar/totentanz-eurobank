$(function () {

    const serverUrl = "https://totentanz-eurobank.onrender.com:3000/";
    var currentUser;
    var userList;
    var lastHacked;
    var hackCooldown;
    var isAdmin = false;
    var isHacker = false;
    var updateInterval;

    const $list = $("#PlayerList");
    const $paymentBox = $("#PaymentBox");
    const $hackBox = $("#HackBox");
    const $deleteBox = $("#DeleteBox");
    const $errorView = $("#ErrorView");
    const $messageView = $("#MessageView");

    $(".close-btn").on('click', closeBox);
    $("#PayButton").on("click", pay);
    $("#HackButton").on("click", hack);
    $("#LoginButton").on("click", login);
    $("#LogoutButton").on("click", logout);
    $("#DeleteButton").on("click", deleteUser);
    $("#ShowAddUser").on("click", showAddUser);
    $('#AddUserBtn').on('click', addUser);
    $('#EditUserBtn').on('click', editUser);

    async function login() {
        clearError();
        var password = $("#Password").val();
        $("#Loader").show();
        try {
            const response = await fetch(serverUrl + "login/" + password);
            if (!response.ok) {
                console.log(`Response status: ${response.status}`);
                showError("Kirjautuminen epäonnistui");
                return;
            }

            const json = await response.json();
            currentUser = json.currentUser;
            $("#LoginContainer").hide();
            $("#LogoutButton").show();

            $("#CurrentCredit").html(json.currentCredits);
            $("#LoggedName").text(json.currentUser);
            $("#LoggedView").show();

            userList = json.players;
            lastHacked = json.lastHacked;
            hackCooldown = json.hackCooldown;

            if (updateInterval) clearInterval(updateInterval);
            if (json.type == "admin") {
                isAdmin = true;
                $("#CurrentCreditRow").hide();
                $("#AddUserContainer,#ShowAddUser").show();
                updateInterval = setInterval(() => {
                    getUsers()
                }, 15000)
            } else {
                isAdmin = false;
                $("#CurrentCreditRow").show();
                $("#AddUserContainer").hide();
                updateInterval = setInterval(() => {
                    getUpdate()
                }, 15000)
            }
            isHacker = !isAdmin && json.is_hacker == 1;

            generatePlayerList(json.currentCredits);

            if (lastHacked) {
                $('#HackWarning').show();
                if (json.is_corp == 1) {
                    $('#HackSource').show();
                    $('#HackerName').text(json.last_hacker);
                }
            }

            $("#Loader").hide();

        } catch (error) {
            console.error(error.message);
            $("#Loader").hide();
            showError("Kirjautuminen epäonnistui");
        }
    }

    async function getUsers() {
        try {
            const response = await fetch(serverUrl + "users/" + currentUser);
            if (!response.ok) {
                console.log(`Response status: ${response.status}`);
                showError("Käyttäjien haku epäonnistui");
                return;
            }
            const json = await response.json();
            userList = json;
            generatePlayerList($("#CurrentCredit").val());
        } catch (error) {
            console.error(error.message);
            showError("Käyttäjien haku epäonnistui");
        }
    }

    function logout() {
        clearError();
        $("#LoginContainer, #CurrentCreditRow").show();
        $("#LogoutButton,#LoggedView,#AddUserContainer,#AddUserInputContainer,#HackWarning,#HackSource").hide();
        $("#CurrentCredit,#HackerName,#LoggedName").text("");
        $list.empty();
        $paymentBox.hide();
        currentUser = null;
        if (updateInterval) clearInterval(updateInterval);
    }

    async function getUpdate() {
        const response = await fetch(serverUrl + "status/" + currentUser);
        if (!response.ok) {
            console.log(`Automatic update fail: ${response.message}`);
            showError("Käyttäjien haku epäonnistui");
            return;
        }
        const json = await response.json();
        userList = json.users;
        const hackCooldown = json.hack_cooldown;
        var d = new Date();
        d.setMinutes(d.getMinutes() - 1);
        if (hackCooldown != null && new Date(Date.parse(hackCooldown)) > d) {
            $('.hack-btn').prop('disabled', true);
        } else {
            $('.hack-btn').prop('disabled', false);
        }
        const credits = json.credits;
        if (credits < 1) {
            $('.pay-btn').prop('disabled', true);
        } else {
            $('.pay-btn').prop('disabled', false);
        }
    }

    function generatePlayerList(credits) {
        $list.empty();
        userList.forEach(player => {
            if (player.is_admin == 1) return;

            const $cont = $("<div>").addClass("player-node").text(player.name);

            if (isAdmin) {
                credits = 1;
                const $credits = $("<span>")
                    .addClass("credits")
                    .text("(Rahaa: " + player.credits + ')');
                $cont.append($credits);
            }

            const $btnContainer = $('<div class="btn-container">');
            $cont.append($btnContainer);
            const $payBtn = $("<button>")
                .addClass("pay-btn")
                .text("Maksa")
                .attr('data-name', player.name)
                .attr('data-action', 'pay')
                .on("click", openBox);
            if (credits < 1) {
                $payBtn.prop('disabled', true);
            }
            $btnContainer.append($payBtn);

            if (isAdmin) {
                const $editBtn = $("<button>")
                    .addClass("edit-btn")
                    .text("Muokkaa")
                    .attr('data-name', player.name)
                    .attr('data-action', 'edit')
                    .on("click", showEditUser);
                $btnContainer.append($editBtn);
                const $resetBtn = $("<button>")
                    .addClass("reset-btn")
                    .text("Nollaa")
                    .attr('data-name', player.name)
                    .attr('data-action', 'reset')
                    .on("click", resetUser);
                $btnContainer.append($resetBtn);
                const $deleteBtn = $("<button>")
                    .addClass("delete-btn")
                    .text("Poista")
                    .attr('data-name', player.name)
                    .attr('data-action', 'delete')
                    .on("click", openBox);
                $btnContainer.append($deleteBtn);
                if (player.hack_cooldown) $cont.append(`<span>Viimeksi hakkeroinut ${new Date(player.hack_cooldown).toLocaleString()}</span>`);
                if (player.last_hacked) $cont.append(`<span>Viimeksi jäänyt hakkerin ${player.last_hacker} kohteeksi ${new Date(player.last_hacked).toLocaleString()}</span>`);
            }

            if (isHacker) {
                const $hackBtn = $("<button>")
                    .addClass("hack-btn")
                    .text("Hakkeroi")
                    .attr('data-name', player.name)
                    .attr('data-action', 'hack')
                    .on("click", openBox);
                var d = new Date();
                d.setMinutes(d.getMinutes() - 1);
                if (hackCooldown != null && new Date(Date.parse(hackCooldown)) > d) {
                    $hackBtn.prop('disabled', true);
                }
                $btnContainer.append($hackBtn);
            }
            $list.append($cont);
        });
    }

    function openBox(e) {
        const target = $(e.target).attr("data-name");
        const action = $(e.target).attr("data-action");
        closeEdit();

        var $box;
        if (action == "pay") {
            $box = $paymentBox;
            $("#PaymentTarget").html(target);
        } else if (action == "hack") {
            $box = $hackBox;
            $("#HackTarget").html(target);
            $('#HackBtn').prop('disabled', false)
        } else if (action == "delete") {
            $box = $deleteBox;
            $("#DeleteTarget").html(target)
        }

        $box.show();
    }

    function closeEdit() {
        getUsers();
        $("#ShowAddUser, #AddUserBtn").show();
        $("#AddUserInputContainer, #EditUserBtn").hide();
        $('#EditUserBtn').attr('data-name', "");
    }

    function closeBox() {
        $paymentBox.hide();
        $hackBox.hide();
        $deleteBox.hide();
        clearError();
    }

    async function pay() {
        clearError();
        const user = $("#PaymentTarget").text();
        const amount = $("#PaymentAmount").val();
        const current = $("#CurrentCredit").text();

        if (isNaN(parseInt(amount)) || isNaN(parseInt(current))) {
            console.log("Payment error");
            $("#PaymentError").html("Virhe maksun määrässä");
        }
        if (!isAdmin && parseInt(amount) > parseInt(current)) {
            console.log("Payment error");
            $("#PaymentError").html("Ei tarpeeksi rahaa");
            return;
        }
        if (!isAdmin && amount < 1) {
            console.log("Payment error");
            $("#PaymentError").html("Summa ei voi olla negatiivinen");
            return;
        }

        try {
            $('#Loader').show();
            const response = await fetch(serverUrl + "pay/" + user + '/' + amount + '/' + currentUser);
            if (!response.ok) {
                console.log(`Response status: ${response.status}`);
                $("#PaymentError").html("Maksu epäonnistui");
            }

            const json = await response.json();
            var currentdata = json.find(x => x.name == currentUser);
            var targetUser = json.find(x => x.name != currentUser);
            var targetIndex = userList.findIndex(x => x.name == targetUser.name);
            userList[targetIndex].credits = targetUser.credits;
            if (!isAdmin) {
                $("#CurrentCredit").text(currentdata.credits);
                $("#PaymentMessage").html("Maksu suoritettu, saldo: " + currentdata.credits);
                generatePlayerList(currentdata.credits);
            } else {
                $("#PaymentMessage").html("Maksu suoritettu");
                generatePlayerList(1);
            }
            console.log(json);
            $('#Loader').hide();
        } catch (error) {
            console.error(error.message);
            $('#Loader').hide();
        }
    }

    function hack() {
        $("#Loader").show();
        setTimeout(async function () {
            try {
                const target = $('#HackTarget').text();
                const response = await fetch(serverUrl + "hack/" + target + '/' + currentUser);
                const json = await response.json();
                $("#Loader").hide();
                $("#HackSuccess").toggle(json.status);
                $("#HackFailure").toggle(!json.status);
                $('#HackBtn').prop('disabled', true);
                $('.hack-btn').prop('disabled', true);
                if (!isNaN(json.amount)) $('#HackAmount').text(json.amount);
            } catch (e) {
                console.log(e);
                $("#Loader").hide();
                $("#HackSuccess").hide();
                $("#HackFailure").show();
            }
            // Update hack cooldown
            $('.hack-btn').prop('disabled', true);
        }, 3000);
    }

    function showAddUser() {
        $("#ShowAddUser").hide();
        $("#AddUserInputContainer").show();
        $("#NewUserName").val("");
        $("#NewUserPassword").val("");
        $('#NewUserCredits').val("");
        $('#NewUserHackChance').val("");
        $('#NewUserIsHacker').prop('checked', false);
        $('#NewUserIsCorp').prop('checked', false);
    }

    async function addUser() {
        clearError();
        // Validate
        var valid = $('#AddUserInputContainer').valid();
        if (!valid) showError("Tarkista kentät!");

        const username = $("#NewUserName").val();
        const password = $("#NewUserPassword").val();
        const credits = $('#NewUserCredits').val();
        const hack_chance = $('#NewUserHackChance').val();
        const is_hacker = $('#NewUserIsHacker').is(':checked');
        const is_corp = $('#NewUserIsCorp').is(':checked');
        try {
            $("#Loader").show();
            const response = await fetch(serverUrl + "new", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username,
                    password,
                    credits,
                    hack_chance,
                    is_hacker,
                    is_corp
                })
            });
            if (!response.ok) showError(response.status == 409 ? "Samanniminen käyttäjä on jo olemassa" : "Käyttäjän lisääminen epäonnistui");
            else {
                showMessage("Käyttäjän lisääminen onnistui")
                closeEdit();
            }
            $("#Loader").hide();
        } catch (error) {
            showError("Käyttäjän lisääminen epäonnistui");
            console.error(error.message);
            $("#Loader").hide();
        }
    }

    function showEditUser(e) {
        clearError();
        const username = $(e.target).attr('data-name');
        const user = userList.find(x => x.name == username);
        $("#NewUserName").val(username);
        $("#NewUserPassword").val(user.password);
        $('#NewUserCredits').val(user.credits);
        $('#NewUserHackChance').val(user.hack_chance);
        $('#NewUserIsHacker').prop('checked', user.is_hacker);
        $('#NewUserIsCorp').prop('checked', user.is_corp);
        $("#ShowAddUser, #AddUserBtn").hide();
        $("#AddUserInputContainer, #EditUserBtn").show();
        $('#EditUserBtn').attr('data-name', username);
    }

    async function editUser() {
        clearError();
        // Validate
        var valid = $('#AddUserInputContainer').valid();
        if (!valid) showError("Tarkista kentät!");

        const username = $("#NewUserName").val();
        const password = $("#NewUserPassword").val();
        const credits = $('#NewUserCredits').val();
        const hack_chance = $('#NewUserHackChance').val();
        const is_hacker = $('#NewUserIsHacker').is(':checked');
        const is_corp = $('#NewUserIsCorp').is(':checked');
        const old_name = $('#EditUserBtn').attr('data-name');
        try {
            $("#Loader").show();
            const response = await fetch(serverUrl + "edit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username,
                    password,
                    credits,
                    hack_chance,
                    is_hacker,
                    is_corp,
                    old_name
                })
            });
            if (!response.ok) showError("Käyttäjän tallentaminen epäonnistui");
            else {
                showMessage("Käyttäjän tallentaminen onnistui");
                closeEdit();
            }
            $("#Loader").hide();
        } catch (error) {
            showError("Käyttäjän tallentaminen epäonnistui");
            console.error(error.message);
            $("#Loader").hide();
        }
    }

    async function deleteUser() {
        clearError();
        $("#Loader").show();
        const target = $('#DeleteTarget').text();
        try {
            const response = await fetch(serverUrl + "delete/" + target);
            if (!response.ok) showError("Käyttäjän poisto epäonnistui");
            $("#Loader").hide();
            closeBox();
        } catch (error) {
            showError("Käyttäjän poisto epäonnistui");
            console.error(error.message);
            $("#Loader").hide();
            closeBox();
        }
        getUsers();
    }

    async function resetUser(e) {
        clearError();
        $("#Loader").show();
        const target = $(e.target).attr('data-name');
        try {
            const response = await fetch(serverUrl + "reset/" + target);
            if (!response.ok) showError("Käyttäjän nollaus epäonnistui");
            else showMessage("Käyttäjän nollaus onnistui")
            $("#Loader").hide();
        } catch (error) {
            showError("Käyttäjän nollaus epäonnistui");
            console.error(error.message);
            $("#Loader").hide();
        }
    }

    function showError(error) {
        $errorView.html(error);
    }

    function showMessage(msg) {
        $messageView.html(msg);
    }

    function clearError() {
        $errorView.html("");
        $messageView.html("");
        $("#PaymentError, #PaymentMessage,#HackAmount").html("");
        $('#HackFailure, #HackSuccess').hide();
    }
});