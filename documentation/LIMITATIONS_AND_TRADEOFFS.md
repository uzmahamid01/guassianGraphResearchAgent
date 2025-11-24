# Limitations and Trade-offs

This document captures what is intentionally out of scope in the current implementation and the trade-offs made to ship a usable knowledge graph quickly.

---

## 1. Extraction Accuracy vs. Throughput

- **LLM-only extractions** – The pipeline relies on prompt-engineered general-purpose models (via `BaseAgent.callLLM`). No fine-tuning or human-in-the-loop verification exists yet, so subtle relationships can be missed or hallucinated. We favored rapid coverage of 50–100 papers over perfect precision.
- **Truncated context** – Agents limit input text to ~15k characters to keep latency and costs low; deep appendix insights or math-heavy derivations may be skipped. Future iterations can adopt chunked retrieval or vector-backed context windows at the cost of additional complexity.

## 2. Fixed Schema vs. Dynamic Ontology

- **Enum-locked types** – Node and edge types are hard-coded enums (`src/types/index.ts`, `schema.sql`). This guarantees strong typing and simpler APIs but requires migrations for every new ontology class. Allowing agents to invent types dynamically was deferred to avoid inconsistent graphs.
- **Paper-centric relationships** – All explicit edges originate from paper statements (paper→entity, paper→paper). Pure entity↔entity facts (e.g., _Method X requires Dataset Y_) are only inferred indirectly. This preserves provenance clarity but can under-represent cross-paper semantics.

## 3. Storage & Query Trade-offs

- **PostgreSQL-first** – A single Postgres instance simplifies ops but limits very deep graph traversals and billion-edge scaling. Migrating to Neo4j or a specialized vector DB is noted in `documentation/DESIGN_RATIONALE.md`, yet currently out of scope because the dataset is <1k papers.
- **Materialized views refresh manually** – `paper_stats` and `concept_stats` require manual refreshes after large ingestions; automated refresh jobs are not yet wired into CI/CD.

## 4. Operational Gaps

- **Limited observability** – Extraction logs capture stage-level metadata but there is no centralized metrics/alerting stack. Failures surface via console output or manual SQL inspection.
- **Secrets & tenancy** – LLM API keys are pulled from config files/env vars without secret rotation policies or per-tenant isolation. Multi-user deployments will need stricter secret management and RBAC.

## 5. User Experience Boundaries

- **No production UI** – Interaction currently happens via scripts (`src/examples/queries.ts`) or direct SQL. Building a visualization/search frontend is explicitly deferred to keep backend foundations stable first.
- **Explainability UX** – Although evidence strings are stored, there is no tooling yet to highlight the originating PDF span or provide counterfactual feedback loops.

---

## Summary of Deferred Items

| Area | Deferred Capability | Reason |
|------|--------------------|--------|
| Extraction | Fine-tuned models, retrieval-augmented prompting | Requires labeled data + budget |
| Ontology | Dynamic type/edge registration | Would complicate DB schema and API contracts |
| Storage | Graph DB / vector DB migration | Current scale manageable in Postgres |
| Ops | Automated monitoring/alerting | MVP prioritization, pending platform decision |
| UX | Web-based explorer / visual graph | Backend accuracy/fidelity prioritized first |
