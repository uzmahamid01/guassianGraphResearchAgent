# System Architecture Overview

This document summarizes the current knowledge-graph ingestion platform, covering the end-to-end data flow, core services, and key agent logic. It is derived from the implementation under `src/` and the operational scripts in `scripts/` (as of November 2025).

---

## 1. High-Level Data Flow

```
┌────────────────────┐      ┌───────────────────────┐      ┌────────────────────-┐
│ Paper Acquisition  │      │ Ingestion Pipeline    │      │ Knowledge Graph DB  │
│ scripts/fetch-*.ts │────▶ │ src/pipeline/*.ts     │────▶ │ PostgreSQL + vector │
└────────────────────┘      │ 1. Entity extraction  │      │ nodes / edges /     │
                            │ 2. Relationship extr. │      │ papers / embeddings │
                            │ 3. Validation + logs  │      └────────────────────-┘
                            │ 4. Persist entities   │
                            │ 5. Persist edges      │
                            └───────────────────────┘
                                      │
                                      ▼
                             ┌─────────────────────┐
                             │ Query & Analytics   │
                             │ src/examples/*.ts   │
                             │ docs/queries        │
                             └─────────────────────┘
```

1. **Acquisition** – `scripts/fetch-papers.ts`, `download-pdfs.ts`, and `parse-pdfs.ts` curate 50–100 high-signal Gaussian Splatting papers by combining citation graph traversal, relevance scoring, and PDF parsing.
2. **Pipeline** – `src/pipeline/ingestion-pipeline.ts` orchestrates paper creation, multi-agent extraction, validation, and persistence, logging each stage in PostgreSQL.
3. **Storage** – PostgreSQL tables defined in `src/database/schema.sql` host normalized nodes, edges, papers
4. **Consumption** – `src/examples/queries.ts` and downstream interfaces (REST/CLI/BI) read from the database to power semantic search, benchmarks, and visualizations(later).

---

## 2. Key Components

| Layer | Responsibilities | References |
|-------|------------------|------------|
| **Acquisition** | Fetch citing/referenced papers, download PDFs, extract text. | `scripts/fetch-papers.ts`, `scripts/download-pdfs.ts`, `scripts/parse-pdfs.ts` |
| **Pipeline Core** | Manage ingestion batches, call agents, persist outputs. | `src/pipeline/ingestion-pipeline.ts`, `src/agents/orchestrator.ts` |
| **Agents** | Specialized LLM workers for entity (`EntityExtractorAgent`) and relationship (`RelationshipExtractorAgent`) extraction. | `src/agents/*.ts` |
| **Repositories** | CRUD for papers (`PaperRepository`), nodes (`NodeRepository`), edges (`EdgeRepository`). | `src/database/repositories/*.ts` |
| **Database** | Node/edge schema, enums, helper functions, materialized views, pgvector indexes. | `src/database/schema.sql` |
| **Queries & APIs** | Example analytics, planned REST/GraphQL endpoints. | `src/examples/queries.ts`, future `/src/api` |

---

## 3. Agent Logic Walkthrough

1. **Entity Extraction** (`EntityExtractorAgent`)
   - Input: `paper` metadata + truncated `full_text`.
   - Prompt enumerates eight entity types (concept, method, technique, dataset, metric, challenge, application, result).
   - Output normalized JSON with name, description, context, metadata, confidence.

2. **Relationship Extraction** (`RelationshipExtractorAgent`)
   - Input: paper text + previously extracted entities + up to 100 existing paper titles.
   - Prompt covers supported edge types (paper⇄paper, paper⇄concept, concept⇄concept, method comparisons, dataset/metric usage).
   - Produces relationships with evidence snippets and metadata.

3. **Validation** (`AgentOrchestrator`)
   - Deduplicates entities via canonicalized names.
   - Drops relationships whose endpoints cannot be resolved to known nodes.
   - Logs each stage in `extraction_logs` with timing, success flag, and payloads.

4. **Persistence**
   - `NodeRepository.upsertEntities` builds/updates nodes, merging metadata and keeping the highest confidence.
   - `EdgeRepository.createRelationships` resolves node IDs and inserts edges with conflict resolution (merging evidence/metadata).

---

## 4. Data Stores & Access Patterns

- **PostgreSQL Core Tables**: `nodes`, `edges`, `papers`, `extraction_logs`.
- **Enums**: `node_type`, `edge_type` lock down allowable graph semantics while keeping flexible JSONB metadata per record.
- **Embeddings**: `pgvector` columns (`title_embedding`, `abstract_embedding`) enable semantic search; indexes created with IVFFlat for approximate nearest-neighbor queries.[works partially, for future]
- **Materialized Views**: `paper_stats`, `concept_stats` provide precalculated aggregates used by examples/analytics.[for future]
- **Helpers**: PL/pgSQL functions (`upsert_node`, `create_edge`) encapsulate normalization and deduping logic for ad-hoc scripts.

---

## 5. Deployment & Operations Snapshot

- **Runtime**: Node.js + TypeScript (`tsconfig.json`); scripts run via `tsx` or `npm` scripts.
- **Secrets**: LLM provider keys pulled through `config/index.ts` (e.g., `config.llm.openai`) that are saved in `.env`.
- **Scalability**: Agents are stateless; ingestion can scale horizontally via job queues. PostgreSQL remains single dependency until thresholds (100k+ nodes / 1M+ edges) trigger Neo4j migration per `documentation/DESIGN_RATIONALE.md` §2.
- **Observability**: Extraction logs capture per-stage telemetry; future work should add structured logging and metrics. 

---

## 6. Next Steps for Architecture Docs

1. Expand operational runbooks (backups, schema migrations, embedding refresh strategy).
3. Layer in API gateway details when REST/GraphQL endpoints launch.
