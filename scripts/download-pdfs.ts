/**
 * Downloads PDFs from arXiv for papers with arXiv IDs.
 *
 * Usage:
 *   tsx scripts/download-pdfs.ts
 *
 * Input:
 *   - scripts/fetched-papers.json (list of fetched papers with arXiv IDs)
 *
 * Output:
 *   - papers/pdfs/*.pdf (downloaded PDFs)
 *   - papers/download-report.json (JSON report of success/failure)
 */

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

/** Paper metadata structure from fetched-papers.json */
interface FetchedPaper {
  title: string;
  arxiv_id: string | null;
  url: string;
}

/** Result of a single PDF download attempt */
interface DownloadResult {
  title: string;
  arxiv_id: string;
  success: boolean;
  file_path?: string;
  error?: string;
}

/** Sleep for a given number of milliseconds */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Downloads a PDF from arXiv by arXiv ID and saves it to outputPath
 * @param arxivId - The arXiv ID of the paper
 * @param outputPath - File path to save the PDF
 * @throws Error if download fails or file is not a valid PDF
 */
async function downloadPDF(arxivId: string, outputPath: string): Promise<void> {
  // Remove version suffix from arXiv ID (e.g., 2308.04079v1 -> 2308.04079)
  const cleanId = arxivId.replace(/v\d+$/, '');
  const pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;

  console.log(`Downloading: ${cleanId}`);

  const response = await fetch(pdfUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  // Verify content type is PDF
  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.includes('pdf') && contentType.includes('html')) {
    throw new Error('Received HTML instead of PDF (paper may not be available)');
  }

  // Save the response to a file
  const fileStream = fs.createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);

  // Verify the file header to ensure it's a valid PDF
  const fileBuffer = fs.readFileSync(outputPath);
  const fileHeader = fileBuffer.slice(0, 4).toString();
  if (fileHeader !== '%PDF') {
    fs.unlinkSync(outputPath);
    throw new Error('Downloaded file is not a valid PDF');
  }
}

/**
 * Sanitizes a string to a filesystem-safe filename
 * @param filename - Original filename string
 * @returns Sanitized filename
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}

/**
 * Main function to download PDFs for papers with arXiv IDs.
 * Saves downloaded PDFs and a JSON report of success/failure.
 */
async function main() {
  console.log('Downloading PDFs from arXiv');
  console.log('='.repeat(80));

  try {
    // Load fetched papers
    const inputPath = path.join(process.cwd(), 'scripts', 'fetched-papers.json');
    if (!fs.existsSync(inputPath)) {
      console.error('Error: fetched-papers.json not found');
      console.error('Run "npm run fetch-papers" first');
      process.exit(1);
    }

    const rawData = fs.readFileSync(inputPath, 'utf-8');
    const papers: FetchedPaper[] = JSON.parse(rawData);

    // Filter papers with arXiv IDs
    const arxivPapers = papers.filter(p => p.arxiv_id);
    console.log(`Total papers: ${papers.length}`);
    console.log(`Papers with arXiv IDs: ${arxivPapers.length}`);
    console.log(`Papers without arXiv IDs: ${papers.length - arxivPapers.length}\n`);

    if (arxivPapers.length === 0) {
      console.log('No papers with arXiv IDs found. Nothing to download.');
      process.exit(0);
    }

    // Create output directory
    const outputDir = path.join(process.cwd(), 'papers', 'pdfs');
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Output directory: ${outputDir}`);
    console.log('='.repeat(80));

    // Download PDFs
    const results: DownloadResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < arxivPapers.length; i++) {
      const paper = arxivPapers[i];
      const arxivId = paper.arxiv_id!;
      console.log(`[${i + 1}/${arxivPapers.length}] ${paper.title.substring(0, 60)}...`);

      try {
        const filename = `${sanitizeFilename(paper.title)}_${arxivId.replace('/', '_')}.pdf`;
        const outputPath = path.join(outputDir, filename);

        // Skip if already downloaded
        if (fs.existsSync(outputPath)) {
          console.log(`   Already exists: ${filename}`);
          results.push({ title: paper.title, arxiv_id: arxivId, success: true, file_path: outputPath });
          successCount++;
          continue;
        }

        // Download PDF
        await downloadPDF(arxivId, outputPath);
        console.log(`   Downloaded: ${filename}`);
        results.push({ title: paper.title, arxiv_id: arxivId, success: true, file_path: outputPath });
        successCount++;

        // Respect arXiv rate limits
        if (i < arxivPapers.length - 1) {
          await sleep(3000);
        }

      } catch (error) {
        console.error(`   Failed: ${error instanceof Error ? error.message : error}`);
        results.push({
          title: paper.title,
          arxiv_id: arxivId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        failCount++;
        await sleep(2000);
      }
    }

    // Save download report
    const reportPath = path.join(process.cwd(), 'papers', 'download-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

    // Display summary
    console.log('\n' + '='.repeat(80));
    console.log('DOWNLOAD SUMMARY');
    console.log('='.repeat(80));
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`PDFs saved to: ${outputDir}`);
    console.log(`Report saved to: ${reportPath}`);

    if (failCount > 0) {
      console.log('\nSome downloads failed. Common reasons:');
      console.log(' - arXiv rate limiting (wait and retry)');
      console.log(' - Invalid arXiv ID');
      console.log(' - Network issues');
      console.log('Check download-report.json for details');
    }

    console.log('\nNEXT STEPS');
    console.log('='.repeat(80));
    console.log('1. Review downloaded PDFs in: papers/pdfs/');
    console.log('2. Parse PDFs to extract text: npm run parse-pdfs');
    console.log('3. Or use abstracts only: npm run convert-papers');

  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  }
}

main();
