/**
 * Main entry point for the Research Knowledge Graph (RKG) system.
 * 
 * Responsibilities:
 * 1. Validate configuration
 * 2. Connect to database
 * 3. Fetch papers from selected source
 * 4. Ingest papers into knowledge graph
 * 5. Display statistics and run example queries
 * 6. Close database connection gracefully
 */

import { config, validateConfig } from './config/index.js';
import { checkDatabaseConnection, closeDatabaseConnection } from './database/client.js';
import { IngestionPipeline } from './pipeline/ingestion-pipeline.js';
import { KnowledgeGraphQueries } from './examples/queries.js';

// ============================================================================
// PAPER SOURCE CONFIGURATION
// ============================================================================
// Uncomment ONE of the following import lines to choose your paper source:

// Option 1: 100 fetched papers with abstracts (fast - ~1-2 hours to ingest)
// import fetchedPapers from './examples/fetched-papers-data.js';
// const getPapers = () => fetchedPapers;

// Option 2: ~74 full papers with complete text (best quality - ~2-4 hours to ingest)
// import fullPapers from './examples/full-papers-data.js';
// const getPapers = () => fullPapers;

// ============================================================================
// ACTIVE CONFIGURATION: Change this to switch paper sources 
// ============================================================================
type PaperSource = 'fetched' | 'full';
const ACTIVE_PAPER_SOURCE: PaperSource = 'fetched'; // <-- Change to 'fetched' | 'full'

/**
 * Dynamically loads papers based on the active paper source.
 * Falls back with a warning if the specified source file is not found.
 * 
 * @returns {Promise<Array>} Array of paper objects for ingestion.
 */
async function getPapersForIngestion() {
  switch (ACTIVE_PAPER_SOURCE) {
    case 'fetched':
      // Load 100 papers with abstracts only - easy for quick ingestion
      try {
        const { default: fetchedPapers } = await import(
          new URL('./examples/fetched-papers-data.ts', import.meta.url).href
        );
        return fetchedPapers;
      } catch (error) {
        console.warn('\n fetched-papers-data.ts not found. Falling back to sample papers.');
      }
    
    case 'full':
      // Load ~74 full papers with complete text 
      try {
        const { default: fullPapers } = await import(
          new URL('./examples/full-papers-data.ts', import.meta.url).href
        );
        return fullPapers;
      } catch (error) {
        console.warn('\n full-papers-data.ts not found. Falling back to fetched papers.');
      }
    
    default:
      console.error('\n Error: Invalid ACTIVE_PAPER_SOURCE');
      console.error(`   Must be 'fetched' or 'full'. Got: ${ACTIVE_PAPER_SOURCE}\n`);
      process.exit(1);
  }
}

/**
 * Main entry point function.
 * Performs configuration validation, database connection,
 * paper ingestion, statistics display, and demo queries.
 */
async function main() {
  console.log('\n Research Knowledge Graph System');
  console.log('=====================================\n');

  // Validate system configuration
  try {
    validateConfig();
  } catch (error) {
    console.error(' Configuration error:', error);
    process.exit(1);
  }

  // Check database connectivity
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.error('\n Could not connect to database. Please check your DATABASE_URL.');
    console.error('   Make sure Postgres is running and the schema is migrated.\n');
    process.exit(1);
  }

  console.log(`\n LLM Provider: ${config.llm.provider}`);
  console.log(`Database: Connected`);
  
 
  
  // Show instructions for changing source
  console.log('\n To change paper source:');
  console.log('   Edit src/index.ts and change ACTIVE_PAPER_SOURCE to:');
  console.log(`   - 'fetched' for 100 papers with abstracts`);
  console.log(`   - 'full' for ~74 papers with full text (recommended)`);
  console.log('');

  // Run ingestion and queries demo
  await runDemo();

  // Cleanup database connection
  await closeDatabaseConnection();
  console.log('\n👋 Goodbye!\n');
}

/**
 * Runs a demonstration of the ingestion pipeline and example queries.
 */
async function runDemo() {
  console.log('\n📚 DEMO: Ingesting Papers and Running Queries');
  console.log('='.repeat(80));

  const pipeline = new IngestionPipeline();
  
  // Fetch papers based on active source
  const papers = await getPapersForIngestion();
  console.log(`\nFound ${papers.length} papers to ingest.`);
  
  if (ACTIVE_PAPER_SOURCE === 'fetched') {
    console.log('Note: Using abstracts only. For full text, run: npm run download-pdfs && npm run parse-pdfs\n');
  } else {
    console.log('Note: Using full papers with complete text. This will produce the richest knowledge graph.\n');
  }

  // Ingest papers in batches
  const batchSize = ACTIVE_PAPER_SOURCE === 'fetched' ? 5 : 5;
  try {
    await pipeline.ingestPapers(papers, batchSize);
  } catch (error) {
    console.error('Error during ingestion:', error);
  }

  // Display knowledge graph statistics
  console.log('\n Knowledge Graph Statistics');
  console.log('='.repeat(80));
  const stats = await pipeline.getStats();
  
  console.log('\n Papers:');
  console.log(`   Total: ${stats.papers.total}`);
  console.log(`   By Status:`, stats.papers.by_status);
  
  console.log('\n Nodes by Type:');
  Object.entries(stats.nodes).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  console.log('\n Edges by Type:');
  Object.entries(stats.edges).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  // Run example queries on knowledge graph
  console.log('\n');
  const queries = new KnowledgeGraphQueries();
  await queries.runAllQueries();
}

// Execute main function and handle uncaught errors
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
