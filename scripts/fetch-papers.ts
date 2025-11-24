/**
 * Fetches papers related to Gaussian Splatting knowledge graph using the Semantic Scholar API.
 *
 * This script:
 * 1. Retrieves papers that cite the seminal 3D Gaussian Splatting paper.
 * 2. Retrieves papers referenced by the seminal paper.
 * 3. Filters and scores papers based on relevance, citation count, and publication date.
 *
 * Usage:
 *   tsx scripts/fetch-papers.ts
 *
 * Output:
 *   - scripts/fetched-papers.json: Saved list of filtered and scored papers.
 *   - Displays summary statistics in the console.
 */

import fs from 'fs';
import path from 'path';

// Semantic Scholar API endpoint
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1';

// Seminal paper: 3D Gaussian Splatting for Real-Time Radiance Field Rendering
const SEMINAL_PAPER_ID = 'arXiv:2308.04079';

/** Interface representing a paper object returned by Semantic Scholar */
interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  authors: Array<{ name: string }>;
  citationCount: number;
  url: string;
  venue: string | null;
  publicationDate: string | null;
  externalIds: {
    ArXiv?: string;
    DOI?: string;
  };
}

/** Interface representing a paper after filtering and scoring */
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

/** Sleep utility to respect API rate limits */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch data from a URL with retry logic and exponential backoff
 * @param url - API endpoint to fetch
 * @param retries - Number of retry attempts
 */
async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url}`);
      const response = await fetch(url);

      if (response.status === 429) {
        // Rate limited - exponential backoff
        const waitTime = Math.pow(2, i) * 2000;
        console.log(`Rate limited. Waiting ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await sleep(1000 * (i + 1));
    }
  }
}

/**
 * Fetch papers that cite the seminal paper
 * @param paperId - Semantic Scholar ID of the seminal paper
 * @param limit - Maximum number of citing papers to fetch
 */
async function fetchCitingPapers(paperId: string, limit: number = 100): Promise<SemanticScholarPaper[]> {
  console.log('Fetching papers that cite the seminal paper...');

  const papers: SemanticScholarPaper[] = [];
  let offset = 0;
  const batchSize = 100;

  while (papers.length < limit) {
    const fields = 'paperId,title,abstract,year,authors,citationCount,url,venue,publicationDate,externalIds';
    const url = `${SEMANTIC_SCHOLAR_API}/paper/${paperId}/citations?fields=${fields}&limit=${batchSize}&offset=${offset}`;

    try {
      const data = await fetchWithRetry(url);

      if (!data.data || data.data.length === 0) break;

      for (const item of data.data) {
        if (item.citedPaper) papers.push(item.citedPaper);
      }

      console.log(`Fetched ${papers.length} citing papers so far...`);

      offset += batchSize;
      await sleep(1000); // Respect rate limits

      if (papers.length >= limit) break;
    } catch (error) {
      console.error('Error fetching citations:', error);
      break;
    }
  }

  return papers;
}

/**
 * Fetch papers referenced by the seminal paper
 * @param paperId - Semantic Scholar ID of the seminal paper
 * @param limit - Maximum number of referenced papers to fetch
 */
async function fetchReferencedPapers(paperId: string, limit: number = 50): Promise<SemanticScholarPaper[]> {
  console.log('Fetching papers referenced by the seminal paper...');

  const papers: SemanticScholarPaper[] = [];
  let offset = 0;
  const batchSize = 100;

  while (papers.length < limit) {
    const fields = 'paperId,title,abstract,year,authors,citationCount,url,venue,publicationDate,externalIds';
    const url = `${SEMANTIC_SCHOLAR_API}/paper/${paperId}/references?fields=${fields}&limit=${batchSize}&offset=${offset}`;

    try {
      const data = await fetchWithRetry(url);

      if (!data.data || data.data.length === 0) break;

      for (const item of data.data) {
        if (item.citedPaper) papers.push(item.citedPaper);
      }

      console.log(`Fetched ${papers.length} referenced papers so far...`);

      offset += batchSize;
      await sleep(1000); // Respect rate limits

      if (papers.length >= limit) break;
    } catch (error) {
      console.error('Error fetching references:', error);
      break;
    }
  }

  return papers;
}

