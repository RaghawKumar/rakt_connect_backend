const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

// Create PostgreSQL connection pool
// Render's DATABASE_URL is used if available, otherwise it falls back to local configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'raktconnect_db'}`,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Adapter to translate MySQL queries with '?' to PostgreSQL '$1', '$2', ... format,
// and match the mysql2 [rows, fields] return format.
const customQuery = async (text, params) => {
  let formattedText = text;
  let formattedParams = params || [];

  // Convert MySQL '?' placeholders to PostgreSQL '$1', '$2', ... placeholders
  let index = 1;
  formattedText = text.replace(/\?/g, () => `$${index++}`);

  // Auto-append RETURNING id for INSERT queries if not already present,
  // so we can emulate mysql2's insertId return value.
  const isInsert = formattedText.trim().toUpperCase().startsWith('INSERT');
  if (isInsert && !formattedText.toUpperCase().includes('RETURNING')) {
    formattedText += ' RETURNING id';
  }

  try {
    const result = await pool.query(formattedText, formattedParams);
    
    if (isInsert) {
      const insertId = result.rows[0]?.id;
      return [{ insertId, affectedRows: result.rowCount }, result.fields];
    }

    return [result.rows, result.fields];
  } catch (error) {
    console.error('Database query error:', error.message);
    console.error('Failed SQL:', formattedText);
    throw error;
  }
};

module.exports = {
  query: customQuery,
  pool: pool
};
