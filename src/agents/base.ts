/**
 * BaseAgent
 * 
 * Abstract base class for agents interacting with an LLM provider.
 * Handles LLM client initialization, message sending, response parsing,
 * and provides a standard interface for derived agents.
 */

import OpenAI from 'openai';
import { config } from '../config/index.js';
import type { AgentConfig } from '../types/index.js';

/**
 * Represents a message sent to the LLM.
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Represents a response from the LLM.
 */
export interface LLMResponse {
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Abstract base class for LLM agents.
 */
export abstract class BaseAgent {
  protected name: string;
  protected config: AgentConfig;
  private openai?: OpenAI;

  /**
   * Initialize the agent with a name and optional configuration overrides.
   * Sets up the OpenAI client if OpenAI is the selected provider.
   * 
   * @param name Agent name
   * @param agentConfig Optional overrides for agent configuration
   */
  constructor(name: string, agentConfig: Partial<AgentConfig> = {}) {
    this.name = name;

    // Initialize OpenAI client using API key from config
    this.openai = new OpenAI({
      apiKey: config.llm.openai.apiKey,
    });

    // Merge default config with any overrides provided
    this.config = {
      name,
      model: config.llm.openai.model,
      temperature: 0.3,
      max_tokens: 4000,
      ...agentConfig,
    };
  }

  /**
   * Send messages to the LLM and return its response.
   * Chooses the appropriate provider internally (currently OpenAI).
   * 
   * @param messages Array of messages to send to the LLM
   * @param options Optional overrides for temperature, max tokens, and JSON mode
   * @returns Response from the LLM
   */
  protected async callLLM(
    messages: LLMMessage[],
    options: {
      temperature?: number;
      max_tokens?: number;
      json_mode?: boolean;
    } = {}
  ): Promise<LLMResponse> {
    const temperature = options.temperature ?? this.config.temperature;
    const max_tokens = options.max_tokens ?? this.config.max_tokens;

    if (this.openai) {
      return this.callOpenAI(messages, temperature, max_tokens, options.json_mode);
    } else {
      throw new Error('No LLM provider initialized');
    }
  }

  /**
   * Internal method to call OpenAI's Chat Completions API.
   * 
   * @param messages Messages to send
   * @param temperature Sampling temperature
   * @param max_tokens Maximum tokens to generate
   * @param json_mode If true, expects the response in JSON format
   * @returns LLMResponse object with content and optional usage info
   */
  private async callOpenAI(
    messages: LLMMessage[],
    temperature: number,
    max_tokens: number,
    json_mode?: boolean
  ): Promise<LLMResponse> {
    const response = await this.openai!.chat.completions.create({
      model: this.config.model,
      max_tokens,
      temperature,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(json_mode && { response_format: { type: 'json_object' } }),
    });

    const choice = response.choices[0];
    if (!choice.message.content) {
      throw new Error('Empty response from OpenAI');
    }

    return {
      content: choice.message.content,
      usage: response.usage
        ? {
            input_tokens: response.usage.prompt_tokens,
            output_tokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  /**
   * Parse a JSON string returned by the LLM, handling common formatting issues.
   * Can extract JSON from markdown code blocks if necessary.
   * 
   * @param content LLM response content
   * @returns Parsed object of generic type T
   */
  protected parseJSON<T>(content: string): T {
    try {
      // Check for JSON inside markdown code blocks
      const jsonMatch = content.match(/```json?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse JSON:', content);
      throw new Error(`JSON parsing failed: ${error}`);
    }
  }

  /**
   * Abstract method to implement agent-specific processing logic.
   * All derived agents must implement this method.
   * 
   * @param input Input data for the agent
   * @returns Result of processing
   */
  abstract process(input: any): Promise<any>;
}
