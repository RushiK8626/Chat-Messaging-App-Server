const mysql = require('mysql2');
require('dotenv').config( {path: '.env' });

// Parse DATABASE_URL if provided, otherwise use individual variables
let dbConfig;

if (process.env.DATABASE_URL) {
    // Parse DATABASE_URL for mysql2
    // Format: mysql://user:password@host:port/database
    try {
        const url = new URL(process.env.DATABASE_URL);
        dbConfig = {
            host: url.hostname,
            user: url.username,
            password: decodeURIComponent(url.password), // Decode URL-encoded password
            database: url.pathname.substring(1), // Remove leading '/'
            port: url.port || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
    } catch (error) {
        console.error('Error parsing DATABASE_URL:', error.message);
        console.error('Falling back to individual environment variables');
        dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
    }
} else {
    // Fall back to individual environment variables
    dbConfig = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
}

// create connection pool instead of single connection
// manage multiple connections efficiently
const pool = mysql.createPool(dbConfig);

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