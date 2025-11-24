/**
 * Node Repository
 * 
 * Handles all database interactions for graph nodes in the Research Knowledge Graph.
 * Responsibilities:
 * - Upserting nodes (create or update) with deduplication
 * - Batch upsert of extracted entities
 * - Querying nodes by ID, name, type, or fuzzy search
 * - Gathering node statistics
 */

import { sql } from '../client.js';
import type { Node, NodeType, ExtractedEntity } from '../../types/index.js';

export class NodeRepository {
  /**
   * Upsert a single node.
   * If a node with the same type and canonical_name exists:
   * - Merges metadata
   * - Updates extraction confidence if higher
   * - Updates the `updated_at` timestamp
   *
   * @param type - Node type (e.g., 'concept', 'method', 'dataset')
   * @param name - Node name (will be canonicalized for deduplication)
   * @param metadata - Arbitrary JSON metadata
   * @param extractedBy - Name of agent or system that created this node
   * @param confidence - Confidence in the extraction (0.0-1.0)
   * @returns ID of the created or updated node
   */
  async upsert(
    type: NodeType,
    name: string,
    metadata: Record<string, any> = {},
    extractedBy: string = 'system',
    confidence: number = 1.0
  ): Promise<string> {
    const canonicalName = this.normalizeName(name);
    
    const result = await sql`
      INSERT INTO nodes (
        type, name, canonical_name, metadata, 
        extracted_by, extraction_confidence
      ) VALUES (
        ${type}, ${name}, ${canonicalName}, ${JSON.stringify(metadata)},
        ${extractedBy}, ${confidence}
      )
      ON CONFLICT (type, canonical_name) 
      DO UPDATE SET 
        metadata = nodes.metadata || EXCLUDED.metadata,
        extraction_confidence = GREATEST(nodes.extraction_confidence, EXCLUDED.extraction_confidence),
        updated_at = NOW()
      RETURNING id
    `;
    
    return result[0].id;
  }

  /**
   * Batch upsert extracted entities.
   *
   * @param entities - Array of extracted entities
   * @param extractedBy - Agent responsible for extraction
   * @returns Map of canonicalized entity names -> node IDs
   */
  async upsertEntities(
    entities: ExtractedEntity[],
    extractedBy: string = 'EntityExtractor'
  ): Promise<Map<string, string>> {
    const nameToIdMap = new Map<string, string>();
    
    for (const entity of entities) {
      const nodeId = await this.upsert(
        entity.type,
        entity.name,
        {
          description: entity.description,
          context: entity.context,
          ...entity.metadata,
        },
        extractedBy,
        entity.confidence
      );
      
      nameToIdMap.set(this.normalizeName(entity.name), nodeId);
    }
    
    return nameToIdMap;
  }

  /**
   * Find a node by type and name.
   *
   * @param type - Node type
   * @param name - Node name
   * @returns Node or null if not found
   */
  async findByName(type: NodeType, name: string): Promise<Node | null> {
    const canonicalName = this.normalizeName(name);
    
    const result = await sql<Node[]>`
      SELECT * FROM nodes
      WHERE type = ${type} AND canonical_name = ${canonicalName}
      LIMIT 1
    `;
    
    return result[0] || null;
  }

  /**
   * Find a node by ID.
   *
   * @param id - Node ID
   * @returns Node or null if not found
   */
  async findById(id: string): Promise<Node | null> {
    const result = await sql<Node[]>`
      SELECT * FROM nodes
      WHERE id = ${id}
      LIMIT 1
    `;
    
    return result[0] || null;
  }

  /**
   * Get nodes by type.
   *
   * @param type - Node type
   * @param limit - Max number of nodes to return
   * @returns Array of nodes
   */
  async findByType(type: NodeType, limit: number = 100): Promise<Node[]> {
    return sql<Node[]>`
      SELECT * FROM nodes
      WHERE type = ${type}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Search nodes by name (fuzzy match using ILIKE and similarity).
   *
   * @param query - Search string
   * @param type - Optional filter by node type
   * @param limit - Max number of nodes to return
   * @returns Array of matching nodes
   */
  async search(query: string, type?: NodeType, limit: number = 20): Promise<Node[]> {
    if (type) {
      return sql<Node[]>`
        SELECT * FROM nodes
        WHERE type = ${type}
          AND (name ILIKE ${`%${query}%`} OR canonical_name ILIKE ${`%${query}%`})
        ORDER BY similarity(name, ${query}) DESC
        LIMIT ${limit}
      `;
    }
    
    return sql<Node[]>`
      SELECT * FROM nodes
      WHERE name ILIKE ${`%${query}%`} OR canonical_name ILIKE ${`%${query}%`}
      ORDER BY similarity(name, ${query}) DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get node statistics grouped by type.
   *
   * @returns Record mapping NodeType -> count
   */
  async getStats(): Promise<Record<NodeType, number>> {
    const result = await sql`
      SELECT type, COUNT(*) as count
      FROM nodes
      GROUP BY type
    `;
    
    const stats: Partial<Record<NodeType, number>> = {};
    for (const row of result) {
      stats[row.type as NodeType] = Number(row.count);
    }
    
    return stats as Record<NodeType, number>;
  }

  /**
   * Normalize a name for deduplication and consistent matching.
   *
   * - Lowercases
   * - Trims whitespace
   * - Collapses multiple spaces
   * - Removes special characters except hyphens
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s-]/g, '');
  }
}
