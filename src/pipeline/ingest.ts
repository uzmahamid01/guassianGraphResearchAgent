/**
 * Standalone ingestion pipeline entry point.
 * 
 * This script can be run independently to ingest papers into the knowledge graph
 * without executing the full demo with queries.
 * 
 * Usage:
 *   npm run ingest
 */

import { config, validateConfig } from '../config/index.js';
import { checkDatabaseConnection, closeDatabaseConnection } from '../database/client.js';
import { IngestionPipeline } from './ingestion-pipeline.js';

// ============================================================================
// PAPER SOURCE CONFIGURATION
// ============================================================================
// Change this variable to switch between paper sources
type PaperSource = 'sample' | 'fetched' | 'full';
const ACTIVE_PAPER_SOURCE: PaperSource = 'full'; // Options: 'sample', 'fetched', 'full'

/**
 * Retrieve papers for ingestion based on the selected source.
 * Exits the process with an error message if the source file is not found.
 */
function getPapersForIngestion() {
  switch (ACTIVE_PAPER_SOURCE) {
    case 'fetched':
      // Load 100 papers with abstracts
      try {
        const { default: fetchedPapers } = require('../examples/fetched-papers-data.js');
        return fetchedPapers;
      } catch (error) {
        console.error('Error: fetched-papers-data.ts not found.');
        console.error('Run: npm run fetch-papers && npm run convert-papers');
        process.exit(1);
      }

    case 'full':
      // Load ~74 full papers with complete text
      try {
        const { default: fullPapers } = require('../examples/full-papers-data.js');
        return fullPapers;
      } catch (error) {
        console.error('Error: full-papers-data.ts not found.');
        console.error('Run: npm run fetch-papers && npm run download-pdfs && npm run parse-pdfs');
        process.exit(1);
      }

    default:
      console.error('Invalid ACTIVE_PAPER_SOURCE');
      console.error(`Must be 'sample', 'fetched', or 'full'. Got: ${ACTIVE_PAPER_SOURCE}`);
      process.exit(1);
  }
}

// Metadata describing each paper source
const PAPER_SOURCE_INFO = {
  sample: {
    name: '3 Sample Papers',
    description: 'Original demo papers for quick testing',
    count: 3,
    avgWords: 500,
    duration: '~5-10 minutes',
  },
  fetched: {
    name: '100 Fetched Papers (Abstracts)',
    description: 'Papers from Semantic Scholar with abstracts only',
    count: 100,
    avgWords: 250,
    duration: '~1-2 hours',
  },
  full: {
    name: '~74 Full Papers (Complete Text)',
    description: 'Papers with full text extracted from PDFs',
    count: 74,
    avgWords: 9000,
    duration: '~2-4 hours',
  },
};

/**
 * Main function to run the standalone ingestion pipeline.
 * Validates configuration, checks database connection, and runs ingestion.
 */
async function main() {
  console.log('Research Knowledge Graph - Ingestion Pipeline');
  console.log('=====================================');

  // Validate system configuration
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }

  // Ensure database is accessible
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.error('Could not connect to database. Please check DATABASE_URL.');
    console.error('Make sure Postgres is running and the schema is migrated.');
    process.exit(1);
  }

  console.log(`LLM Provider: ${config.llm.provider}`);
  console.log('Database: Connected');

  // Display active paper source
  const sourceInfo = PAPER_SOURCE_INFO[ACTIVE_PAPER_SOURCE];
  console.log('Paper Source Configuration');
  console.log('─'.repeat(80));
  console.log(`Active: ${sourceInfo.name}`);
  console.log(`Description: ${sourceInfo.description}`);
  console.log(`Papers: ~${sourceInfo.count}`);
  console.log(`Average words per paper: ~${sourceInfo.avgWords}`);
  console.log(`Expected duration: ${sourceInfo.duration}`);
  console.log('─'.repeat(80));

  console.log('To change paper source, edit src/pipeline/ingest.ts and set ACTIVE_PAPER_SOURCE to:');
  console.log("  'sample' for 3 demo papers (quick test)");
  console.log("  'fetched' for 100 papers with abstracts");
  console.log("  'full' for ~74 papers with full text");

  // Run the ingestion process
  await runIngestion();

  // Close the database connection
  await closeDatabaseConnection();
  console.log('Ingestion complete.');
}

/**
 * Execute the ingestion process using the IngestionPipeline class.
 * Loads papers from the selected source and ingests them in batches.
 */
async function runIngestion() {
  console.log('Starting paper ingestion');
  console.log('='.repeat(80));

  const pipeline = new IngestionPipeline();

  // Load papers
  const papers = getPapersForIngestion();
  console.log(`Found ${papers.length} papers to ingest.`);

  // Provide context about the selected paper source
  if (ACTIVE_PAPER_SOURCE === 'sample') {
    console.log('Using sample papers. For full corpus, see PAPER_ACQUISITION.md');
  } else if (ACTIVE_PAPER_SOURCE === 'fetched') {
    console.log('Using abstracts only. For full text, run: npm run download-pdfs && npm run parse-pdfs');
  } else {
    console.log('Using full papers with complete text. This will produce the richest knowledge graph.');
  }

  // Determine batch size based on source
  const batchSize = ACTIVE_PAPER_SOURCE === 'sample' ? 2 : 5;

  try {
    await pipeline.ingestPapers(papers, batchSize);
  } catch (error) {
    console.error('Error during ingestion:', error);
    process.exit(1);
  }

  // Display statistics after ingestion
  console.log('Knowledge Graph Statistics');
  console.log('='.repeat(80));
  const stats = await pipeline.getStats();

  console.log('Papers:');
  console.log(`  Total: ${stats.papers.total}`);
  console.log('  By status:', stats.papers.by_status);

  console.log('Nodes by type:');
  Object.entries(stats.nodes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('Edges by type:');
  Object.entries(stats.edges).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}

// Execute main function and handle uncaught errors
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
