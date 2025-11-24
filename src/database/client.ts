/**
 * Database client configuration and connection management
 * 
 * Provides a Postgres client with connection pooling, health checks,
 * transaction helpers, and graceful shutdown.
 */

import postgres from 'postgres';
import type { Sql } from 'postgres';
import { config } from '../config/index.js';

/**
 * Postgres client instance
 * 
 * Uses connection pooling with a maximum of 10 connections.
 * Configures SSL if specified in environment.
 */
export const sql = postgres(config.database.url, {
  max: 10,                // Maximum number of concurrent connections
  idle_timeout: 20,       // Close idle connections after 20 seconds
  connect_timeout: 10,    // Timeout for establishing a new connection
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
});

/**
 * Health check function
 * 
 * Attempts a simple query to verify database connectivity.
 * Returns true if the connection is successful, false otherwise.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * Graceful shutdown
 * 
 * Closes all connections in the pool with a timeout.
 */
export async function closeDatabaseConnection(): Promise<void> {
  await sql.end({ timeout: 5 });
  console.log('Database connection closed');
}

/**
 * Transaction helper
 * 
 * Executes the provided callback inside a database transaction.
 * Rolls back automatically if the callback throws an error.
 * 
 * @param callback - Function that receives a transactional Sql client
 * @returns The result of the callback function
 */
export async function withTransaction<T>(
  callback: (sqlClient: Sql) => Promise<T> | T
): Promise<T> {
  const result = await sql.begin(async (txSql) => {
    // txSql is the transactional client provided by postgres
    return callback(txSql as unknown as Sql);
  });

  // postgres.begin returns UnwrapPromiseArray<T>; cast to T for type consistency
  return result as unknown as T;
}
