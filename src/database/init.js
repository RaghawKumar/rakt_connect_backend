const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
  const database = process.env.DB_NAME || 'raktconnect_db';
  console.log('Connecting to PostgreSQL server to verify/initialize database...');

  let client;
  try {
    // If DATABASE_URL is provided (e.g. on Render), connect directly to it
    if (process.env.DATABASE_URL) {
      console.log('Using DATABASE_URL connection details...');
      client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
    } else {
      // Local configuration fallback
      const host = process.env.DB_HOST || 'localhost';
      const user = process.env.DB_USER || 'postgres';
      const password = process.env.DB_PASSWORD || '';
      const port = process.env.DB_PORT || 5432;

      console.log(`Connecting to default postgres database to verify if "${database}" exists...`);
      const defaultClient = new Client({
        host,
        user,
        password,
        port,
        database: 'postgres'
      });
      await defaultClient.connect();

      // Check if target database exists
      const res = await defaultClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (res.rowCount === 0) {
        console.log(`Creating database "${database}"...`);
        // Note: CREATE DATABASE parameter cannot be parameterized with $1
        await defaultClient.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
      }
      await defaultClient.end();

      // Connect to target database
      client = new Client({
        host,
        user,
        password,
        port,
        database
      });
      await client.connect();
    }

    // Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`Executing schema queries to initialize tables...`);
    await client.query(schemaSql);

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    console.error('Please verify your PostgreSQL server status and credentials.');
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Support running this script directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;