/**
 * Calculate a relevance score for a paper
 * @param paper - Semantic Scholar paper
 * @param isCiting - Whether the paper cites the seminal work
 */
function calculateRelevanceScore(paper: SemanticScholarPaper, isCiting: boolean): number {
  let score = 0;

  // Citation count (max 50 points)
  score += Math.min(paper.citationCount / 100, 1) * 50;

  // Recency (max 20 points) - favor 2017+
  if (paper.year) {
    if (paper.year >= 2023) score += 20;
    else if (paper.year >= 2021) score += 15;
    else if (paper.year >= 2019) score += 10;
    else if (paper.year >= 2017) score += 5;
  }

  // Abstract available (10 points)
  if (paper.abstract && paper.abstract.length > 100) score += 10;

  // Has ArXiv ID (5 points)
  if (paper.externalIds?.ArXiv) score += 5;

  // Bonus for citing seminal work (15 points)
  if (isCiting) score += 15;

  return score;
}

/**
 * Filter papers by relevance and score them
 * @param papers - Array of Semantic Scholar papers
 * @param isCiting - Whether these papers cite the seminal work
 */
function filterPapers(papers: SemanticScholarPaper[], isCiting: boolean): FetchedPaper[] {
  return papers
    .filter(p => {
      if (!p.title) return false;
      if (!p.abstract && p.citationCount < 50) return false;
      if (p.year && p.year < 2017) return false;
      return true;
    })
    .map(p => {
      const relevanceScore = calculateRelevanceScore(p, isCiting);
      return {
        title: p.title,
        abstract: p.abstract || 'Abstract not available',
        authors: p.authors?.map(a => a.name) || [],
        year: p.year || 0,
        citation_count: p.citationCount,
        arxiv_id: p.externalIds?.ArXiv || null,
        doi: p.externalIds?.DOI || null,
        url: p.url,
        venue: p.venue,
        publication_date: p.publicationDate,
        relevance_score: relevanceScore,
        selection_reason: isCiting 
          ? 'Cites seminal 3DGS paper' 
          : 'Referenced by seminal 3DGS paper (foundational work)',
      };
    });
}

/**
 * Main function to fetch, filter, score, and save papers
 */
async function main() {
  console.log('Fetching Related Papers for Gaussian Splatting Knowledge Graph');
  console.log('='.repeat(80));
  console.log('Seminal Paper: 3D Gaussian Splatting for Real-Time Radiance Field Rendering');
  console.log('ArXiv ID:', SEMINAL_PAPER_ID);
  console.log('='.repeat(80));

  try {
    // Fetch citing and referenced papers
    const citingPapers = await fetchCitingPapers(SEMINAL_PAPER_ID, 200);
    const referencedPapers = await fetchReferencedPapers(SEMINAL_PAPER_ID, 100);

    // Filter and score
    const filteredCiting = filterPapers(citingPapers, true);
    const filteredReferenced = filterPapers(referencedPapers, false);

    // Combine, deduplicate, and sort by relevance
    const allPapers = [...filteredCiting, ...filteredReferenced];
    const uniquePapers = Array.from(new Map(allPapers.map(p => [p.title.toLowerCase(), p])).values());
    uniquePapers.sort((a, b) => b.relevance_score - a.relevance_score);

    // Select top 100
    const topPapers = uniquePapers.slice(0, 100);

    // Display statistics
    console.log('\nPAPER SELECTION STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total papers fetched: ${allPapers.length}`);
    console.log(`After deduplication: ${uniquePapers.length}`);
    console.log(`Selected for corpus: ${topPapers.length}`);
    
    // Save to JSON
    const outputPath = path.join(process.cwd(), 'scripts', 'fetched-papers.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(topPapers, null, 2));
    console.log('Papers saved to:', outputPath);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run main
main();
