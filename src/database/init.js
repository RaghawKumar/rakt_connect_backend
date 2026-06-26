const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'raktsetu_db';
  const port = process.env.DB_PORT || 3306;

  console.log('Connecting to MySQL server to verify/initialize database...');

  let connection;
  try {
    // Connect without database first to ensure database exists
    connection = await mysql.createConnection({
      host,
      user,
      password,
      port,
      multipleStatements: true
    });

    console.log(`Creating database "${database}" if it does not exist...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    await connection.query(`USE \`${database}\`;`);

    // Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`Executing schema queries to initialize tables...`);
    await connection.query(schemaSql);

    // Apply database migrations for new columns
    try {
      console.log('Checking for database migrations (is_available column)...');
      await connection.query('ALTER TABLE users ADD COLUMN is_available BOOLEAN DEFAULT TRUE AFTER is_profile_completed;');
    } catch (err) {
      if (err.errno !== 1060) { // 1060 is ER_DUP_FIELDNAME (column already exists)
        console.error('Migration error (is_available):', err.message);
      }
    }

    try {
      console.log('Checking for database migrations (priority column)...');
      await connection.query("ALTER TABLE blood_requests ADD COLUMN priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' AFTER is_emergency;");
    } catch (err) {
      if (err.errno !== 1060) {
        console.error('Migration error (priority):', err.message);
      }
    }

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    console.error('Please verify your MySQL server status and credentials in the .env file.');
    // We do not throw or exit here, letting the main app try to connect if it can,
    // but in a production app we might exit.
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Support running this script directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;
