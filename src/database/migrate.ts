/**
 * Database Migration Script
 * 
 * This script reads the schema.sql file and applies all SQL statements
 * to initialize or update the Postgres database schema. It handles:
 * - Tables, indexes, types, materialized views, functions
 * - Multi-line SQL statements and dollar-quoted strings
 * - Line and block comments
 * - Skips statements that already exist
 * 
 * Usage:
 *   node migrate.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sql, checkDatabaseConnection, closeDatabaseConnection } from './client.js';

/**
 * Splits a full SQL schema string into individual statements.
 * Handles quotes, comments, and dollar-quoted functions.
 */
function splitSQLStatements(schema: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  const pushStatement = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      statements.push(trimmed);
    }
    current = '';
  };

  for (let i = 0; i < schema.length; i++) {
    const char = schema[i];
    const nextTwo = schema.slice(i, i + 2);

    // Skip content inside line comments
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        current += char;
      }
      continue;
    }

    // Skip content inside block comments
    if (inBlockComment) {
      if (nextTwo === '*/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    // Detect comments and dollar-quoted blocks
    if (!inSingleQuote && !inDoubleQuote && !dollarTag) {
      if (nextTwo === '--') {
        inLineComment = true;
        i++;
        continue;
      }
      if (nextTwo === '/*') {
        inBlockComment = true;
        i++;
        continue;
      }
      const dollarMatch = schema.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (dollarMatch) {
        dollarTag = dollarMatch[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    } else if (dollarTag && schema.startsWith(dollarTag, i)) {
      current += dollarTag;
      i += dollarTag.length - 1;
      dollarTag = null;
      continue;
    }

    // Handle quotes
    if (!dollarTag) {
      if (char === "'" && !inDoubleQuote) {
        if (inSingleQuote && schema[i + 1] === "'") {
          current += "''";
          i++;
          continue;
        }
        inSingleQuote = !inSingleQuote;
        current += char;
        continue;
      }
      if (char === '"' && !inSingleQuote) {
        if (inDoubleQuote && schema[i + 1] === '"') {
          current += '""';
          i++;
          continue;
        }
        inDoubleQuote = !inDoubleQuote;
        current += char;
        continue;
      }
    }

    // Split statements by semicolon when not inside quotes or dollar blocks
    if (char === ';' && !inSingleQuote && !inDoubleQuote && !dollarTag) {
      pushStatement();
      continue;
    }

    current += char;
  }

  pushStatement();
  return statements;
}

/**
 * Executes the database migration.
 * Reads schema.sql, splits statements, and executes them sequentially.
 */
async function migrate() {
  console.log('\n🔄 Running database migrations...\n');

  // Ensure database is reachable
  const connected = await checkDatabaseConnection();
  if (!connected) {
    console.error('Cannot connect to database. Check your DATABASE_URL.');
    process.exit(1);
  }

  try {
    // Determine schema file path
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSQL = readFileSync(schemaPath, 'utf-8');

    // Split schema into individual SQL statements
    const statements = splitSQLStatements(schemaSQL);
    console.log(`Executing ${statements.length} SQL statements...\n`);

    // Execute each statement sequentially
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip empty statements or comments
      if (statement.startsWith('--') || statement.trim().length === 0) {
        continue;
      }

      try {
        await sql.unsafe(statement);

        // Provide feedback for key operations
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE (\w+)/)?.[1];
          console.log(`✓ Created table: ${tableName}`);
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (\w+)/)?.[1];
          console.log(`✓ Created index: ${indexName}`);
        } else if (statement.includes('CREATE TYPE')) {
          const typeName = statement.match(/CREATE TYPE (\w+)/)?.[1];
          console.log(`✓ Created type: ${typeName}`);
        } else if (statement.includes('CREATE MATERIALIZED VIEW')) {
          const viewName = statement.match(/CREATE MATERIALIZED VIEW (\w+)/)?.[1];
          console.log(`✓ Created materialized view: ${viewName}`);
        } else if (statement.includes('CREATE FUNCTION')) {
          const funcName = statement.match(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/)?.[1];
          console.log(`✓ Created function: ${funcName}`);
        }
      } catch (error: any) {
        // Ignore "already exists" errors, throw others
        if (error.message && error.message.includes('already exists')) {
          continue;
        }
        throw error;
      }
    }

    console.log('\n Migration completed successfully!\n');
  } catch (error) {
    console.error('\n Migration failed:', error);
    throw error;
  } finally {
    // Close database connections
    await closeDatabaseConnection();
  }
}

// Run migration script
migrate().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
