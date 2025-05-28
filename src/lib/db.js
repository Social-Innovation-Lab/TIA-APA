import { Pool } from 'pg';

// Create a connection pool
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
}

// Function to execute queries
export async function query(text, params) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to insert a new query record
export async function insertQuery(userData) {
  const {
    userContact,
    clinicName,
    queryType,
    queryText,
    answer
  } = userData;

  const insertText = `
    INSERT INTO queries (user_contact, clinic_name, query_type, query, answer, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id, created_at
  `;

  const values = [userContact, clinicName, queryType, queryText, answer];

  try {
    const result = await query(insertText, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error inserting query:', error);
    throw error;
  }
}

// Function to get all queries (for monitoring)
export async function getAllQueries(limit = 100) {
  const selectText = `
    SELECT id, user_contact, clinic_name, query_type, query, answer, created_at
    FROM queries
    ORDER BY created_at DESC
    LIMIT $1
  `;

  try {
    const result = await query(selectText, [limit]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching queries:', error);
    throw error;
  }
}

// Function to get query statistics
export async function getQueryStats() {
  const statsText = `
    SELECT 
      COUNT(*) as total_queries,
      COUNT(DISTINCT clinic_name) as unique_clinics,
      COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as queries_last_24h,
      COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as queries_last_7d
    FROM queries
  `;

  try {
    const result = await query(statsText);
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
} 