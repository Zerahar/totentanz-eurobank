const mysql = require('mysql');
const connection = mysql.createConnection(process.env.DB_URI);

const express = require('express')
const bodyParser = require('body-parser')
const port = 3000
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

// create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded()

connection.connect((err) => {
    if (err) throw err;
    console.log('Connected!');
});

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on port 3000');
});

// Create user
app.post('/new', jsonParser, function (req, res) {
    connection.query(`INSERT INTO users (name, password, credits, hack_chance, is_hacker, is_corp) VALUES ('${req.body.username}', '${req.body.password}', '${req.body.credits}', '${req.body.hack_chance}', '${req.body.is_hacker == true ? 1 : 0}', '${req.body.is_corp == true ? 1 : 0}')`, (err, rows) => {
        if (err) {
            res.status(err.errno == 1062 ? 409 : 500);
            res.send(err.sqlMessage);
            return;
        }
        res.send(true);
    });
})

// Edit user
app.post('/edit', jsonParser, function (req, res) {
    connection.query(`UPDATE users SET name = '${req.body.username}', password = '${req.body.password}', credits = '${req.body.credits}', hack_chance = '${req.body.hack_chance}', is_hacker = '${req.body.is_hacker == true ? 1 : 0}', is_corp ='${req.body.is_corp == true ? 1 : 0}' WHERE name = '${req.body.old_name}'`, (err, rows) => {
        if (err) {
            res.status(500)
            res.send(err.sqlMessage);
            return;
        }
        res.send(true);
    });
})

// Pay to user
app.get('/pay/:user/:amount/:from', (req, res) => {
    connection.query(`UPDATE users SET credits = credits +${req.params.amount} WHERE NAME = '${req.params.user}'`, (err, rows) => {
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }
        if (req.params.from != "admin") {
            connection.query(`UPDATE users SET credits = credits -${req.params.amount} WHERE NAME = '${req.params.from}'`, (err, rows) => {
                if (err) {
                    res.status(500);
                    res.send(err.sqlMessage);
                    return;
                }
                connection.query(`SELECT name, credits FROM users WHERE NAME = '${req.params.user}' OR NAME = '${req.params.from}'`, (err, rows) => {
                    if (err) {
                        res.status(500);
                        res.send(err.sqlMessage);
                        return;
                    }
                    res.send(rows);
                });
            });
        } else {
            connection.query(`SELECT name, credits FROM users WHERE NAME = '${req.params.user}'`, (err, rows) => {
                if (err) {
                    res.status(500);
                    res.send(err.sqlMessage);
                    return;
                }
                res.send(rows);
            });
        }
    });
})

// Hack user
app.get('/hack/:target/:hacker', (req, res) => {
    // Get chance
    connection.query(`SELECT hack_chance, credits FROM users WHERE NAME = '${req.params.target}'`, (err, rows) => {
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
        console.log(rand, hack_chance, success);
        if (success) {
            // Steal 30% of money
            stolenAmount = Math.floor(rows[0].credits * 0.3);
            console.log("Stolen amount: " + stolenAmount)
            connection.query(`UPDATE users SET credits = (credits - ${stolenAmount}) WHERE NAME = '${req.params.target}'`);
            connection.query(`UPDATE users SET credits = (credits + ${stolenAmount}) WHERE NAME = '${req.params.hacker}'`);
            if (err) {
                res.status(500);
                res.send(err.sqlMessage);
                return;
            }
        }
        // Activate cooldown
        connection.query(`UPDATE users SET hack_cooldown = NOW() WHERE NAME = '${req.params.hacker}'`);
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }

        // Change latest hacked timestamp
        connection.query(`UPDATE users SET last_hacked = NOW() WHERE NAME = '${req.params.target}'`);
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }

        // Save hacker name
        if (!success) {
            connection.query(`UPDATE users SET last_hacker = '${req.params.hacker}' WHERE NAME = '${req.params.target}'`);
            if (err) {
                res.status(500);
                res.send(err.sqlMessage);
                return;
            }
        }

        res.send({ "status": success, "amount": stolenAmount });
    });

})

// User login
app.get('/login/:password', (req, res) => {
    connection.query('SELECT * FROM users', (err, rows) => {
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }

        console.log('Data received from Db:');
        console.log(rows);

        var loggedIndex = rows.findIndex(x => x.password == req.params.password);
        if (loggedIndex == -1) {
            res.status(401);
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
        res.send(response);
    });

})

// User delete
app.get('/delete/:username', (req, res) => {
    connection.query(`DELETE FROM users WHERE name = '${req.params.username}'`, (err, rows) => {
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }

        console.log('Data received from Db:');
        console.log(rows);
        res.send("ok");
    });

})

// User reset
app.get('/reset/:username', (req, res) => {
    connection.query(`UPDATE users SET hack_cooldown = NULL, last_hacked = NULL, last_hacker = NULL WHERE name = '${req.params.username}'`, (err, rows) => {
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }
        res.send("ok");
    });

})
// User list
app.get('/users/:username', (req, res) => {
    connection.query(`SELECT * FROM users WHERE is_admin = 0 AND name != '${req.params.username}'`, (err, rows) => {
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }

        console.log('Data received from Db:');
        console.log(rows);
        var response = rows;
        res.send(response);
    });

})
// Auto update
app.get('/status/:username', (req, res) => {
    connection.query(`SELECT * FROM users WHERE is_admin = 0`, (err, rows) => {
        if (err) {
            res.status(500);
            res.send(err.sqlMessage);
            return;
        }

        //console.log('Data received from Db:');
        //console.log(rows);
        var response = {};
        const userIndex = rows.findIndex(x => x.name == req.params.username);
        if (userIndex == -1) {
            res.status(500);
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