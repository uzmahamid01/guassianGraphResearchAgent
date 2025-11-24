-- ============================================================================
-- RESEARCH KNOWLEDGE GRAPH SCHEMA
-- ============================================================================
-- This schema represents an academic knowledge graph optimized for semantic
-- relationships between papers, concepts, methods, and entities.
-- 
-- Design Philosophy:
-- - Flexible node/edge type system for extensibility
-- - JSONB for semi-structured metadata
-- - Indexes optimized for graph traversal queries
-- - Support for confidence scores and provenance tracking
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text matching
CREATE EXTENSION IF NOT EXISTS vector; -- Required for pgvector embeddings

-- ============================================================================
-- NODE TYPES
-- ============================================================================

CREATE TYPE node_type AS ENUM (
  'paper',
  'concept',
  'method',
  'dataset',
  'metric',
  'author',
  'technique',
  'application',
  'challenge',
  'result'
);

-- ============================================================================
-- EDGE TYPES (Semantic Relationships)
-- ============================================================================

CREATE TYPE edge_type AS ENUM (
  -- Paper-to-Paper relationships
  'cites',
  'improves_on',
  'extends',
  'compares_with',
  'builds_upon',
  'contradicts',
  
  -- Paper-to-Concept relationships
  'introduces',
  'applies',
  'evaluates',
  'addresses',
  
  -- Concept-to-Concept relationships
  'related_to',
  'enables',
  'requires',
  'alternative_to',
  'generalizes',
  'specializes',
  
  -- Method relationships
  'outperforms',
  'combines_with',
  'replaces',
  
  -- Authorship
  'authored_by',
  
  -- Other semantic relationships
  'uses_dataset',
  'measures_with',
  'solves',
  'inspired_by'
);

-- ============================================================================
-- NODES TABLE
-- ============================================================================

CREATE TABLE nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type node_type NOT NULL,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL, -- Normalized version for deduplication
  description TEXT,
  
  -- Metadata stored as JSONB for flexibility
  metadata JSONB DEFAULT '{}',
  
  -- For papers
  arxiv_id TEXT,
  doi TEXT,
  publication_year INTEGER,
  venue TEXT,
  
  -- Confidence and provenance
  extraction_confidence FLOAT DEFAULT 1.0,
  extracted_by TEXT, -- Agent name
  extraction_timestamp TIMESTAMP DEFAULT NOW(),
  
  -- Tracking
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicates on canonical names per type
  UNIQUE(type, canonical_name)
);

-- ============================================================================
-- EDGES TABLE
-- ============================================================================

CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type edge_type NOT NULL,
  source_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  
  -- Edge properties
  description TEXT,
  evidence TEXT, -- Quote or context from paper
  
  -- Confidence and provenance
  confidence FLOAT DEFAULT 1.0,
  extracted_by TEXT,
  extraction_timestamp TIMESTAMP DEFAULT NOW(),
  
  -- Metadata for edge-specific properties
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate edges
  UNIQUE(type, source_id, target_id)
);

-- ============================================================================
-- PAPERS TABLE (Detailed paper information)
-- ============================================================================

