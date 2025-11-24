/**
 * Example Queries
 * 
 * Demonstrates the types of queries enabled by the knowledge graph.
 * These showcase semantic search and graph traversal capabilities.
 */

import { fileURLToPath } from 'url';
import { sql } from '../database/client.js';

export class KnowledgeGraphQueries {
  /**
   * Query 1: Which papers improve on the original 3DGS method?
   */
  async getPapersImprovingOn3DGS() {
    console.log('\n📊 Query 1: Papers that improves on 3D Gaussian Splatting\n');
    
    const results = await sql`
      SELECT 
        p.title,
        p.arxiv_id,
        p.publication_date,
        e.description as improvement_description,
        e.evidence,
        e.confidence
      FROM edges e
      JOIN papers p ON e.source_id = p.id
      JOIN papers original ON e.target_id = original.id
      WHERE e.type = 'improves_on'
        AND original.title ILIKE '%3D Gaussian Splatting%'
      ORDER BY p.publication_date DESC, e.confidence DESC
    `;
    
    console.log(`Found ${results.length} papers:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   arXiv: ${r.arxiv_id || 'N/A'}`);
      console.log(`   Date: ${r.publication_date || 'N/A'}`);
      console.log(`   Improvement: ${r.improvement_description || 'Not specified'}`);
      console.log(`   Confidence: ${(Number(r.confidence) * 100).toFixed(0)}%\n`);
    });
    
    return results;
  }

  /**
   * Query 2: What are the most influential concepts in Gaussian Splatting research?
   */
  async getMostInfluentialConcepts(limit: number = 20) {
    console.log('\n📊 Query 2: Most Influential Concepts\n');
    
    const results = await sql`
      SELECT 
        n.name as concept_name,
        n.type as concept_type,
        n.description,
        COUNT(DISTINCT e.source_id) as paper_count,
        AVG(e.confidence) as avg_confidence,
        array_agg(DISTINCT p.title ORDER BY p.title) as papers
      FROM nodes n
      JOIN edges e ON n.id = e.target_id
      LEFT JOIN papers p ON e.source_id = p.id
      WHERE n.type IN ('concept', 'method', 'technique')
        AND e.type IN ('introduces', 'applies', 'evaluates')
      GROUP BY n.id, n.name, n.type, n.description
      ORDER BY paper_count DESC, avg_confidence DESC
      LIMIT ${limit}
    `;
    
    console.log(`Top ${results.length} concepts:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.concept_name} (${r.concept_type})`);
      console.log(`   Used in ${r.paper_count} paper(s)`);
      console.log(`   Avg confidence: ${(Number(r.avg_confidence) * 100).toFixed(0)}%`);
      console.log(`   Description: ${r.description || 'N/A'}\n`);
    });
    
    return results;
  }

  /**
   * Query 3: Find papers that use specific techniques
   */
  async getPapersUsingTechnique(techniqueName: string) {
    console.log(`\n📊 Query 3: Papers Using "${techniqueName}"\n`);
    
    const results = await sql`
      SELECT DISTINCT
        p.title,
        p.arxiv_id,
        p.publication_date,
        e.description as usage_description,
        e.confidence
      FROM papers p
      JOIN edges e ON p.id = e.source_id
      JOIN nodes n ON e.target_id = n.id
      WHERE n.name ILIKE ${`%${techniqueName}%`}
        AND n.type IN ('technique', 'method')
        AND e.type = 'applies'
      ORDER BY e.confidence DESC, p.publication_date DESC
    `;
    
    console.log(`Found ${results.length} papers:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   How used: ${r.usage_description || 'Not specified'}`);
      console.log(`   Confidence: ${(Number(r.confidence) * 100).toFixed(0)}%\n`);
    });
    
    return results;
  }

  /**
   * Query 4: Papers connected through shared concepts (2-hop traversal)
   */
  async findRelatedPapersThroughConcepts(paperTitle: string, limit: number = 10) {
    console.log(`\n📊 Query 4: Papers Related to "${paperTitle}" Through Shared Concepts\n`);
    
    const results = await sql`
      WITH target_paper AS (
        SELECT id FROM papers WHERE title ILIKE ${`%${paperTitle}%`} LIMIT 1
      ),
      paper_concepts AS (
        SELECT e.target_id as concept_id, n.name as concept_name
        FROM edges e
        JOIN nodes n ON e.target_id = n.id
        CROSS JOIN target_paper
        WHERE e.source_id = target_paper.id
          AND e.type IN ('introduces', 'applies', 'evaluates')
          AND n.type IN ('concept', 'method', 'technique')
      ),
      related_papers AS (
        SELECT 
          e2.source_id as related_paper_id,
          pc.concept_name,
          COUNT(*) as shared_concept_count
        FROM paper_concepts pc
        JOIN edges e2 ON pc.concept_id = e2.target_id
        WHERE e2.type IN ('introduces', 'applies', 'evaluates')
          AND e2.source_id != (SELECT id FROM target_paper)
        GROUP BY e2.source_id, pc.concept_name
      )
      SELECT 
        p.title,
        p.arxiv_id,
        array_agg(DISTINCT rp.concept_name ORDER BY rp.concept_name) as shared_concepts,
        SUM(rp.shared_concept_count) as total_connections
      FROM related_papers rp
      JOIN papers p ON rp.related_paper_id = p.id
      GROUP BY p.id, p.title, p.arxiv_id
      ORDER BY total_connections DESC
      LIMIT ${limit}
    `;
    
    console.log(`Found ${results.length} related papers:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   Shared concepts: ${r.shared_concepts.join(', ')}`);
      console.log(`   Connection strength: ${r.total_connections}\n`);
    });
    
    return results;
  }

  /**
   * Query 5: What challenges does each paper address?
   */
  async getChallengesSolved() {
    console.log('\n📊 Query 5: Challenges Addressed by Papers\n');
    
    const results = await sql`
      SELECT 
        p.title,
        n.name as challenge,
        n.description as challenge_description,
        e.evidence
      FROM papers p
      JOIN edges e ON p.id = e.source_id
      JOIN nodes n ON e.target_id = n.id
      WHERE n.type = 'challenge'
        AND e.type IN ('addresses', 'solves')
      ORDER BY p.publication_date DESC
    `;
    
    console.log(`Found ${results.length} challenge-solution pairs:\n`);
    
    // Group by paper
    const byPaper = new Map<string, any[]>();
    results.forEach((r) => {
      if (!byPaper.has(r.title)) {
        byPaper.set(r.title, []);
      }
      byPaper.get(r.title)!.push(r);
    });
    
    let i = 1;
    byPaper.forEach((challenges, title) => {
      console.log(`${i}. ${title}`);
      challenges.forEach((c) => {
        console.log(`   ✓ ${c.challenge}`);
        if (c.challenge_description) {
          console.log(`     ${c.challenge_description}`);
        }
      });
      console.log('');
      i++;
    });
    
    return results;
  }

  /**
   * Query 6: Performance comparisons between methods
   */
  async getMethodComparisons() {
    console.log('\n📊 Query 6: Method Performance Comparisons\n');
    
    const results = await sql`
      WITH method_sources AS (
        SELECT 
          e.target_id AS method_id,
          p.title AS paper_title
        FROM edges e
        JOIN nodes n ON e.target_id = n.id
        JOIN papers p ON e.source_id = p.id
        WHERE e.type = 'introduces'
          AND n.type IN ('method', 'technique')
      )
      SELECT 
        COALESCE(ms.paper_title, 'Unknown source paper') as paper_with_method,
        n1.name as method1,
        n2.name as method2,
        e.description as comparison,
        e.evidence,
        e.confidence,
        reported.title as reported_by
      FROM edges e
      JOIN nodes n1 ON e.source_id = n1.id
      JOIN nodes n2 ON e.target_id = n2.id
      LEFT JOIN method_sources ms ON ms.method_id = n1.id
      LEFT JOIN papers reported ON reported.id = (e.metadata->>'reported_by_paper_id')::uuid
      WHERE e.type = 'outperforms'
        AND n1.type IN ('method', 'technique')
        AND n2.type IN ('method', 'technique')
      ORDER BY e.confidence DESC
    `;
    
    console.log(`Found ${results.length} comparisons:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.method1} vs ${r.method2}`);
      console.log(`   Method source: ${r.paper_with_method}`);
      if (r.reported_by && r.reported_by !== r.paper_with_method) {
        console.log(`   Comparison reported by: ${r.reported_by}`);
      }
      console.log(`   Result: ${r.comparison || 'Not specified'}`);
      console.log(`   Evidence: ${r.evidence || 'N/A'}`);
      console.log(`   Confidence: ${(Number(r.confidence) * 100).toFixed(0)}%\n`);
    });
    
    return results;
  }

  /**
   * Query 7: Dataset usage across papers
   */
  async getDatasetUsage() {
    console.log('\n📊 Query 7: Dataset Usage\n');
    
    const results = await sql`
      SELECT 
        n.name as dataset_name,
        COUNT(DISTINCT p.id) as paper_count,
        array_agg(DISTINCT p.title ORDER BY p.title) as papers
      FROM nodes n
      JOIN edges e ON n.id = e.target_id
      JOIN papers p ON e.source_id = p.id
      WHERE n.type = 'dataset'
        AND e.type = 'uses_dataset'
      GROUP BY n.id, n.name
      ORDER BY paper_count DESC
    `;
    
    console.log(`Found ${results.length} datasets:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.dataset_name}`);
      console.log(`   Used in ${r.paper_count} paper(s)`);
      console.log(`   Papers: ${r.papers.join(', ')}\n`);
    });
    
    return results;
  }

  /**
   * Query 9: Methods whose introduction papers address specific challenges
   */
  async getMethodsAddressingChallenges() {
    console.log('\n📊 Query 9: Methods Addressing Challenges\n');

    const results = await sql`
      SELECT 
        method_nodes.name AS method_name,
        challenge_nodes.name AS challenge_name,
        intro_papers.title AS introduction_paper,
        e_challenge.type AS relationship_type,
        challenge_nodes.description AS challenge_description
      FROM nodes method_nodes
      JOIN edges e_intro ON e_intro.target_id = method_nodes.id
      JOIN papers intro_papers ON intro_papers.id = e_intro.source_id
      JOIN edges e_challenge ON e_challenge.source_id = intro_papers.id
      JOIN nodes challenge_nodes ON challenge_nodes.id = e_challenge.target_id
      WHERE method_nodes.type IN ('method', 'technique')
        AND e_intro.type = 'introduces'
        AND e_challenge.type IN ('addresses', 'solves')
        AND challenge_nodes.type = 'challenge'
      ORDER BY challenge_nodes.name ASC, method_nodes.name ASC
    `;

    console.log(`Found ${results.length} method-challenge links:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.method_name}`);
      console.log(`   Challenge: ${r.challenge_name} (${r.relationship_type})`);
      console.log(`   Introduced in: ${r.introduction_paper}`);
      if (r.challenge_description) {
        console.log(`   Challenge details: ${r.challenge_description}`);
      }
      console.log('');
    });

    return results;
  }

  /**
   * Query 10: Datasets used by papers that improve on 3D Gaussian Splatting
   */
  async getDatasetsSupporting3DGSImprovements() {
    console.log('\n📊 Query 10: Datasets Behind 3DGS Improvements\n');

    const results = await sql`
      WITH improvements AS (
        SELECT e_improve.source_id AS paper_id
        FROM edges e_improve
        JOIN papers baseline ON e_improve.target_id = baseline.id
        WHERE e_improve.type = 'improves_on'
          AND baseline.title ILIKE '%3D Gaussian Splatting%'
      )
      SELECT 
        datasets.name AS dataset_name,
        COUNT(DISTINCT p.title) AS paper_count,
        array_agg(DISTINCT p.title ORDER BY p.title) AS papers
      FROM improvements imp
      JOIN edges e_dataset ON e_dataset.source_id = imp.paper_id AND e_dataset.type = 'uses_dataset'
      JOIN nodes datasets ON datasets.id = e_dataset.target_id AND datasets.type = 'dataset'
      JOIN papers p ON p.id = imp.paper_id
      GROUP BY datasets.id, datasets.name
      ORDER BY paper_count DESC, datasets.name ASC
    `;

    console.log(`Found ${results.length} supporting datasets:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.dataset_name}`);
      console.log(`   Supports ${r.paper_count} improvement paper(s)`);
      console.log(`   Papers: ${r.papers.join(', ')}`);
      console.log('');
    });

    return results;
  }

  /**
   * Query 8: Research timeline - what built upon what
   */
  async getResearchTimeline() {
    console.log('\n📊 Query 8: Research Evolution Timeline\n');
    
    const results = await sql`
      SELECT 
        p1.title as newer_paper,
        p1.publication_date as newer_date,
        e.type as relationship_type,
        p2.title as older_paper,
        p2.publication_date as older_date,
        e.description
      FROM edges e
      JOIN papers p1 ON e.source_id = p1.id
      JOIN papers p2 ON e.target_id = p2.id
      WHERE e.type IN ('improves_on', 'extends', 'builds_upon')
        AND p1.publication_date IS NOT NULL
        AND p2.publication_date IS NOT NULL
      ORDER BY p1.publication_date ASC
    `;
    
    console.log(`Research evolution (${results.length} connections):\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. [${r.newer_date?.toISOString().split('T')[0]}] ${r.newer_paper}`);
      console.log(`   ${r.relationship_type.replace('_', ' ')} →`);
      console.log(`   [${r.older_date?.toISOString().split('T')[0]}] ${r.older_paper}`);
      if (r.description) {
        console.log(`   Details: ${r.description}`);
      }
      console.log('');
    });
    
    return results;
  }

  /**
   * Run all example queries
   */
  async runAllQueries() {
    console.log('\n' + '='.repeat(80));
    console.log('KNOWLEDGE GRAPH EXAMPLE QUERIES');
    console.log('='.repeat(80));

    await this.getMostInfluentialConcepts(10);
    await this.getChallengesSolved();
    await this.getPapersImprovingOn3DGS();
    await this.getMethodComparisons();
    await this.getDatasetUsage();
    await this.getMethodsAddressingChallenges();
    await this.getDatasetsSupporting3DGSImprovements();
    
    console.log('\n' + '='.repeat(80));
  }
}

// CLI interface
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const queries = new KnowledgeGraphQueries();
  queries.runAllQueries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
