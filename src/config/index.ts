/**
 * Configuration management for the Research Knowledge Graph system
 * 
 * Loads environment variables, sets default values, and provides
 * structured configuration objects for the database, LLM providers,
 * agent settings, and processing parameters.
 */

import dotenv from 'dotenv';

// Load environment variables from a .env file
dotenv.config();

/**
 * Main configuration object
 */
export const config = {
  database: {
    // Connection URL for Postgres database
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/research_kg',
    // Enable SSL if specified in environment
    ssl: process.env.DATABASE_SSL === 'true',
  },
  
  llm: {
    provider: 'openai' as const,
    openai: {
      // API key for OpenAI access
      apiKey: process.env.OPENAI_API_KEY || '',
      // Model to use for LLM queries
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    },
  },
  
  agents: {
    // Configuration for the entity extraction agent
    entityExtraction: {
      temperature: 0.3,
      maxTokens: 4000,
    },
    // Configuration for the relationship extraction agent
    relationshipExtraction: {
      temperature: 0.2,
      maxTokens: 4000,
    },
    // Configuration for the validation agent
    validation: {
      temperature: 0.1,
      maxTokens: 2000,
    },
    // Configuration for the normalization agent
    normalization: {
      temperature: 0.0,
      maxTokens: 1000,
    },
  },
  
  processing: {
    // Default batch size for paper ingestion
    batchSize: 5,
    // Number of retry attempts for failed operations
    retryAttempts: 3,
    // Delay between retries (ms)
    retryDelay: 1000,
  },
} as const;

/**
 * Validates that required environment variables are present.
 * 
 * Throws an error if any required variable is missing.
 */
export function validateConfig(): void {
  const requiredEnvVars = ['DATABASE_URL', 'OPENAI_API_KEY'];

  // Check for missing variables
  const missing = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please create a .env file with the required variables.'
    );
  }
}
