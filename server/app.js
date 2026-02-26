const mysql = require('mysql');
const pool = mysql.createPool({
    uri: process.env.DB_URI,
    connectionLimit: 5,      // max simultaneous connections
    waitForConnections: true, // queue queries when pool is full
    queueLimit: 0             // unlimited queue (set a number to cap it)
});

const express = require('express')
const bodyParser = require('body-parser')
const app = express()

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// create application/json parser
const jsonParser = bodyParser.json()

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on port 3000');
});

// Create user
app.post('/new', jsonParser, function (req, res) {
    console.log("Trying to create a new user " + req.body.username);
    pool.query(`INSERT INTO users (name, password, credits, hack_chance, is_hacker, is_corp) VALUES ('${req.body.username}', '${req.body.password}', '${req.body.credits}', '${req.body.hack_chance}', '${req.body.is_hacker == true ? 1 : 0}', '${req.body.is_corp == true ? 1 : 0}')`, (err, rows) => {
        if (err) {
            res.status(err.errno == 1062 ? 409 : 500);
            console.log("Error in creating a user: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }
        console.log("User " + req.body.username + " created successfully")
        res.send(true);
    });
})

// Edit user
app.post('/edit', jsonParser, function (req, res) {
    console.log("Trying to edit user ", req.body.username);
    pool.query(`UPDATE users SET name = '${req.body.username}', password = '${req.body.password}', credits = '${req.body.credits}', hack_chance = '${req.body.hack_chance}', is_hacker = '${req.body.is_hacker == true ? 1 : 0}', is_corp ='${req.body.is_corp == true ? 1 : 0}' WHERE name = '${req.body.old_name}'`, (err, rows) => {
        if (err) {
            res.status(500);
            console.log("Error in creating a user: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }
        console.log("Finished editing user ", req.body.username);
        res.send(true);
    });
})

// Pay to user
app.get('/pay/:user/:amount/:from', (req, res) => {
    console.log(`Trying to pay ${req.params.amount} credits to user ${req.params.user} from user ${req.params.from}`);
    pool.query(`UPDATE users SET credits = credits +${req.params.amount} WHERE NAME = '${req.params.user}'`, (err, rows) => {
        if (err) {
            res.status(500);
            console.log("Error in payment: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }
        if (req.params.from != "admin") {
            pool.query(`UPDATE users SET credits = credits -${req.params.amount} WHERE NAME = '${req.params.from}'`, (err, rows) => {
                if (err) {
                    res.status(500);
                    console.log("Error in payment: ", err.sqlMessage);
                    res.send(err.sqlMessage);
                    return;
                }
                pool.query(`SELECT name, credits FROM users WHERE NAME = '${req.params.user}' OR NAME = '${req.params.from}'`, (err, rows) => {
                    if (err) {
                        res.status(500);
                        console.log("Error in payment: ", err.sqlMessage);
                        res.send(err.sqlMessage);
                        return;
                    }
                    console.log("Payment successful");
                    res.send(rows);
                });
            });
        } else {
            pool.query(`SELECT name, credits FROM users WHERE NAME = '${req.params.user}'`, (err, rows) => {
                if (err) {
                    res.status(500);
                    console.log("Error in payment: ", err.sqlMessage);
                    res.send(err.sqlMessage);
                    return;
                }
                console.log("Payment successful");
                res.send(rows);
            });
        }
    });
})

// Hack user
app.get('/hack/:target/:hacker', (req, res) => {
    console.log(`User ${req.params.hacker} is trying to hack user ${req.params.target}`);
    // Get chance
    pool.query(`SELECT hack_chance, credits FROM users WHERE NAME = '${req.params.target}'`, (err, rows) => {
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }
        // Roll the die
        const rand = Math.random();
        const hack_chance = rows[0].hack_chance;
        const success = rand <= (hack_chance / 100);
        var stolenAmount = 0;
        if (success) {
            // Steal 30% of money
            stolenAmount = Math.floor(rows[0].credits * 0.3);
            pool.query(`UPDATE users SET credits = (credits - ${stolenAmount}) WHERE NAME = '${req.params.target}'`);
            pool.query(`UPDATE users SET credits = (credits + ${stolenAmount}) WHERE NAME = '${req.params.hacker}'`);
            if (err) {
                res.status(500);
                console.log("Error in hacking: ", err.sqlMessage);
                res.send(err.sqlMessage);
                return;
            }
        }
        // Activate cooldown
        pool.query(`UPDATE users SET hack_cooldown = NOW() WHERE NAME = '${req.params.hacker}'`);
        if (err) {
            res.status(500);
            console.log("Error in hacking: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }

        // Change latest hacked timestamp
        pool.query(`UPDATE users SET last_hacked = NOW() WHERE NAME = '${req.params.target}'`);
        if (err) {
            res.status(500);
            console.log("Error in hacking: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }

        // Save hacker name
        if (!success) {
            pool.query(`UPDATE users SET last_hacker = '${req.params.hacker}' WHERE NAME = '${req.params.target}'`);
            if (err) {
                res.status(500);
                console.log("Error in hacking: ", err.sqlMessage);
                res.send(err.sqlMessage);
                return;
            }
        }
        console.log(`User ${req.params.hacker} hacking ${req.params.target}, success: ${success}, amount: ${stolenAmount}`);
        res.send({ "status": success, "amount": stolenAmount });
    });

})

// User login
app.get('/login/:password', (req, res) => {
    console.log(`Trying to log in with a password ${req.params.password}`);
    pool.query('SELECT * FROM users', (err, rows) => {
        if (err) {
            res.status(500);
            console.log("Error in login: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }

        var loggedIndex = rows.findIndex(x => x.password == req.params.password);
        if (loggedIndex == -1) {
            res.status(401);
            console.log("Wrong password ", req.params.password);
            res.send();
            return;
        }
        var loggedUser = rows.splice(loggedIndex, 1);
        var type = loggedUser[0].is_admin == 1 ? "admin" : "user";
        var response = {
            "type": type,
            "is_hacker": loggedUser[0].is_hacker,
            "is_corp": loggedUser[0].is_corp,
            "players": rows,
            "currentCredits": loggedUser[0].credits,
            "currentUser": loggedUser[0].name,
            "lastHacked": loggedUser[0].last_hacked,
            "last_hacker": loggedUser[0].last_hacker,
            "hackCooldown": loggedUser[0].hack_cooldown
        };
        console.log("Login successful with password ", req.params.password);
        res.send(response);
    });

})

// User delete
app.get('/delete/:username', (req, res) => {
    console.log("Trying to remove user ", req.params.username);
    pool.query(`DELETE FROM users WHERE name = '${req.params.username}'`, (err, rows) => {
        if (err) {
            res.status(500);
            console.log("Error in removal: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }
        console.log("Removal successful for user ", req.params.username);
        res.send("ok");
    });

})

// User reset
app.get('/reset/:username', (req, res) => {
    console.log("Trying to reset timers for user ", req.params.username);
    pool.query(`UPDATE users SET hack_cooldown = NULL, last_hacked = NULL, last_hacker = NULL WHERE name = '${req.params.username}'`, (err, rows) => {
        if (err) {
            res.status(500);
            console.log("Error in user reset: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }
        console.log("Reset successful for user ", req.params.username)
        res.send("ok");
    });

})
// User list
app.get('/users/:username', (req, res) => {
    console.log("Listing users for user ", req.params.username);
    pool.query(`SELECT * FROM users WHERE is_admin = 0 AND name != '${req.params.username}'`, (err, rows) => {
        if (err) {
            res.status(500);
            console.log("Error in user listing: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }
        var response = rows;
        console.log("User listing successful for user ", req.params.username);
        res.send(response);
    });

})
// Auto update
app.get('/status/:username', (req, res) => {
    pool.query(`SELECT * FROM users WHERE is_admin = 0`, (err, rows) => {
        if (err) {
            res.status(500);
            console.log("Error in user refresh: ", err.sqlMessage);
            res.send(err.sqlMessage);
            return;
        }
        var response = {};
        const userIndex = rows.findIndex(x => x.name == req.params.username);
        if (userIndex == -1) {
            res.status(500);
            console.log(`User ${req.params.username} not found in listing refresh`);
            res.send("User not found");
            return;
        }
        const user = rows.splice(userIndex, 1);
        response.credits = user[0].credits;
        response.hack_cooldown = user[0].hack_cooldown;
        response.users = rows;
        res.send(response);
    });

})