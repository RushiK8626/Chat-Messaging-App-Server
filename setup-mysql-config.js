/**
 * MySQL Connection & Lock Timeout Configuration Fix
 * 
 * Run this script to update MySQL innodb_lock_wait_timeout
 * This helps prevent "Lock wait timeout exceeded" errors
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function updateMySQLConfig() {
  let connection;
  try {
    // Parse DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    const url = new URL(dbUrl);

    // Create connection
    connection = await mysql.createConnection({
      host: url.hostname,
      user: url.username,
      password: decodeURIComponent(url.password),
      port: url.port || 3306
    });

    console.log('✅ Connected to MySQL');

    // Increase innodb_lock_wait_timeout (default is 50 seconds)
    // Set to 120 seconds for more resilience
    await connection.execute("SET GLOBAL innodb_lock_wait_timeout = 120");
    console.log('✅ Set innodb_lock_wait_timeout = 120 seconds');

    // Increase max_connections if needed
    await connection.execute('SHOW VARIABLES LIKE "max_connections"');
    console.log('✅ Max connections checked');

    // Check current setting
    const [rows] = await connection.execute("SHOW VARIABLES LIKE 'innodb_lock_wait_timeout'");
    console.log('📊 Current lock timeout:', rows);

    await connection.end();
    console.log('✅ Configuration updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateMySQLConfig();
