/**
 * Parses PDF files to extract full text for Gaussian Splatting knowledge graph.
 *
 * This script:
 * 1. Reads PDF files from papers/pdfs/ corresponding to fetched papers.
 * 2. Extracts full text using pdf-parse.
 * 3. Cleans and normalizes text (removes artifacts, hyphenation, extra whitespace).
 * 4. Saves extracted text to papers/parsed/*.txt.
 * 5. Generates a TypeScript file with complete paper data including full text: src/examples/full-papers-data.ts.
 *
 * Usage:
 *   tsx scripts/parse-pdfs.ts
 *
 * Input:
 *   - papers/pdfs/*.pdf
 *   - scripts/fetched-papers.json
 *
 * Output:
 *   - papers/parsed/*.txt
 *   - src/examples/full-papers-data.ts
 *   - papers/parse-report.json
 */

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

/** Interface for fetched paper metadata */
interface FetchedPaper {
  title: string;
  abstract: string;
  authors: string[];
  year: number;
  citation_count: number;
  arxiv_id: string | null;
  doi: string | null;
  url: string;
  venue: string | null;
  publication_date: string | null;
  relevance_score: number;
  selection_reason: string;
}

/** Interface for a parsed paper with full text */
interface ParsedPaper extends FetchedPaper {
  full_text: string;
  full_text_length: number;
  pdf_pages: number;
}

/** Interface for logging parse results */
interface ParseResult {
  title: string;
  arxiv_id: string;
  success: boolean;
  text_length?: number;
  pages?: number;
  error?: string;
}

/** Sanitize string to create filesystem-safe filename */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').substring(0, 100);
}

/** Clean extracted text by removing whitespace, PDF artifacts, and hyphenation */
function cleanExtractedText(text: string): string {
  let cleaned = text.replace(/\s+/g, ' '); // Normalize spaces
  cleaned = cleaned.replace(/\f/g, '\n\n'); // Form feeds to paragraph breaks
  cleaned = cleaned.replace(/([a-z])-\s+([a-z])/g, '$1$2'); // Rejoin hyphenated words
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Limit multiple line breaks
  return cleaned.trim();
}

/** Parse a single PDF and return text and page count */
async function parsePDF(pdfPath: string): Promise<{ text: string; pages: number }> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  return {
    text: cleanExtractedText(data.text),
    pages: data.numpages,
  };
}

/** Generate a TypeScript file containing all parsed papers with full text */
function generateTypeScriptFile(papers: ParsedPaper[], outputPath: string) {
  const paperObjects = papers.map(p => {
    const dateStr = p.publication_date || new Date(p.year, 0, 1).toISOString();
    return `  {
    title: ${JSON.stringify(p.title)},
    abstract: ${JSON.stringify(p.abstract)},
    full_text: ${JSON.stringify(p.full_text)},
    authors: ${JSON.stringify(p.authors)},
    arxiv_id: ${JSON.stringify(p.arxiv_id)},
    publication_date: new Date(${JSON.stringify(dateStr)}),
    venue: ${JSON.stringify(p.venue)},
    doi: ${JSON.stringify(p.doi)},
    citation_count: ${p.citation_count},
  }`;
  }).join(',\n');

  const fileContent = `/**
 * Parsed papers with full text for Gaussian Splatting knowledge graph
 *
 * Generated from:
 * 1. Semantic Scholar API (metadata)
 * 2. arXiv PDF downloads (full text)
 * 3. pdf-parse library (text extraction)
 *
 * These papers have complete full text extracted from PDFs,
 * enabling richer entity and relationship extraction.
 *
 * Statistics:
 * - Total papers: ${papers.length}
 * - Average length: ${Math.round(papers.reduce((sum, p) => sum + p.full_text_length, 0) / papers.length)} words
 * - Total pages: ${papers.reduce((sum, p) => sum + p.pdf_pages, 0)}
 */

export interface Paper {
  title: string;
  abstract: string;
  full_text: string;
  authors: string[];
  arxiv_id: string | null;
  publication_date: Date;
  venue: string;
  doi: string | null;
  citation_count: number;
}

export const fullPapers: Paper[] = [
${paperObjects}
];

export default fullPapers;
`;

  fs.writeFileSync(outputPath, fileContent);
}

