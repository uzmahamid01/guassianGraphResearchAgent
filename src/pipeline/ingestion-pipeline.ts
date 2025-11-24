/**
 * Ingestion Pipeline
 * 
 * Orchestrates the full pipeline from paper ingestion to knowledge graph construction.
 * Handles paper creation, entity and relationship extraction, storage, and status management.
 */

import { PaperRepository } from '../database/repositories/paper-repository.js';
import { NodeRepository } from '../database/repositories/node-repository.js';
import { EdgeRepository } from '../database/repositories/edge-repository.js';
import { AgentOrchestrator } from '../agents/orchestrator.js';
import type { Paper, PaperAnalysis } from '../types/index.js';

export class IngestionPipeline {
  private paperRepo: PaperRepository;
  private nodeRepo: NodeRepository;
  private edgeRepo: EdgeRepository;
  private orchestrator: AgentOrchestrator;

  constructor() {
    this.paperRepo = new PaperRepository();
    this.nodeRepo = new NodeRepository();
    this.edgeRepo = new EdgeRepository();
    this.orchestrator = new AgentOrchestrator();
  }

  /**
   * Ingest a single paper into the knowledge graph.
   * This includes creating the paper record, extracting entities and relationships,
   * storing them in the graph, and updating the paper status.
   * 
   * @param paperData Paper details including title, abstract, full text, authors, etc.
   * @returns The stored paper and analysis results
   */
  async ingestPaper(paperData: {
    title: string;
    abstract?: string;
    full_text: string;
    authors: string[];
    arxiv_id?: string;
    doi?: string;
    publication_date?: Date;
    venue?: string;
    pdf_url?: string;
  }): Promise<{ paper: Paper; analysis: PaperAnalysis }> {
    console.log(`Ingesting paper: ${paperData.title}`);

    // Step 1: Create the paper record in the database
    console.log('Creating paper record...');
    const paper = await this.paperRepo.create(paperData);
    await this.paperRepo.updateStatus(paper.id, 'processing');

    try {
      // Step 2: Process the paper through the agent orchestrator
      const analysis = await this.orchestrator.processPaper(paper, paperData.full_text);

      // Step 3: Store extracted entities as nodes in the knowledge graph
      console.log('Storing entities in graph...');
      const entityMap = await this.nodeRepo.upsertEntities(analysis.entities, 'EntityExtractor');
      console.log(`Stored ${entityMap.size} unique entities`);

      // Step 4: Store extracted relationships as edges in the knowledge graph
      console.log('Storing relationships in graph...');
      const edgeCount = await this.edgeRepo.createRelationships(
        analysis.relationships,
        paper.id,
        entityMap,
        'RelationshipExtractor'
      );
      console.log(`Stored ${edgeCount} relationships`);

      // Step 5: Mark paper ingestion as completed
      await this.paperRepo.updateStatus(paper.id, 'completed');
      console.log('Successfully ingested paper');

      return { paper, analysis };
    } catch (error) {
      console.error('Error during ingestion:', error);
      await this.paperRepo.updateStatus(paper.id, 'failed');
      throw error;
    }
  }

  /**
   * Ingest multiple papers in batches.
   * Handles batch processing with optional delay between batches to avoid rate limits.
   * 
   * @param papers Array of paper data objects
   * @param batchSize Number of papers to ingest per batch (default 3)
   */
  async ingestPapers(
    papers: Array<{
      title: string;
      abstract?: string;
      full_text: string;
      authors: string[];
      arxiv_id?: string;
      doi?: string;
      publication_date?: Date;
      venue?: string;
      pdf_url?: string;
    }>,
    batchSize: number = 3
  ): Promise<void> {
    console.log(`Starting batch ingestion of ${papers.length} papers`);
    console.log(`Batch size: ${batchSize}`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < papers.length; i += batchSize) {
      const batch = papers.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(papers.length / batchSize);

      console.log(`Processing batch ${batchNum} of ${totalBatches}`);

      const results = await Promise.allSettled(batch.map((paperData) => this.ingestPaper(paperData)));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          failCount++;
          console.error('Batch item failed:', result.reason);
        }
      }

      // Optional delay between batches
      if (i + batchSize < papers.length) {
        console.log('Waiting before processing next batch...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log('Batch ingestion complete');
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
  }

  /**
   * Reprocess an existing paper.
   * Useful if extraction algorithms are updated or improved.
   * 
   * @param paperId ID of the paper to reprocess
   */
  async reprocessPaper(paperId: string): Promise<void> {
    const paper = await this.paperRepo.findById(paperId);
    if (!paper) {
      throw new Error(`Paper not found: ${paperId}`);
    }
    if (!paper.full_text) {
      throw new Error(`Paper has no full text: ${paperId}`);
    }

    console.log(`Reprocessing paper: ${paper.title}`);
    await this.paperRepo.updateStatus(paper.id, 'processing');

    try {
      // Process paper again through orchestrator
      const analysis = await this.orchestrator.processPaper(paper, paper.full_text);

      // Store updated entities and relationships
      const entityMap = await this.nodeRepo.upsertEntities(analysis.entities);
      await this.edgeRepo.createRelationships(analysis.relationships, paper.id, entityMap);

      await this.paperRepo.updateStatus(paper.id, 'completed');
      console.log('Reprocessing complete');
    } catch (error) {
      await this.paperRepo.updateStatus(paper.id, 'failed');
      throw error;
    }
  }

  /**
   * Retrieve basic statistics about the pipeline.
   * Returns counts of papers, nodes, and edges.
   */
  async getStats(): Promise<{
    papers: any;
    nodes: any;
    edges: any;
  }> {
    const [paperStats, nodeStats, edgeStats] = await Promise.all([
      this.paperRepo.getStats(),
      this.nodeRepo.getStats(),
      this.edgeRepo.getStats(),
    ]);

    return {
      papers: paperStats,
      nodes: nodeStats,
      edges: edgeStats,
    };
  }
}
