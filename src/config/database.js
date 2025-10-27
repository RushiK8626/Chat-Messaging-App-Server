const mysql = require('mysql2');
require('dotenv').config();

// create connection pool instead of single connection
// manage multiple connections efficiently
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// promisify for async/await usage
const promisePool = pool.promise();

// test connection
async function testConnection() {
    try {
        const connection = await promisePool.getConnection();
        console.log("Database connected successfully");
        connection.release();
        return true;
    } catch(error) {
        console.error('Database connection failed', error.message);
        return false;
    }
}

module.exports = {
    pool: promisePool,
    testConnection
};