/** Main execution function */
async function main() {
  console.log('Parsing PDFs to extract full text');
  console.log('='.repeat(80));

  try {
    // Load metadata
    const metadataPath = path.join(process.cwd(), 'scripts', 'fetched-papers.json');
    if (!fs.existsSync(metadataPath)) {
      console.error('Error: fetched-papers.json not found. Run "npm run fetch-papers" first.');
      process.exit(1);
    }
    const papers: FetchedPaper[] = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    // Check PDFs
    const pdfDir = path.join(process.cwd(), 'papers', 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      console.error('Error: papers/pdfs/ directory not found. Run "npm run download-pdfs" first.');
      process.exit(1);
    }
    const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));

    console.log(`Total papers in metadata: ${papers.length}`);
    console.log(`PDF files found: ${pdfFiles.length}`);
    if (pdfFiles.length === 0) {
      console.error('No PDF files found.');
      process.exit(1);
    }

    // Create parsed text directory
    const parsedDir = path.join(process.cwd(), 'papers', 'parsed');
    fs.mkdirSync(parsedDir, { recursive: true });

    // Parse PDFs
    const parsedPapers: ParsedPaper[] = [];
    const results: ParseResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < papers.length; i++) {
      const paper = papers[i];
      if (!paper.arxiv_id) continue; // Skip if no arXiv ID

      console.log(`[${i + 1}/${papers.length}] ${paper.title.substring(0, 60)}...`);

      try {
        const expectedFilename = `${sanitizeFilename(paper.title)}_${paper.arxiv_id.replace('/', '_')}.pdf`;
        const pdfPath = path.join(pdfDir, expectedFilename);

        if (!fs.existsSync(pdfPath)) {
          console.log(`PDF not found: ${expectedFilename}`);
          continue;
        }

        const { text, pages } = await parsePDF(pdfPath);

        // Save parsed text
        const txtPath = path.join(parsedDir, expectedFilename.replace('.pdf', '.txt'));
        fs.writeFileSync(txtPath, text);

        const wordCount = text.split(/\s+/).length;
        parsedPapers.push({ ...paper, full_text: text, full_text_length: wordCount, pdf_pages: pages });

        results.push({ title: paper.title, arxiv_id: paper.arxiv_id, success: true, text_length: wordCount, pages });
        successCount++;

      } catch (error) {
        console.error(`Failed: ${error instanceof Error ? error.message : error}`);
        results.push({ title: paper.title, arxiv_id: paper.arxiv_id!, success: false, error: error instanceof Error ? error.message : String(error) });
        failCount++;
      }
    }

    // Generate TypeScript file
    if (parsedPapers.length > 0) {
      const outputPath = path.join(process.cwd(), 'src', 'examples', 'full-papers-data.ts');
      generateTypeScriptFile(parsedPapers, outputPath);
      console.log(`Generated TypeScript file: ${outputPath}`);
    }

    // Save parse report
    const reportPath = path.join(process.cwd(), 'papers', 'parse-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

    // Display summary
    console.log('Parsing summary');
    console.log('='.repeat(80));
    console.log(`Successfully parsed: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Parsed text saved to: ${parsedDir}`);
    console.log(`Parse report saved to: ${reportPath}`);

    if (parsedPapers.length > 0) {
      const avgWords = Math.round(parsedPapers.reduce((sum, p) => sum + p.full_text_length, 0) / parsedPapers.length);
      const totalPages = parsedPapers.reduce((sum, p) => sum + p.pdf_pages, 0);
      console.log(`Total pages: ${totalPages}`);
      console.log(`Average words per paper: ${avgWords}`);
      console.log(`Shortest paper: ${Math.min(...parsedPapers.map(p => p.full_text_length))} words`);
      console.log(`Longest paper: ${Math.max(...parsedPapers.map(p => p.full_text_length))} words`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
