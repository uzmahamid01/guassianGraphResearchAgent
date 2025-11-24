# Gaussian Graph Research Agent

An agentic data pipeline that ingests Gaussian Splatting & neural rendering papers, extracts structured knowledge with LLM-powered agents, and stores the resulting research graph in PostgreSQL.

---

## Table of Contents
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
- [Running the Pipeline](#running-the-pipeline)
- [Utilities & Scripts](#utilities--scripts)
- [Key Documentation](#key-documentation)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Quick Start

1. **Clone & Install**
	```bash
	git clone https://github.com/ShieldEdHaven/shieldhaven01.git
	cd GuassianGraphAgent
	npm install
	```

2. **Configure Environment**
	```bash
	create .env   # create if not provided
	# Edit .env with:
	# DATABASE_URL=postgresql://user:pass@localhost:5432/research_kg
	# OPENAI_API_KEY=sk-...
	# OPENAI_MODEL=gpt-4-turbo-preview (or preferred)
	```

3. **Setup Database**
	```bash
	npm run migrate   # runs src/database/migrate.ts applying schema.sql
	```

4. **Fetch Seed Papers (optional but recommended)**
	```bash
	npm run fetch-papers     # writes scripts/fetched-papers.json
	npm run download-pdfs    # downloads PDFs listed in the JSON
	npm run parse-pdfs       # extracts text into scripts/parsed/
	```

5. **Run the end-to-end demo**
	```bash
	npm run dev              # executes src/index.ts
	```
	Edit `src/index.ts` and set `ACTIVE_PAPER_SOURCE` to `'full'` once full-text data is available.

---

## Project Structure

```
├── src/
│   ├── agents/                # Base agent + entity/relationship extractors
│   ├── api/                   # (Future) REST server entrypoints
│   ├── config/                # Environment + runtime configuration
│   ├── database/
│   │   ├── schema.sql         # Canonical Postgres schema (nodes/edges/papers)
│   │   └── repositories/      # Node/edge/paper data access layers
│   ├── examples/              # JSON paper data + analytic queries
│   ├── pipeline/              # Ingestion pipeline orchestration
│   └── index.ts               # CLI demo entrypoint
├── scripts/                   # Acquisition utilities (fetch/download/parse/etc.)
├── documentation/             # System docs (architecture, roadmap, etc.)
|── docs/                      # contains generated Typedocs
├── package.json               # npm scripts & dependencies
├── tsconfig.json              # TypeScript compiler config
└── README.md                  # You are here
```

---

## Core Concepts

- **Multi-agent extraction** – `EntityExtractorAgent` and `RelationshipExtractorAgent` specialize in capturing entities (concept, method, dataset, etc.) and semantic links (introduces, improves_on, uses_dataset, ...). Each call stores provenance, confidence, and evidence text.
- **PostgreSQL knowledge graph** – Nodes/edges/papers live in a typed relational schema defined in `src/database/schema.sql`, enriched with JSONB metadata.
- **Ingestion pipeline** – `IngestionPipeline` coordinates paper creation, agent calls, validation, and persistence, logging each stage in `extraction_logs` for observability.
- **Analytics-ready** – `src/examples/queries.ts` demonstrates how to answer common research questions (improvement lineage, dataset usage, concept influence, etc.) directly against the stored graph.

---

## Running the Pipeline

| Task | Command | Notes |
|------|---------|-------|
| Validate env + ingest demo papers | `npm run dev` | Uses `src/index.ts` which validates configuration, checks DB connectivity, ingests papers, and runs sample queries |
| Ingest specific papers via CLI | `npm run ingest` | Executes `src/pipeline/ingest.ts`, ideal for passing custom paper arrays/files |
| Run ingestion pipeline programmatically | `const pipeline = new IngestionPipeline(); await pipeline.ingestPaper(...)` | Import from `src/pipeline/ingestion-pipeline.ts` |
| Query the knowledge graph | `npm run query` | Runs `src/examples/queries.ts` (all example analytics) |

**Switching Paper Sources**
- Edit `ACTIVE_PAPER_SOURCE` in `src/index.ts` (`'fetched'` for abstracts only, `'full'` for richer ingestion once PDFs are parsed).
- Provide corresponding data files under `src/examples/` or adjust the loader to point at custom datasets.

**Environment Variables** (`src/config/index.ts`)
- `DATABASE_URL` – required Postgres connection string
- `DATABASE_SSL` – set to `true` for managed DBs
- `OPENAI_API_KEY` – API key for LLM provider
- `OPENAI_MODEL` – override default model name if needed

---

## Utilities & Scripts

| Script | Description |
|--------|-------------|
| `npm run fetch-papers` | Calls Semantic Scholar to collect 50–100 Gaussian Splatting papers (citing & referenced). Writes `scripts/fetched-papers.json`. |
| `npm run download-pdfs` | Downloads PDFs referenced in the fetched list. |
| `npm run parse-pdfs` | Uses `pdf-parse` to convert PDFs into plain text blobs for ingestion. |
| `npm run clean-pdfs` | Removes corrupted/incomplete downloads. |
| `npm run convert-papers` | Converts fetched data into the sample format expected by ingestion. |
| `npm run seed:demo` | Seeds a demo graph for UI/testing scenarios. |
| `npm run migrate` | Applies the Postgres schema (`src/database/migrate.ts`). |

Feel free to chain scripts (e.g., `npm run fetch-papers && npm run download-pdfs && npm run parse-pdfs`) before running `npm run dev` for a full refresh.

---

## Key Documentation

| Document | Description |
|----------|-------------|
| `documentation/SYSTEM_ARCHITECTURE_OVERVIEW.md` | End-to-end data flow, components, and agent logic. |
| `documentation/DESIGN_CONSIDERATIONS.md` | How the implementation addresses representation, extraction, UX, and scalability concerns. |
| `documentation/LIMITATIONS_AND_TRADEOFFS.md` | Current scope boundaries and deferred work. |
| `documentation/FUTURE_ROADMAP.md` | Plans for scaling ingestion, building UI/visualization, and advanced discovery features. |
| `documentation/ARCHITECTURE.md` (legacy) | Additional historical design details. |

Use these references when extending the system or justifying architectural decisions.

---

## Troubleshooting

- **`Missing required environment variables`** – Ensure `.env` includes `DATABASE_URL` and `OPENAI_API_KEY` before running any scripts.
- **`Could not connect to database`** – Confirm Postgres is running, the schema is migrated.
- **LLM errors / rate limits** – The agents log failures to `extraction_logs`; adjust temperature/max tokens in `config.agents` or add retry delays via `config.processing`.
- **Slow ingestion** – Reduce batch size in `IngestionPipeline.ingestPapers` or pre-filter the corpus via `scripts/fetch-papers.ts` relevance thresholds.

---

## For Notion Docs 

[Graph Research Agent System]()


---

Happy graphing! 
