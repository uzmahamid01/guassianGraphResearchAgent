/**
 * Type definitions for the Research Knowledge Graph (RKG) system.
 * 
 * This file defines the core entities (nodes, edges, papers) and
 * agent-related structures for extracting and managing knowledge graph data.
 */

/**
 * Node types in the knowledge graph.
 */
export type NodeType =
  | 'paper'
  | 'concept'
  | 'method'
  | 'dataset'
  | 'metric'
  | 'author'
  | 'technique'
  | 'application'
  | 'challenge'
  | 'result';

/**
 * Edge types defining relationships between nodes in the knowledge graph.
 * Categorized for clarity: Paper-to-Paper, Paper-to-Concept, Concept-to-Concept, Method, Authorship, Other.
 */
export type EdgeType =
  // Paper-to-Paper relationships
  | 'cites'
  | 'improves_on'
  | 'extends'
  | 'compares_with'
  | 'builds_upon'
  | 'contradicts'
  // Paper-to-Concept relationships
  | 'introduces'
  | 'applies'
  | 'evaluates'
  | 'addresses'
  // Concept-to-Concept relationships
  | 'related_to'
  | 'enables'
  | 'requires'
  | 'alternative_to'
  | 'generalizes'
  | 'specializes'
  // Method relationships
  | 'outperforms'
  | 'combines_with'
  | 'replaces'
  // Authorship
  | 'authored_by'
  // Other semantic relationships
  | 'uses_dataset'
  | 'measures_with'
  | 'solves'
  | 'inspired_by';

/**
 * Node entity in the knowledge graph.
 */
export interface Node {
  id: string;
  type: NodeType;
  name: string;                // Display name of the entity
  canonical_name: string;      // Normalized name for consistent referencing
  description?: string;        // Optional textual description
  metadata: Record<string, any>; // Arbitrary metadata (JSON)
  extraction_confidence: number; // Confidence score from extraction agent (0-1)
  extracted_by: string;        // Agent or process that created this node
  extraction_timestamp: Date;  // When the node was extracted
  created_at: Date;            // Timestamp for creation in DB
  updated_at: Date;            // Timestamp for last update

  // Optional paper-specific fields
  arxiv_id?: string;
  doi?: string;
  publication_year?: number;
  venue?: string;
}

/**
 * Edge entity representing a relationship between two nodes.
 */
export interface Edge {
  id: string;
  type: EdgeType;
  source_id: string;           // Node ID of source
  target_id: string;           // Node ID of target
  description?: string;        // Optional description of relationship
  evidence?: string;           // Quote or reference supporting the edge
  confidence: number;          // Confidence score from extraction agent (0-1)
  extracted_by: string;        // Agent or process that created this edge
  extraction_timestamp: Date;  // When the edge was extracted
  metadata: Record<string, any>; // Arbitrary metadata
  created_at: Date;            // Timestamp for creation in DB
}

/**
 * Paper object representing a scientific publication.
 */
export interface Paper {
  id: string;
  title: string;
  abstract?: string;
  full_text?: string;
  authors: string[];
  arxiv_id?: string;
  doi?: string;
  publication_date?: Date;
  venue?: string;
  pdf_url?: string;
  pdf_path?: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'; // Pipeline status
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Log entry for paper extraction by agents.
 */
export interface ExtractionLog {
  id: string;
  paper_id: string;              // Related paper ID
  agent_name: string;            // Name of the agent performing extraction
  extraction_type: string;       // e.g., entity_extraction, relationship_extraction
  input_data: Record<string, any>;  // Data provided to the agent
  output_data: Record<string, any>; // Data returned by the agent
  success: boolean;
  error_message?: string;        // Error details if extraction failed
  execution_time_ms: number;     // Duration in milliseconds
  timestamp: Date;
}

// ===============================
// Agent-related types
// ===============================

/**
 * Represents an extracted entity from a paper.
 */
export interface ExtractedEntity {
  name: string;
  type: NodeType;
  description?: string;
  confidence: number;           // Confidence score (0-1)
  context?: string;             // Supporting text snippet from paper
  metadata?: Record<string, any>; // Optional metadata
}

/**
 * Represents a relationship extracted between entities.
 */
export interface ExtractedRelationship {
  source: string;               // Source entity name
  target: string;               // Target entity name
  type: EdgeType;
  description?: string;         // Optional description
  evidence?: string;            // Supporting quote from paper
  confidence: number;           // Confidence score (0-1)
  metadata?: Record<string, any>; // Optional metadata
}

/**
 * Aggregated analysis of a paper.
 */
export interface PaperAnalysis {
  paper_id: string;             // Paper ID
  entities: ExtractedEntity[];  // Extracted entities
  relationships: ExtractedRelationship[]; // Extracted relationships
  summary?: string;             // Optional summary of the paper
  key_contributions?: string[]; // Optional key contributions
  limitations?: string[];       // Optional limitations
}

// ===============================
// Agent configuration types
// ===============================

/**
 * Configuration for an LLM agent.
 */
export interface AgentConfig {
  name: string;                 // Agent name
  model: string;                // LLM model to use
  temperature: number;          // Sampling temperature
  max_tokens: number;           // Max tokens per response
  system_prompt?: string;       // Optional system prompt
}

/**
 * Extraction pipeline configuration.
 */
export interface ExtractionConfig {
  entity_extraction: AgentConfig;
  relationship_extraction: AgentConfig;
  validation: AgentConfig;
  normalization: AgentConfig;
}
