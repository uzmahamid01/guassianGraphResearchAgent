/**
 * Relationship Extraction Agent
 * 
 * Specialized agent for identifying semantic relationships between entities
 * and papers. Goes beyond simple citations to capture technical and
 * conceptual connections in research papers.
 */

import { BaseAgent } from './base.js';
import type { ExtractedEntity, ExtractedRelationship, Paper } from '../types/index.js';
import { config } from '../config/index.js';

/**
 * Input data for the RelationshipExtractorAgent
 */
interface RelationshipExtractionInput {
  paper: Paper;  // Paper to analyze
  entities: ExtractedEntity[];  // Entities extracted from the paper
  text: string;  // Full text or section of the paper
  existingPapers?: Array<{ title: string; arxiv_id?: string }>;  // Optional cross-paper context
}

/**
 * Output from the RelationshipExtractorAgent
 */
interface RelationshipExtractionOutput {
  relationships: ExtractedRelationship[];
}

/**
 * RelationshipExtractorAgent
 * 
 * Uses an LLM to identify relationships between entities, methods,
 * concepts, datasets, and papers. Ensures validation and confidence
 * scoring for quality knowledge graph construction.
 */
export class RelationshipExtractorAgent extends BaseAgent {
  constructor() {
    super('RelationshipExtractor', config.agents.relationshipExtraction);
  }

  /**
   * Main processing function for extracting relationships from a paper.
   * 
   * Steps:
   *   1. Generate system and user prompts
   *   2. Call LLM to extract relationships
   *   3. Parse and normalize output
   *   4. Filter invalid relationships
   */
  async process(input: RelationshipExtractionInput): Promise<RelationshipExtractionOutput> {
    const { paper, entities, text, existingPapers } = input;

    // Build prompts for the LLM
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(paper, entities, text, existingPapers);

    // Call the LLM
    const response = await this.callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // Parse JSON response
    const parsed = this.parseJSON<{ relationships: ExtractedRelationship[] }>(response.content);

    // Validate relationships: ensure source and target exist
    const relationships = parsed.relationships
      .filter((rel) => {
        const sourceExists = entities.some((e) => e.name.toLowerCase() === rel.source.toLowerCase()) ||
                             (existingPapers?.some((p) => p.title.toLowerCase() === rel.source.toLowerCase()));
        const targetExists = entities.some((e) => e.name.toLowerCase() === rel.target.toLowerCase()) ||
                             (existingPapers?.some((p) => p.title.toLowerCase() === rel.target.toLowerCase()));
        return sourceExists && targetExists;
      })
      .map((rel) => ({
        ...rel,
        confidence: Math.max(0, Math.min(1, rel.confidence || 0.5)), // Normalize confidence to 0-1
        metadata: rel.metadata || {},
      }));

    return { relationships };
  }

  /**
   * Returns a system prompt instructing the LLM on how to extract
   * semantic relationships, including the types of relationships
   * and extraction guidelines.
   */
  private getSystemPrompt(): string {
    return `You are an expert at identifying semantic relationships in academic research. Your task is to extract meaningful relationships between entities in research papers about Gaussian Splatting and neural rendering.

RELATIONSHIP TYPES:

Paper-to-Paper:
- improves_on: Paper A improves upon Paper B's method
- extends: Paper A extends Paper B's work in a new direction
- compares_with: Paper A empirically compares with Paper B
- builds_upon: Paper A builds upon Paper B's foundation
- contradicts: Paper A's findings contradict Paper B

Paper-to-Concept:
- introduces: Paper introduces a new concept/method
- applies: Paper applies an existing concept
- evaluates: Paper evaluates a concept's performance
- addresses: Paper addresses a challenge/problem

Concept-to-Concept:
- related_to: General semantic relationship
- enables: Concept A enables Concept B
- requires: Concept A requires Concept B
- alternative_to: Concept A is an alternative to Concept B
- generalizes: Concept A is a generalization of Concept B
- specializes: Concept A is a specialization of Concept B

Method Relationships:
- outperforms: Method A outperforms Method B (with evidence)
- combines_with: Method A combines with Method B
- replaces: Method A replaces Method B

Other:
- uses_dataset: Paper/Method uses a Dataset
- measures_with: Paper measures results with a Metric
- solves: Method solves a Challenge

EXTRACTION GUIDELINES:

- Extract explicit relationships with evidence
- Include quotes or context from the paper
- Assign confidence based on evidence strength
- Focus on technical relationships, not citations alone

OUTPUT FORMAT: Valid JSON only, no markdown.`;
  }

  /**
   * Constructs a user prompt for the LLM, including the paper,
   * extracted entities, known papers, and text to analyze.
   */
  private getUserPrompt(
    paper: Paper,
    entities: ExtractedEntity[],
    text: string,
    existingPapers?: Array<{ title: string; arxiv_id?: string }>
  ): string {
    const maxLength = 15000;
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '\n\n[Text truncated...]'
      : text;

    const entityList = entities.map((e) => `- ${e.name} (${e.type})`).join('\n');
    
    const existingPapersList = existingPapers 
      ? '\n\nKNOWN PAPERS IN KNOWLEDGE GRAPH:\n' + 
        existingPapers.slice(0, 50).map((p) => `- ${p.title}`).join('\n')
      : '';

    return `Extract semantic relationships from this paper:

PAPER: ${paper.title}

EXTRACTED ENTITIES:
${entityList}
${existingPapersList}

PAPER TEXT:
${truncatedText}

Identify meaningful relationships. Return JSON in this format:

{
  "relationships": [
    {
      "source": "Entity or Paper Name",
      "target": "Entity or Paper Name",
      "type": "improves_on|extends|introduces|applies|related_to|outperforms|etc",
      "description": "Brief description of the relationship",
      "evidence": "Direct quote or paraphrase from paper supporting this relationship",
      "confidence": 0.9,
      "metadata": {
        "quantitative_improvement": "20% faster",
        "section": "Results"
      }
    }
  ]
}

Focus on 15-40 high-quality relationships. Prioritize:
1. Paper-to-paper improvements/comparisons
2. Novel concepts introduced
3. Method combinations
4. Performance comparisons with evidence`;
  }
}
