/**
 * Entity Extraction Agent
 * 
 * Specialized agent for extracting structured entities from academic papers.
 * Identifies key elements such as concepts, methods, techniques, datasets,
 * metrics, challenges, applications, and results.
 */

import { BaseAgent } from './base.js';
import type { ExtractedEntity, Paper } from '../types/index.js';
import { config } from '../config/index.js';

/**
 * Input format for entity extraction.
 */
interface EntityExtractionInput {
  paper: Paper;
  text: string; // Full text or specific section to analyze
}

/**
 * Output format for entity extraction.
 */
interface EntityExtractionOutput {
  entities: ExtractedEntity[];
}

/**
 * Agent that extracts structured entities from papers using a language model.
 */
export class EntityExtractorAgent extends BaseAgent {
  constructor() {
    super('EntityExtractor', config.agents.entityExtraction);
  }

  /**
   * Main entry point for entity extraction.
   * Sends the paper content to the LLM and returns structured entities.
   * 
   * @param input Paper and text to analyze
   * @returns Extracted entities with normalized confidence and metadata
   */
  async process(input: EntityExtractionInput): Promise<EntityExtractionOutput> {
    const { paper, text } = input;

    // Construct prompts for the LLM
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(paper, text);

    // Call LLM and get response
    const response = await this.callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // Parse JSON response
    const parsed = this.parseJSON<{ entities: ExtractedEntity[] }>(response.content);
    
    // Normalize entities (ensure confidence is 0-1 and metadata exists)
    const entities = parsed.entities.map((entity) => ({
      ...entity,
      confidence: Math.max(0, Math.min(1, entity.confidence || 0.5)),
      metadata: entity.metadata || {},
    }));

    return { entities };
  }

  /**
   * Returns the system-level prompt describing the extraction rules and entity types.
   */
  private getSystemPrompt(): string {
    return `You are an expert academic research analyst specializing in computer graphics, 3D reconstruction, and neural rendering. Your task is to extract structured entities from research papers about Gaussian Splatting and related techniques.

ENTITY TYPES TO EXTRACT:

1. concept: High-level ideas, theories, or paradigms
2. method: Specific algorithms or approaches
3. technique: Implementation strategies or technical tricks
4. dataset: Benchmark datasets or data sources
5. metric: Evaluation measures
6. challenge: Problems or limitations being addressed
7. application: Use cases or domains
8. result: Quantitative outcomes or achievements

EXTRACTION GUIDELINES:

- Extract entities central to the paper's contribution
- Provide precise names (use paper terminology)
- Include a brief description explaining the entity's role
- Extract supporting context (quote or paraphrase)
- Assign confidence scores (0.0-1.0)
- Avoid generic terms like "algorithm" or "method" without specifics
- Focus on technical substance

OUTPUT FORMAT: Valid JSON only.`;
  }

  /**
   * Constructs the user-level prompt including paper details and text to analyze.
   * Truncates text if too long to keep it within LLM limits.
   */
  private getUserPrompt(paper: Paper, text: string): string {
    const maxLength = 15000;
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '\n\n[Text truncated...]'
      : text;

    return `Extract entities from this paper:

PAPER TITLE: ${paper.title}

PAPER ABSTRACT:
${paper.abstract || 'Not available'}

PAPER TEXT:
${truncatedText}

Extract all relevant entities and return them in this JSON format:

{
  "entities": [
    {
      "name": "Entity Name",
      "type": "concept|method|technique|dataset|metric|challenge|application|result",
      "description": "Brief description of what this entity is and its role in the paper",
      "confidence": 0.9,
      "context": "Supporting quote or context from the paper",
      "metadata": {
        "section": "Introduction|Methods|Results|etc",
        "any_other_relevant_info": "value"
      }
    }
  ]
}

Focus on extracting 10-30 of the most important entities. Prioritize quality over quantity.`;
  }
}
