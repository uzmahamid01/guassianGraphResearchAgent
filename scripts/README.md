# Paper Fetching Scripts

Scripts to acquire 50-100 Gaussian Splatting papers for the knowledge graph.

## Scripts Overview

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `fetch-papers.ts` | Fetch paper metadata from Semantic Scholar | None | `fetched-papers.json` |
| `download-pdfs.ts` | Download PDFs from arXiv | `fetched-papers.json` | `papers/pdfs/*.pdf` |
| `parse-pdfs.ts` | Extract text from PDFs | `papers/pdfs/*.pdf` | `full-papers-data.ts` |

## Quick Start

### Option 1: Full Text

```bash
npm run fetch-papers
npm run download-pdfs
npm run parse-pdfs
```

Then update `src/index.ts`:
```typescript
import fullPapers from './examples/full-papers-data.js';
// Use fullPapers in your code
```

### Option 2: Abstracts Only (Faster)

```bash
npm run fetch-papers
npm run convert-papers
```

Then update `src/index.ts`:
```typescript
import fetchedPapers from './examples/fetched-papers-data.js';
// Use fetchedPapers in your code
```

## How It Works

### 1. Fetch Papers (`fetch-papers.ts`)

Uses Semantic Scholar API to:
- Get papers citing 3D Gaussian Splatting (arXiv:2308.04079)
- Get papers referenced by the seminal paper
- Filter and score by relevance
- Select top 100 papers

**Relevance scoring:**
- Citation count: 50 pts
- Recency (2023-2024): 20 pts
- Has abstract: 10 pts
- Has ArXiv ID: 5 pts
- Cites seminal work: 15 pts

**Output:** `scripts/fetched-papers.json`

```json format
[
  {
    "title": "Paper Title",
    "abstract": "Paper abstract...",
    "authors": ["Author 1", "Author 2"],
    "year": 2024,
    "citation_count": 145,
    "arxiv_id": "2401.12345",
    "doi": "10.1234/example",
    "url": "https://semanticscholar.org/paper/...",
    "venue": "CVPR 2024",
    "publication_date": "2024-01-15",
    "relevance_score": 87.5,
    "selection_reason": "Cites seminal 3DGS paper"
  }
]
```

### 2. Download PDFs (`download-pdfs.ts`)

For each paper with an ArXiv ID:
- Constructs arXiv PDF URL: `https://arxiv.org/pdf/2308.04079.pdf`
- Downloads to `papers/pdfs/`
- Respects arXiv rate limits (3 second delay)
- Skips already downloaded files
- Generates download report

**Output:**
- `papers/pdfs/*.pdf`
- `papers/download-report.json`

### 3. Parse PDFs (`parse-pdfs.ts`)

For each downloaded PDF:
- Extracts text using `pdf-parse` library
- Cleans and normalizes text
- Counts words and pages
- Saves to `papers/parsed/*.txt`
- Generates TypeScript file with full papers

**Output:**
- `papers/parsed/*.txt`
- `src/examples/full-papers-data.ts`
- `papers/parse-report.json`

**Output:**
- `src/examples/fetched-papers-data.ts`

## Configuration

### Adjust Number of Papers

Edit `fetch-papers.ts`:

```typescript
// Fetch more citing papers
const citingPapers = await fetchCitingPapers(SEMINAL_PAPER_ID, 300); // default: 200

// Take more in final selection
const topPapers = uniquePapers.slice(0, 150); // default: 100
```

### Adjust Relevance Scoring

Edit `calculateRelevanceScore()` in `fetch-papers.ts`:

```typescript
function calculateRelevanceScore(paper: SemanticScholarPaper, isCiting: boolean): number {
  let score = 0;
  
  // Increase weight for recent papers
  if (paper.year >= 2024) score += 30; // was 20
  
  // Require ArXiv ID (hard filter)
  if (!paper.externalIds?.ArXiv) return 0;
  
  // Your custom scoring logic...
  
  return score;
}
```

### Change Seminal Paper

To fetch papers for a different topic:

```typescript
// In fetch-papers.ts
const SEMINAL_PAPER_ID = 'arXiv:2003.08934'; // NeRF paper
// or
const SEMINAL_PAPER_ID = 'DOI:10.1145/3306346.3323020'; // Point cloud paper
```

## Troubleshooting

### Rate Limiting

**Semantic Scholar:**
- Built-in retries and exponential backoff
- If persistent, wait 5 minutes and rerun

**arXiv:**
- 3 second delay between downloads (per guidelines)
- Already downloaded files are skipped
- Rerun script to continue from where it left off

### Missing Dependencies

```bash
npm install
```

All required packages:
- `pdf-parse`: PDF text extraction
- `@types/pdf-parse`: TypeScript definitions


## Expected Results

After running all scripts:

```
project/
├── scripts/
│   ├── fetched-papers.json          # 100 paper metadata
│   └── README.md
├── papers/
│   ├── pdfs/
│   │   ├── Paper_Title_1.pdf        # ~74 PDFs
│   │   └── Paper_Title_2.pdf
│   ├── parsed/
│   │   ├── Paper_Title_1.txt        # ~74 text files
│   │   └── Paper_Title_2.txt
│   ├── download-report.json
│   └── parse-report.json
└── src/
    └── examples/
        ├── full-papers-data.ts      # 74 papers with full text
        └── fetched-papers-data.ts   # 100 papers with abstracts
```

**Statistics:**
- 100 papers in metadata
- 74-76 papers with ArXiv IDs
- 74 successfully downloaded PDFs
- 74 successfully parsed papers
- 26 papers with abstracts only

## Tips

### For Development

Use abstracts only (faster):
```bash
npm run fetch-papers && npm run convert-papers
```

### For Production/Submission

Use full text (better results):
```bash
npm run fetch-papers && npm run download-pdfs && npm run parse-pdfs
```

### Processing Subsets

Test with smaller batches first:

```typescript
// In fetch-papers.ts
const topPapers = uniquePapers.slice(0, 10); // Test with 10 papers
```

### Incremental Updates

Scripts skip already processed files:
- Downloaded PDFs won't be re-downloaded
- Re-running is safe and resumable

## Next Steps

After fetching papers:

1. **Review the data:**
   ```bash
   cat scripts/fetched-papers.json | jq '.[:5]'  # View first 5 papers
   ```

2. **Update the ingestion pipeline:**
   ```typescript
   // src/index.ts
   import fullPapers from './examples/full-papers-data.js';
   ```

3. **Run ingestion:**
   ```bash
   npm run dev
   ```

4. **Monitor progress:**
   ```sql
   -- In psql
   SELECT COUNT(*) FROM papers;
   SELECT COUNT(*) FROM nodes;
   SELECT COUNT(*) FROM edges;
   ```

