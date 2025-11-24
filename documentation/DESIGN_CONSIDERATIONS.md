# Design Rationale Across Key Considerations

This document distills how the current implementation addresses the four core consideration areas requested by the research sponsor. Each section references concrete modules under `src/` and the supporting database/schema assets.

---

## 1. Representing Data in the Graph

- **Typed schema with extensible metadata** – `NodeType` and `EdgeType` unions (`src/types/index.ts`) mirror PostgreSQL enums in `src/database/schema.sql`, giving us ten node classes (paper, concept, method, dataset, metric, author, technique, application, challenge, result) and rich relationship coverage (paper↔paper improvements, concept dependencies, dataset usage, etc.). JSONB `metadata` columns store per-type nuances (e.g., dataset size, metric units) without schema churn.
- **Deterministic provenance** – Every node/edge stores `extraction_confidence`, `extracted_by`, and `extraction_timestamp`, so analysts can audit which agent created which fact and what evidence backs it.
- **Semantic expressiveness** – Relationship evidence snippets plus description fields encode statements like _"Paper B improves_on Paper A by introducing concept X"_. Materialized views (`paper_stats`, `concept_stats`) and helper SQL functions in `schema.sql` keep these semantics queryable at scale.
- **Extensibility path** – Adding new node/edge classes requires updating the shared enums and applying a migration once usage justifies it; the orchestration layer already normalizes names, so future dynamic type registries can plug in with minimal disruption.

## 2. Extracting Entities & Relationships

- **Specialized agents** – The multi-agent approach (`EntityExtractorAgent`, `RelationshipExtractorAgent`, `AgentOrchestrator` in `src/agents/`) decomposes the task into focused LLM prompts, reducing hallucinations and improving controllability.
- **Prompt engineering** – System prompts enumerate allowed entity/edge types, enforce JSON schema, and demand evidence/context. User prompts feed title, abstract, and truncated full text to maintain token budgets while remaining grounded.
- **Validation loop** – `AgentOrchestrator` deduplicates entities via canonicalization, prunes relationships lacking resolvable endpoints, and records outcomes in `extraction_logs`. Repository layers enforce database uniqueness and merge metadata/confidence when duplicates appear.
- **Quality roadmap** – Config scaffolding (`ExtractionConfig` in `src/types/index.ts`) already anticipates dedicated validation/normalization agents. Future iterations can add few-shot exemplars, retrieval-augmented prompting, or fine-tuned lightweight models once labeled data accumulates.

## 3. User Experience & Use Cases

- **Queries-as-use-cases** – `src/examples/queries.ts` demonstrates semantic search, literature lineage, challenge coverage, dataset usage, and method comparisons, mapping directly to real analyst workflows (semantic search, novelty detection, benchmarking, research mapping).
- **Explainable insights** – Because edges keep `description` + `evidence`, downstream UIs can surface statements like _"Paper B improves_on Paper A (Results, 0.82 confidence)"_. Confidence scores help users gauge trust.
- **Access patterns** – Today’s interface is CLI/SQL-based, but the data model is REST/GraphQL-ready. Structured enums/metadata make it straightforward to build filters, autocomplete, and graph visualizations without brittle parsing.

## 4. Scalability, Maintenance, and Operations

- **Pipeline scalability** – Agents are stateless, and the `IngestionPipeline` batches work with retry/logging hooks, enabling horizontal scaling via job queues. Postgres remains the single stateful dependency until thresholds suggest migrating to Neo4j or a managed vector DB (see `documentation/DESIGN_RATIONALE.md` §2 & §6).
- **Refreshing corpus** – Acquisition scripts track `processing_status` per paper, so periodic re-runs can pick up new arXiv IDs while skipping processed ones. Materialized views can be refreshed asynchronously to keep analytics current.
- **Monitoring & resilience** – Extraction logs capture per-stage telemetry; combined with Postgres constraints and repository-level conflict resolution, the system tolerates transient LLM/IO failures while preserving data integrity.
- **Future guarantees** – Helper SQL functions (`upsert_node`, `create_edge`) encapsulate invariants, easing migrations. 
