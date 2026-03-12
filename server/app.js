const mysql = require('mysql2');
const pool = mysql.createPool({
    uri: process.env.DB_URI,
    connectionLimit: 5,      // max simultaneous connections
    waitForConnections: true, // queue queries when pool is full
    queueLimit: 0             // unlimited queue (set a number to cap it)
}).promise();

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
app.post('/new', jsonParser, async function (req, res) {
    console.log("Trying to create a new user " + req.body.username);

    const { username, password, credits, hack_chance, is_hacker, is_corp } = req.body;

    try {
        await pool.query(
            `INSERT INTO users (name, password, credits, hack_chance, is_hacker, is_corp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [username, password, credits, hack_chance, is_hacker ? 1 : 0, is_corp ? 1 : 0]
        );

        console.log("User " + username + " created successfully");
        res.send(true);

    } catch (err) {
        console.log("Error creating user:", err);
        res.status(err.errno === 1062 ? 409 : 500).send(err);
    }
});

// Edit user
app.post('/edit', jsonParser, async function (req, res) {
    console.log("Trying to edit user ", req.body.username);
    const { username, password, credits, hack_chance, is_hacker, is_corp, old_name } = req.body;

    try {
        await pool.query(
            `UPDATE users SET name = ?, password = ?, credits = ?, hack_chance = ?, is_hacker = ?, is_corp = ? WHERE name = ?`,
            [username, password, credits, hack_chance, is_hacker ? 1 : 0, is_corp ? 1 : 0, old_name]
        );
        console.log("Finished editing user ", username);
        res.send(true);
    } catch (err) {
        console.log("Error editing user: ", err);
        res.status(500).send(err);
    }
});

// Pay to user
app.get('/pay/:user/:amount/:from', async (req, res) => {
    const { user, amount, from } = req.params;
    console.log(`Trying to pay ${amount} credits to user ${user} from user ${from}`);

    try {
        await pool.query(`UPDATE users SET credits = credits + ? WHERE name = ?`, [amount, user]);

        if (from !== "admin") {
            await pool.query(`UPDATE users SET credits = credits - ? WHERE name = ?`, [amount, from]);
            const [rows] = await pool.query(`SELECT name, credits FROM users WHERE name = ? OR name = ?`, [user, from]);
            console.log("Payment successful");
            res.send(rows);
        } else {
            const [rows] = await pool.query(`SELECT name, credits FROM users WHERE name = ?`, [user]);
            console.log("Payment successful");
            res.send(rows);
        }
    } catch (err) {
        console.log("Error in payment: ", err);
        res.status(500).send(err);
    }
});

// Hack user
app.get('/hack/:target/:hacker', async (req, res) => {
    const { target, hacker } = req.params;
    console.log(`User ${hacker} is trying to hack user ${target}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Lock the target row for the duration of this transaction
        const [rows] = await conn.query(
            `SELECT hack_chance, credits FROM users WHERE name = ? FOR UPDATE`,
            [target]
        );

        if (!rows.length) {
            await conn.rollback();
            return res.status(404).send({ error: 'Target not found' });
        }

        const hack_chance = rows[0].hack_chance;
        const success = Math.random() <= (hack_chance / 100);
        let stolenAmount = 0;

        if (success) {
            stolenAmount = Math.floor(rows[0].credits * 0.3);
            await conn.query(
                `UPDATE users SET credits = credits - ? WHERE name = ?`,
                [stolenAmount, target]
            );
            await conn.query(
                `UPDATE users SET credits = credits + ? WHERE name = ?`,
                [stolenAmount, hacker]
            );
        }

        await conn.query(`UPDATE users SET hack_cooldown = NOW() WHERE name = ?`, [hacker]);
        await conn.query(`UPDATE users SET last_hacked = NOW(), last_hacker = ? WHERE name = ?`, [hacker, target]);

        await conn.commit();

        console.log(`User ${hacker} hacking ${target}, success: ${success}, amount: ${stolenAmount}`);
        res.send({ status: success, amount: stolenAmount });

    } catch (err) {
        await conn.rollback();
        console.log("Error in hacking: ", err);
        res.status(500).send(err);
    } finally {
        conn.release();
    }
});

// User login
app.get('/login/:password', async (req, res) => {
    console.log(`Trying to log in with a password ${req.params.password}`);

    try {
        const [rows] = await pool.query('SELECT * FROM users');

        const loggedIndex = rows.findIndex(x => x.password === req.params.password);
        if (loggedIndex === -1) {
            console.log("Wrong password ", req.params.password);
            return res.status(401).send();
        }

        const loggedUser = rows.splice(loggedIndex, 1)[0];
        const response = {
            type: loggedUser.is_admin === 1 ? "admin" : "user",
            is_hacker: loggedUser.is_hacker,
            is_corp: loggedUser.is_corp,
            players: rows,
            currentCredits: loggedUser.credits,
            currentUser: loggedUser.name,
            lastHacked: loggedUser.last_hacked,
            last_hacker: loggedUser.last_hacker,
            hackCooldown: loggedUser.hack_cooldown
        };
        console.log("Login successful with password ", req.params.password);
        res.send(response);
    } catch (err) {
        console.log("Error in login: ", err);
        res.status(500).send(err);
    }
});

// User delete
app.get('/delete/:username', async (req, res) => {
    console.log("Trying to remove user ", req.params.username);

    try {
        await pool.query(`DELETE FROM users WHERE name = ?`, [req.params.username]);
        console.log("Removal successful for user ", req.params.username);
        res.send("ok");
    } catch (err) {
        console.log("Error in removal: ", err);
        res.status(500).send(err);
    }
});

// User reset
app.get('/reset/:username', async (req, res) => {
    console.log("Trying to reset timers for user ", req.params.username);

    try {
        await pool.query(
            `UPDATE users SET hack_cooldown = NULL, last_hacked = NULL, last_hacker = NULL WHERE name = ?`,
            [req.params.username]
        );
        console.log("Reset successful for user ", req.params.username);
        res.send("ok");
    } catch (err) {
        console.log("Error in user reset: ", err);
        res.status(500).send(err);
    }
});

// User list
app.get('/users/:username', async (req, res) => {
    console.log("Listing users for user ", req.params.username);

    try {
        const [rows] = await pool.query(
            `SELECT * FROM users WHERE is_admin = 0 AND name != ?`,
            [req.params.username]
        );
        console.log("User listing successful for user ", req.params.username);
        res.send(rows);
    } catch (err) {
        console.log("Error in user listing: ", err);
        res.status(500).send(err);
    }
});

// Auto update
app.get('/status/:username', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM users WHERE is_admin = 0`);

        const userIndex = rows.findIndex(x => x.name === req.params.username);
        if (userIndex === -1) {
            console.log(`User ${req.params.username} not found in listing refresh`);
            return res.status(500).send("User not found");
        }

        const user = rows.splice(userIndex, 1)[0];
        res.send({
            credits: user.credits,
            hack_cooldown: user.hack_cooldown,
            users: rows
        });
    } catch (err) {
        console.log("Error in user refresh: ", err);
        res.status(500).send(err);
    }
});