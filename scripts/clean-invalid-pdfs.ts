/**
 * Cleans up invalid PDF files in the papers/pdfs/ directory.
 * 
 * A PDF is considered invalid if its file header is not "%PDF",
 * which typically indicates that an HTML error page or corrupted file
 * was downloaded instead of the actual PDF.
 *
 * Usage:
 *   tsx scripts/clean-invalid-pdfs.ts
 */

import fs from 'fs';
import path from 'path';

/** Main execution function */
async function main() {
  console.log('Cleaning Invalid PDFs');
  console.log('='.repeat(80));

  const pdfDir = path.join(process.cwd(), 'papers', 'pdfs');

  // Check if PDF directory exists
  if (!fs.existsSync(pdfDir)) {
    console.error('Error: papers/pdfs/ directory not found');
    process.exit(1);
  }

  // List all PDF files
  const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  console.log(`Found ${files.length} PDF files`);

  let validCount = 0;
  let invalidCount = 0;
  const invalidFiles: string[] = [];

  // Iterate through each PDF and validate header
  for (const file of files) {
    const filePath = path.join(pdfDir, file);

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const fileHeader = fileBuffer.slice(0, 4).toString();

      if (fileHeader === '%PDF') {
        // Valid PDF
        validCount++;
        console.log(`Valid: ${file}`);
      } else {
        // Invalid PDF, remove
        invalidCount++;
        invalidFiles.push(file);
        console.log(`Invalid: ${file} (removing...)`);
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Error checking ${file}:`, error);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('CLEANUP SUMMARY');
  console.log('='.repeat(80));
  console.log(`Valid PDFs: ${validCount}`);
  console.log(`Invalid PDFs removed: ${invalidCount}`);

  if (invalidCount > 0) {
    console.log('\nRemoved files:');
    invalidFiles.forEach(f => console.log(` - ${f}`));
    console.log('\nNext steps: Run "npm run download-pdfs" to re-download missing files.');
  } else {
    console.log('\nAll PDFs are valid.');
  }
}

// Run the script
main();
