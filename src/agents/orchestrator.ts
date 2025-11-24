/**
 * Agent Orchestrator
 * 
 * Coordinates multiple specialized agents to process academic papers and
 * build the knowledge graph. Implements a multi-stage pipeline with
 * entity extraction, relationship extraction, validation, and logging.
 */

import { EntityExtractorAgent } from './entity-extractor.js';
import { RelationshipExtractorAgent } from './relationship-extractor.js';
import type { Paper, PaperAnalysis, ExtractedEntity, ExtractedRelationship } from '../types/index.js';
import { sql } from '../database/client.js';

/**
 * Orchestrates multi-agent processing of papers.
 */
export class AgentOrchestrator {
  private entityExtractor: EntityExtractorAgent;
  private relationshipExtractor: RelationshipExtractorAgent;

  constructor() {
    this.entityExtractor = new EntityExtractorAgent();
    this.relationshipExtractor = new RelationshipExtractorAgent();
  }

  /**
   * Process a single paper through the full pipeline.
   * 
   * Steps:
   *   1. Extract entities
   *   2. Extract relationships
   *   3. Validate and normalize entities and relationships
   *   4. Log extraction results
   * 
   * @param paper Paper to process
   * @param fullText Full text of the paper
   * @returns PaperAnalysis containing validated entities and relationships
   */
  async processPaper(paper: Paper, fullText: string): Promise<PaperAnalysis> {
    console.log(`\nProcessing paper: ${paper.title}`);
    const startTime = Date.now();

    try {
      // Stage 1: Entity extraction
      console.log('Stage 1: Extracting entities...');
      const entityResult = await this.entityExtractor.process({ paper, text: fullText });
      console.log(`Extracted ${entityResult.entities.length} entities`);

      // Log entity extraction
      await this.logExtraction(
        paper.id,
        'EntityExtractor',
        'entity',
        { text_length: fullText.length },
        { entity_count: entityResult.entities.length, entities: entityResult.entities },
        true,
        Date.now() - startTime
      );

      // Stage 2: Relationship extraction
      console.log('Stage 2: Extracting relationships...');
      const existingPapers = await this.getExistingPapers();

      const relationshipResult = await this.relationshipExtractor.process({
        paper,
        entities: entityResult.entities,
        text: fullText,
        existingPapers,
      });
      console.log(`Extracted ${relationshipResult.relationships.length} relationships`);

      // Log relationship extraction
      await this.logExtraction(
        paper.id,
        'RelationshipExtractor',
        'relationship',
        { entity_count: entityResult.entities.length, existing_papers: existingPapers.length },
        { relationship_count: relationshipResult.relationships.length, relationships: relationshipResult.relationships },
        true,
        Date.now() - startTime
      );

      // Stage 3: Validation and normalization
      console.log('Stage 3: Validating and normalizing...');
      const validatedEntities = await this.validateEntities(entityResult.entities);
      const validatedRelationships = await this.validateRelationships(relationshipResult.relationships, validatedEntities);

      const totalTime = Date.now() - startTime;
      console.log(`Processing complete in ${(totalTime / 1000).toFixed(2)}s`);

      return {
        paper_id: paper.id,
        entities: validatedEntities,
        relationships: validatedRelationships,
      };
    } catch (error) {
      console.error('Error processing paper:', error);

      // Log full pipeline failure
      await this.logExtraction(
        paper.id,
        'Orchestrator',
        'full_pipeline',
        { text_length: fullText.length },
        {},
        false,
        Date.now() - startTime,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  /**
   * Deduplicate and normalize entities based on their names.
   * Keeps the entity with higher confidence if duplicates exist.
   */
  private async validateEntities(entities: ExtractedEntity[]): Promise<ExtractedEntity[]> {
    const seen = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const normalized = this.normalizeName(entity.name);
      if (!seen.has(normalized)) {
        seen.set(normalized, entity);
      } else {
        const existing = seen.get(normalized)!;
        if (entity.confidence > existing.confidence) {
          seen.set(normalized, entity);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Validate relationships by ensuring at least one end is a recognized entity.
   */
  private async validateRelationships(
    relationships: ExtractedRelationship[],
    entities: ExtractedEntity[]
  ): Promise<ExtractedRelationship[]> {
    const entityNames = new Set(entities.map((e) => this.normalizeName(e.name)));

    return relationships.filter((rel) => {
      const sourceNorm = this.normalizeName(rel.source);
      const targetNorm = this.normalizeName(rel.target);
      return entityNames.has(sourceNorm) || entityNames.has(targetNorm);
    });
  }

  /**
   * Fetch recent completed papers from the database to enable cross-paper relationship extraction.
   */
  private async getExistingPapers(): Promise<Array<{ title: string; arxiv_id?: string }>> {
    try {
      const papers = await sql`
        SELECT title, arxiv_id
        FROM papers
        WHERE processing_status = 'completed'
        ORDER BY publication_date DESC
        LIMIT 100
      `;

      const rows = papers as unknown as Array<Record<string, any>>;
      return rows.map((r) => ({
        title: String(r.title),
        arxiv_id: r.arxiv_id == null ? undefined : String(r.arxiv_id),
      }));
    } catch (error) {
      console.warn('Could not fetch existing papers:', error);
      return [];
    }
  }

  /**
   * Normalize names for deduplication and comparison.
   * Converts to lowercase, trims spaces, removes special characters.
   */
  private normalizeName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s-]/g, '');
  }

  /**
   * Log the results of extraction stages to the database.
   */
  private async logExtraction(
    paperId: string,
    agentName: string,
    extractionType: string,
    inputData: Record<string, any>,
    outputData: Record<string, any>,
    success: boolean,
    executionTimeMs: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO extraction_logs (
          paper_id, agent_name, extraction_type,
          input_data, output_data,
          success, error_message, execution_time_ms
        ) VALUES (
          ${paperId}, ${agentName}, ${extractionType},
          ${JSON.stringify(inputData)}, ${JSON.stringify(outputData)},
          ${success}, ${errorMessage || null}, ${executionTimeMs}
        )
      `;
    } catch (error) {
      console.warn('Failed to log extraction:', error);
    }
  }

  /**
   * Batch process multiple papers sequentially with optional delay between batches.
   */
  async processPapers(
    papers: Array<{ paper: Paper; fullText: string }>,
    batchSize: number = 3
  ): Promise<PaperAnalysis[]> {
    const results: PaperAnalysis[] = [];

    for (let i = 0; i < papers.length; i += batchSize) {
      const batch = papers.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(papers.length / batchSize)}`);

      const batchResults = await Promise.all(
        batch.map(({ paper, fullText }) =>
          this.processPaper(paper, fullText).catch((error) => {
            console.error(`Failed to process ${paper.title}:`, error);
            return null;
          })
        )
      );

      results.push(...batchResults.filter((r): r is PaperAnalysis => r !== null));

      // Delay to avoid hitting rate limits
      if (i + batchSize < papers.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}
