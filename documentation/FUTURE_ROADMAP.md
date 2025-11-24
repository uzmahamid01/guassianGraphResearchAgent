# Future Roadmap

This roadmap summarizes planned enhancements for ingestion scale, user-facing experiences, and advanced research-discovery workflows.

---

## 1. Scaling Ingestion & Processing

### 1.1 Phase 1
- **Job orchestration** – Wrap `IngestionPipeline` calls inside a queue (BullMQ / Temporal) so papers process concurrently with retry/backoff policies.
- **Chunk-aware extraction** – Break long PDFs into section chunks, feed them through the existing agents, and merge outputs; unlocks higher recall without blowing token limits.
- **Incremental refresh tooling** – Add CLI commands to reprocess previously ingested papers when prompts/models change, with diff-aware logging.

### 1.2 Phase 2
- **Parallelized embedding generation** – Batch embeddings (papers + nodes) via worker pools, persisting to `pgvector` asynchronously to keep ingestion latency low.
- **Automated view refresh** – Schedule refreshes for `paper_stats`, `concept_stats`, and future summary tables after each successful batch.
- **Observability** – Emit structured logs + metrics (success counts, latency, LLM cost) to a central dashboard; add alerting for stuck jobs.

### 1.3 Phase 3
- **Graph DB readiness** – Implement dual-write adapters so Postgres and a pilot Neo4j/JanusGraph cluster remain in sync, offering faster multi-hop traversals.
- **Model specialization** – Gather labeled datasets for fine-tuning lightweight extraction models; evaluate mix of prompting + adapters to cut LLM spend.

---

## 2. Interface & Visualization Concepts

- **Semantic explorer UI** – Web dashboard listing papers, clickable graph nodes, and faceted filters (node type, confidence range, publication year). Backed by REST endpoints mirroring the queries in `src/examples/queries.ts`.
- **Explainability panel** – For any edge, show evidence snippet, source PDF location (using char offsets captured during extraction), and agent confidence, enabling users to audit assertions quickly.
- **Trend timelines** – Visualize relationships over time (e.g., how many papers improve_on 3DGS per quarter) with sparkline charts sourced from materialized views.
- **Embedded notebook widgets** – Provide Jupyter/Observable components that call the API and render mini graph visualizations for researchers.

---

## 3. Advanced Research Discovery Features

### 3.1 Semantic Queries
- **Natural-language question interface** – Use a smaller LLM to translate questions into SQL/graph queries, leveraging embeddings to identify relevant nodes/edges.
- **Cross-modal similarity** – Embed images/figures and align them with text embeddings so visual techniques (e.g., rendering samples) can be searched semantically.

### 3.2 Trend & Novelty Analysis
- **Temporal concept heatmaps** – Track emergence/decline of methods, datasets, and challenges across publication years.
- **Influence scoring** – Combine citation-style edges (`improves_on`, `extends`) with semantic similarity to spotlight foundational papers beyond raw citation counts.
- **Novelty alerts** – Detect when a paper introduces entities not previously seen in the graph or connects distant clusters; notify domain experts.

### 3.3 Recommendation & Workflow Support
- **Paper bundles** – Recommend reading lists based on a seed paper’s adjacent concepts + similar embeddings.
- **Experiment planning aid** – Surface datasets/metrics commonly used together to help practitioners design evaluations.
- **Collaboration graph** – Extend node types to include institutions or research groups, enabling author-network exploration once privacy considerations are addressed.

---

## 4. Dependency & Risk Tracking

| Initiative | Dependencies | Risks | Mitigations |
|------------|--------------|-------|-------------|
| Queue-based ingestion | Message broker, worker autoscaling | Job pile-up | Autoscaling + alerting |
| UI layer | Stable REST API, auth | Scope creep | Prioritize read-only MVP |
| Semantic question answering | Robust embeddings, secure LLM access | Hallucinated queries | Constrain via SQL templates + validation |
| Trend analysis | Consistent metadata (years, venues) | Missing publication data | Backfill via Semantic Scholar API |

---

## 5. Measuring Success

- **Operational KPIs**: papers processed/day, average ingestion latency, extraction accuracy sampled monthly, LLM cost per paper.
- **UX KPIs**: query latency, user session depth in explorer UI, adoption of explainability panels.
- **Discovery KPIs**: number of unique insights exported (e.g., novel link alerts), coverage of core concepts, responsiveness of semantic question answering.
