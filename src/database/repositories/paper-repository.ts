/**
 * Paper Repository
 * 
 * Handles database operations for research papers, including:
 * - Creating papers with upsert logic
 * - Updating processing status
 * - Searching and querying papers
 * - Gathering statistics
 */

import { sql } from '../client.js';
import type { Paper } from '../../types/index.js';
import { NodeRepository } from './node-repository.js';

export class PaperRepository {
  private nodeRepo: NodeRepository;

  constructor() {
    this.nodeRepo = new NodeRepository();
  }

  /**
   * Create a new paper record and corresponding node.
   * If a paper with the same arXiv ID exists, updates title, abstract, and timestamp.
   *
   * @param paperData - Metadata and content of the paper
   * @returns The created or updated Paper object
   */
  async create(paperData: {
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
  }): Promise<Paper> {
    // Upsert paper as a node in the graph
    const nodeId = await this.nodeRepo.upsert(
      'paper',
      paperData.title,
      {
        abstract: paperData.abstract,
        authors: paperData.authors,
        venue: paperData.venue,
      },
      'system',
      1.0
    );

    // Insert paper record in the papers table
    const result = await sql<Paper[]>`
      INSERT INTO papers (
        id, title, abstract, full_text, authors,
        arxiv_id, doi, publication_date, venue,
        pdf_url, pdf_path, processing_status
      ) VALUES (
        ${nodeId},
        ${paperData.title},
        ${paperData.abstract || null},
        ${paperData.full_text || null},
        ${paperData.authors},
        ${paperData.arxiv_id || null},
        ${paperData.doi || null},
        ${paperData.publication_date || null},
        ${paperData.venue || null},
        ${paperData.pdf_url || null},
        ${paperData.pdf_path || null},
        'pending'
      )
      ON CONFLICT (arxiv_id) 
      DO UPDATE SET
        title = EXCLUDED.title,
        abstract = EXCLUDED.abstract,
        updated_at = NOW()
      RETURNING *
    `;

    return result[0];
  }

  /**
   * Update the processing status of a paper.
   *
   * @param paperId - Node ID of the paper
   * @param status - New status ('pending', 'processing', 'completed', 'failed')
   */
  async updateStatus(
    paperId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    await sql`
      UPDATE papers
      SET processing_status = ${status},
          processed_at = ${status === 'completed' ? sql`NOW()` : sql`processed_at`},
          updated_at = NOW()
      WHERE id = ${paperId}
    `;
  }

  /**
   * Find a paper by its node ID.
   *
   * @param id - Paper node ID
   * @returns Paper or null if not found
   */
  async findById(id: string): Promise<Paper | null> {
    const result = await sql<Paper[]>`
      SELECT * FROM papers
      WHERE id = ${id}
      LIMIT 1
    `;
    return result[0] || null;
  }

  /**
   * Find a paper by its arXiv ID.
   *
   * @param arxivId - arXiv identifier
   * @returns Paper or null if not found
   */
  async findByArxivId(arxivId: string): Promise<Paper | null> {
    const result = await sql<Paper[]>`
      SELECT * FROM papers
      WHERE arxiv_id = ${arxivId}
      LIMIT 1
    `;
    return result[0] || null;
  }

  /**
   * Get papers by processing status.
   *
   * @param status - 'pending' | 'processing' | 'completed' | 'failed'
   * @param limit - Maximum number of papers to return
   * @returns Array of Paper objects
   */
  async findByStatus(
    status: 'pending' | 'processing' | 'completed' | 'failed',
    limit: number = 100
  ): Promise<Paper[]> {
    return sql<Paper[]>`
      SELECT * FROM papers
      WHERE processing_status = ${status}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get all papers with optional pagination.
   *
   * @param limit - Max number of papers to return
   * @param offset - Offset for pagination
   * @returns Array of Paper objects
   */
  async findAll(limit: number = 100, offset: number = 0): Promise<Paper[]> {
    return sql<Paper[]>`
      SELECT * FROM papers
      ORDER BY publication_date DESC NULLS LAST
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }

  /**
   * Search papers by title or abstract.
   *
   * @param query - Search string
   * @param limit - Max number of papers to return
   * @returns Array of matching papers
   */
  async search(query: string, limit: number = 20): Promise<Paper[]> {
    return sql<Paper[]>`
      SELECT * FROM papers
      WHERE title ILIKE ${`%${query}%`} OR abstract ILIKE ${`%${query}%`}
      ORDER BY publication_date DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get statistics about papers.
   *
   * @returns Object containing total papers and breakdown by processing status
   */
  async getStats(): Promise<{
    total: number;
    by_status: Record<string, number>;
  }> {
    const totalResult = await sql`SELECT COUNT(*) as count FROM papers`;
    const statusResult = await sql`
      SELECT processing_status, COUNT(*) as count
      FROM papers
      GROUP BY processing_status
    `;

    const byStatus: Record<string, number> = {};
    for (const row of statusResult) {
      byStatus[row.processing_status] = Number(row.count);
    }

    return {
      total: Number(totalResult[0].count),
      by_status: byStatus,
    };
  }
}