CREATE TABLE papers (
  id UUID PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  abstract TEXT,
  full_text TEXT,
  
  -- Paper metadata
  authors TEXT[],
  arxiv_id TEXT UNIQUE,
  doi TEXT,
  publication_date DATE,
  venue TEXT,
  
  -- PDF and source information
  pdf_url TEXT,
  pdf_path TEXT,
  
  -- Processing status
  processing_status TEXT DEFAULT 'pending',
  processed_at TIMESTAMP,
  
  -- Embeddings for semantic search (future)
  title_embedding vector(1536),
  abstract_embedding vector(1536),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- EXTRACTION LOGS (For debugging and quality control)
-- ============================================================================

CREATE TABLE extraction_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  extraction_type TEXT NOT NULL, -- 'entity', 'relationship', 'validation'
  
  input_data JSONB,
  output_data JSONB,
  
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  execution_time_ms INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Node indexes
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_canonical ON nodes(canonical_name);
CREATE INDEX idx_nodes_name_trgm ON nodes USING gin(name gin_trgm_ops);
CREATE INDEX idx_nodes_metadata ON nodes USING gin(metadata);
CREATE INDEX idx_nodes_arxiv ON nodes(arxiv_id) WHERE arxiv_id IS NOT NULL;

-- Edge indexes for graph traversal
CREATE INDEX idx_edges_type ON edges(type);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_source_type ON edges(source_id, type);
CREATE INDEX idx_edges_target_type ON edges(target_id, type);
CREATE INDEX idx_edges_metadata ON edges USING gin(metadata);

-- Paper indexes
CREATE INDEX idx_papers_arxiv ON papers(arxiv_id);
CREATE INDEX idx_papers_status ON papers(processing_status);
CREATE INDEX idx_papers_year ON papers(publication_date);

-- ============================================================================
-- MATERIALIZED VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Paper statistics with citation counts
CREATE MATERIALIZED VIEW paper_stats AS
SELECT 
  n.id,
  n.name as title,
  p.arxiv_id,
  p.publication_date,
  COUNT(DISTINCT e_citations.id) as citation_count,
  COUNT(DISTINCT e_improves.id) as improvement_count,
  COUNT(DISTINCT concepts.id) as concept_count
FROM nodes n
JOIN papers p ON n.id = p.id
LEFT JOIN edges e_citations ON n.id = e_citations.target_id AND e_citations.type = 'cites'
LEFT JOIN edges e_improves ON n.id = e_improves.target_id AND e_improves.type = 'improves_on'
LEFT JOIN edges e_concepts ON n.id = e_concepts.source_id AND e_concepts.type = 'introduces'
LEFT JOIN nodes concepts ON e_concepts.target_id = concepts.id AND concepts.type = 'concept'
WHERE n.type = 'paper'
GROUP BY n.id, n.name, p.arxiv_id, p.publication_date;

CREATE UNIQUE INDEX idx_paper_stats_id ON paper_stats(id);

-- View: Concept popularity across papers
CREATE MATERIALIZED VIEW concept_stats AS
SELECT 
  n.id,
  n.name as concept_name,
  COUNT(DISTINCT e.source_id) as paper_count,
  ARRAY_AGG(DISTINCT papers.name ORDER BY papers.name) as papers
FROM nodes n
LEFT JOIN edges e ON n.id = e.target_id AND e.type IN ('introduces', 'applies', 'evaluates')
LEFT JOIN nodes papers ON e.source_id = papers.id AND papers.type = 'paper'
WHERE n.type IN ('concept', 'method', 'technique')
GROUP BY n.id, n.name;

CREATE UNIQUE INDEX idx_concept_stats_id ON concept_stats(id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to normalize names for deduplication
CREATE OR REPLACE FUNCTION normalize_name(name TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(trim(name), '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to find or create a node (upsert pattern)
CREATE OR REPLACE FUNCTION upsert_node(
  p_type node_type,
  p_name TEXT,
  p_metadata JSONB DEFAULT '{}',
  p_extracted_by TEXT DEFAULT 'system'
) RETURNS UUID AS $$
DECLARE
  v_canonical_name TEXT;
  v_node_id UUID;
BEGIN
  v_canonical_name := normalize_name(p_name);
  
  INSERT INTO nodes (type, name, canonical_name, metadata, extracted_by)
  VALUES (p_type, p_name, v_canonical_name, p_metadata, p_extracted_by)
  ON CONFLICT (type, canonical_name) 
  DO UPDATE SET 
    metadata = nodes.metadata || p_metadata,
    updated_at = NOW()
  RETURNING id INTO v_node_id;
  
  RETURN v_node_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create an edge with validation
CREATE OR REPLACE FUNCTION create_edge(
  p_type edge_type,
  p_source_id UUID,
  p_target_id UUID,
  p_description TEXT DEFAULT NULL,
  p_evidence TEXT DEFAULT NULL,
  p_confidence FLOAT DEFAULT 1.0,
  p_extracted_by TEXT DEFAULT 'system'
) RETURNS UUID AS $$
DECLARE
  v_edge_id UUID;
BEGIN
  INSERT INTO edges (type, source_id, target_id, description, evidence, confidence, extracted_by)
  VALUES (p_type, p_source_id, p_target_id, p_description, p_evidence, p_confidence, p_extracted_by)
  ON CONFLICT (type, source_id, target_id) 
  DO UPDATE SET 
    description = COALESCE(EXCLUDED.description, edges.description),
    evidence = COALESCE(EXCLUDED.evidence, edges.evidence),
    confidence = GREATEST(edges.confidence, EXCLUDED.confidence)
  RETURNING id INTO v_edge_id;
  
  RETURN v_edge_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EXAMPLE QUERIES (See queries.ts for TypeScript implementations)
-- ============================================================================

-- Query 1: Which papers improve on the original 3DGS method?
-- SELECT 
--   p.title,
--   p.arxiv_id,
--   p.publication_date,
--   e.description,
--   e.confidence
-- FROM edges e
-- JOIN papers p ON e.source_id = p.id
-- JOIN papers original ON e.target_id = original.id
-- WHERE e.type = 'improves_on'
--   AND original.title ILIKE '%3D Gaussian Splatting%'
-- ORDER BY p.publication_date DESC;

-- Query 2: What are the most influential concepts in Gaussian Splatting?
-- SELECT 
--   n.name,
--   COUNT(DISTINCT e.source_id) as paper_count,
--   AVG(e.confidence) as avg_confidence
-- FROM nodes n
-- JOIN edges e ON n.id = e.target_id
-- WHERE n.type IN ('concept', 'method', 'technique')
--   AND e.type IN ('introduces', 'applies')
-- GROUP BY n.id, n.name
-- ORDER BY paper_count DESC
-- LIMIT 20;

-- Query 3: Find papers that use specific techniques
-- SELECT DISTINCT
--   p.title,
--   p.arxiv_id,
--   array_agg(n.name) as techniques
-- FROM papers p
-- JOIN edges e ON p.id = e.source_id
-- JOIN nodes n ON e.target_id = n.id
-- WHERE n.type = 'technique'
--   AND e.type = 'applies'
-- GROUP BY p.id, p.title, p.arxiv_id;

-- Query 4: Traversal - Papers connected through concepts (2-hop)
-- WITH concept_papers AS (
--   SELECT e1.source_id as paper1_id, e1.target_id as concept_id, e2.source_id as paper2_id
--   FROM edges e1
--   JOIN edges e2 ON e1.target_id = e2.target_id
--   WHERE e1.type IN ('introduces', 'applies')
--     AND e2.type IN ('introduces', 'applies')
--     AND e1.source_id != e2.source_id
-- )
-- SELECT 
--   p1.title as paper1,
--   n.name as shared_concept,
--   p2.title as paper2
-- FROM concept_papers cp
-- JOIN papers p1 ON cp.paper1_id = p1.id
-- JOIN papers p2 ON cp.paper2_id = p2.id
-- JOIN nodes n ON cp.concept_id = n.id
-- LIMIT 100;
