/**
 * Edge Repository
 * 
 * Handles all database interactions for graph edges (relationships) 
 * in the Research Knowledge Graph system. Responsible for:
 * - Creating edges (with conflict resolution)
 * - Batch insertion from extracted relationships
 * - Resolving entity names to node IDs
 * - Querying edges by source or target
 * - Gathering edge statistics
 */

import { sql } from '../client.js';
import type { Edge, EdgeType, ExtractedRelationship } from '../../types/index.js';
import { NodeRepository } from './node-repository.js';

export class EdgeRepository {
  private nodeRepo: NodeRepository;

  constructor() {
    this.nodeRepo = new NodeRepository();
  }

  /**
   * Create a single edge in the database with conflict resolution.
   * If an edge already exists between source and target of the same type:
   * - Keeps the highest confidence
   * - Merges metadata
   * - Preserves existing description/evidence if not provided
   *
   * @param type - The type of edge (relationship)
   * @param sourceId - ID of the source node
   * @param targetId - ID of the target node
   * @param description - Optional textual description of the edge
   * @param evidence - Optional supporting evidence
   * @param confidence - Confidence score (0.0-1.0)
   * @param extractedBy - Agent or system that generated the edge
   * @param metadata - Additional metadata as a key-value map
   * @returns ID of the created or updated edge
   */
  async create(
    type: EdgeType,
    sourceId: string,
    targetId: string,
    description?: string,
    evidence?: string,
    confidence: number = 1.0,
    extractedBy: string = 'system',
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const result = await sql`
      INSERT INTO edges (
        type, source_id, target_id, description, evidence,
        confidence, extracted_by, metadata
      ) VALUES (
        ${type}, ${sourceId}, ${targetId}, ${description || null}, ${evidence || null},
        ${confidence}, ${extractedBy}, ${JSON.stringify(metadata)}
      )
      ON CONFLICT (type, source_id, target_id) 
      DO UPDATE SET 
        description = COALESCE(EXCLUDED.description, edges.description),
        evidence = COALESCE(EXCLUDED.evidence, edges.evidence),
        confidence = GREATEST(edges.confidence, EXCLUDED.confidence),
        metadata = edges.metadata || EXCLUDED.metadata
      RETURNING id
    `;
    
    return result[0].id;
  }

  /**
   * Batch-create edges from extracted relationships.
   * Resolves entity names to node IDs using current and existing nodes.
   *
   * @param relationships - Array of extracted relationships
   * @param paperId - Current paper ID
   * @param entityNameToIdMap - Map of normalized entity names to node IDs for this paper
   * @param extractedBy - Name of the agent creating edges
   * @returns Number of successfully created edges
   */
  async createRelationships(
    relationships: ExtractedRelationship[],
    paperId: string,
    entityNameToIdMap: Map<string, string>,
    extractedBy: string = 'RelationshipExtractor'
  ): Promise<number> {
    let createdCount = 0;
    
    for (const rel of relationships) {
      try {
        const sourceId = await this.resolveEntityId(rel.source, paperId, entityNameToIdMap);
        const targetId = await this.resolveEntityId(rel.target, paperId, entityNameToIdMap);
        
        if (!sourceId || !targetId) {
          console.warn(`Could not resolve entities for relationship: ${rel.source} -> ${rel.target}`);
          continue;
        }
        
        await this.create(
          rel.type,
          sourceId,
          targetId,
          rel.description,
          rel.evidence,
          rel.confidence,
          extractedBy,
          rel.metadata || {}
        );
        
        createdCount++;
      } catch (error) {
        console.error(`Failed to create edge: ${rel.source} -> ${rel.target}:`, error);
      }
    }
    
    return createdCount;
  }

  /**
   * Resolve an entity name to its node ID.
   * Checks:
   * 1. Current paper's entities
   * 2. Paper itself
   * 3. Existing nodes in database
   *
   * @param entityName - Name of the entity
   * @param paperId - ID of the current paper
   * @param entityNameToIdMap - Map of normalized entity names to node IDs
   * @returns Node ID or null if not found
   */
  private async resolveEntityId(
    entityName: string,
    paperId: string,
    entityNameToIdMap: Map<string, string>
  ): Promise<string | null> {
    const normalized = this.normalizeName(entityName);
    
    if (entityNameToIdMap.has(normalized)) {
      return entityNameToIdMap.get(normalized)!;
    }
    
    const paperNode = await this.nodeRepo.findById(paperId);
    if (paperNode && this.normalizeName(paperNode.name) === normalized) {
      return paperId;
    }
    
    const existingNodes = await this.nodeRepo.search(entityName, undefined, 5);
    if (existingNodes.length > 0) {
      return existingNodes[0].id;
    }
    
    return null;
  }

  /**
   * Find all edges where the given node is the source.
   *
   * @param sourceId - Node ID
   * @param type - Optional filter by edge type
   * @returns Array of edges
   */
  async findBySource(sourceId: string, type?: EdgeType): Promise<Edge[]> {
    if (type) {
      return sql<Edge[]>`
        SELECT * FROM edges
        WHERE source_id = ${sourceId} AND type = ${type}
        ORDER BY created_at DESC
      `;
    }
    
    return sql<Edge[]>`
      SELECT * FROM edges
      WHERE source_id = ${sourceId}
      ORDER BY created_at DESC
    `;
  }

  /**
   * Find all edges where the given node is the target.
   *
   * @param targetId - Node ID
   * @param type - Optional filter by edge type
   * @returns Array of edges
   */
  async findByTarget(targetId: string, type?: EdgeType): Promise<Edge[]> {
    if (type) {
      return sql<Edge[]>`
        SELECT * FROM edges
        WHERE target_id = ${targetId} AND type = ${type}
        ORDER BY created_at DESC
      `;
    }
    
    return sql<Edge[]>`
      SELECT * FROM edges
      WHERE target_id = ${targetId}
      ORDER BY created_at DESC
    `;
  }

  /**
   * Get statistics of edges by type.
   *
   * @returns Record mapping EdgeType -> count
   */
  async getStats(): Promise<Record<EdgeType, number>> {
    const result = await sql`
      SELECT type, COUNT(*) as count
      FROM edges
      GROUP BY type
    `;
    
    const stats: Partial<Record<EdgeType, number>> = {};
    for (const row of result) {
      stats[row.type as EdgeType] = Number(row.count);
    }
    
    return stats as Record<EdgeType, number>;
  }

  /**
   * Normalize a string for deduplication/matching.
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s-]/g, '');
  }
}
