/*
  Initializes the PostgreSQL database by creating required tables if they do not exist.
  This script reads DATABASE_URL from environment variables or from .env.local at project root.
*/

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnvLocalIfPresent() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) return;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.warn('Warning: failed to read .env.local:', error.message);
  }
}

async function ensureDatabase() {
  loadEnvLocalIfPresent();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Please set it in your environment or .env.local');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS queries (
      id BIGSERIAL PRIMARY KEY,
      user_contact TEXT NOT NULL,
      clinic_name TEXT NOT NULL,
      query_type TEXT NOT NULL,
      query TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_queries_created_at ON queries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_queries_clinic_name ON queries(clinic_name);
    CREATE INDEX IF NOT EXISTS idx_queries_query_type ON queries(query_type);
  `;

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected. Ensuring tables exist...');
    await client.query(createTableSQL);
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

ensureDatabase();



