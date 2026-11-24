/**
 * Madadgar - Cross-Tab Map-Reduce Synthesizer & Comparison Engine (Task 7.2)
 * Parallel map-reduce errand pipeline:
 * - Map: parallel content extraction across N target browser tabs
 * - Reduce: LLM aggregation into a structured comparative matrix with attributes
 */

import { TabCoordinator } from './tab_coordinator';
import { AIGateway } from '@/ai/ai_gateway';
import type {
  ComparisonMatrix,
  TabExtractionResult,
  ExtractReadabilityResponse,
} from '@/common/types';

export class MapReduceSynthesizer {
  /**
   * Compares N open tabs by tab IDs in parallel
   */
  public static async compareTabs(
    tabIds: number[],
    options?: { prompt?: string; focusAttributes?: string[] }
  ): Promise<ComparisonMatrix> {
    if (!tabIds || tabIds.length === 0) {
      throw new Error('At least one tab ID is required for comparison.');
    }

    // -------------------------------------------------------------------------
    // 1. MAP PHASE: Extract structured page content across all tabs in parallel
    // -------------------------------------------------------------------------
    const mapPromises = tabIds.map((id) => this.extractFromTab(id));
    const settledResults = await Promise.allSettled(mapPromises);

    const successfulExtractions: TabExtractionResult[] = [];
    settledResults.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value.success) {
        successfulExtractions.push(res.value);
      } else {
        const errorMsg = res.status === 'rejected' ? res.reason?.message : res.value?.error;
        console.warn(`[MapReduceSynthesizer] Extraction failed for tab #${tabIds[idx]}:`, errorMsg);
      }
    });

    if (successfulExtractions.length === 0) {
      throw new Error('Failed to extract readable content from any of the target tabs.');
    }

    // -------------------------------------------------------------------------
    // 2. REDUCE PHASE: LLM aggregation into structured ComparisonMatrix
    // -------------------------------------------------------------------------
    return this.reduceExtractions(successfulExtractions, options);
  }

  /**
   * Compares N URLs by spawning them in parallel via TabCoordinator
   */
  public static async compareUrls(
    urls: string[],
    options?: { prompt?: string; focusAttributes?: string[]; closeWhenDone?: boolean }
  ): Promise<ComparisonMatrix> {
    if (!urls || urls.length === 0) {
      throw new Error('At least one URL is required for comparison.');
    }

    // 1. Spawn managed tabs in parallel
    const spawnPromises = urls.map((url) => TabCoordinator.openTab(url, { active: false }));
    const managedTabs = await Promise.all(spawnPromises);

    // 2. Wait for all tabs to complete loading
    const readyPromises = managedTabs.map((t) => TabCoordinator.waitForTabReady(t.tabId, 15000));
    await Promise.allSettled(readyPromises);

    const tabIds = managedTabs.map((t) => t.tabId);

    try {
      return await this.compareTabs(tabIds, options);
    } finally {
      if (options?.closeWhenDone) {
        for (const t of managedTabs) {
          await TabCoordinator.closeTab(t.tabId);
        }
      }
    }
  }

  /**
   * Map Helper: Extracts readable content from a single tab
   */
  public static async extractFromTab(tabId: number): Promise<TabExtractionResult> {
    try {
      const response = await TabCoordinator.sendMessageToTab<ExtractReadabilityResponse>(
        tabId,
        { type: 'EXTRACT_READABILITY_CONTENT' },
        8000
      );

      const title = response?.title || `Tab #${tabId}`;
      const url = (response as any)?.url || TabCoordinator.getManagedTab(tabId)?.url || '';
      const text = response?.textContent || '';
      const snippet = text.slice(0, 2000).trim();

      if (!snippet && !title) {
        return {
          tabId,
          url,
          title,
          content: '',
          success: false,
          error: 'No text content available on tab.',
        };
      }

      return {
        tabId,
        url,
        title,
        content: snippet,
        success: true,
      };
    } catch (err: any) {
      return {
        tabId,
        url: '',
        title: `Tab #${tabId}`,
        content: '',
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Reduce Helper: Synthesizes extracted datasets into a structured matrix
   */
  public static async reduceExtractions(
    extractions: TabExtractionResult[],
    options?: { prompt?: string; focusAttributes?: string[] }
  ): Promise<ComparisonMatrix> {
    const focus = options?.focusAttributes?.join(', ') || 'Price, Key Features, Pros, Cons, Rating / Verdict';

    const itemsContext = extractions
      .map(
        (ext, idx) => `
--- ITEM ${idx + 1} ---
Tab ID: ${ext.tabId}
Title: ${ext.title}
URL: ${ext.url}
Content Snippet:
${ext.content}
`
      )
      .join('\n');

    const systemInstruction = `You are Madadgar, an expert multi-tab analysis and comparison engine.
Given extracted data from multiple browser tabs, compare them objectively and output ONLY valid JSON matching the exact schema.`;

    const prompt = `Compare the following ${extractions.length} items extracted from active tabs.
Focus on these attributes: ${focus}.
${options?.prompt ? `User Directive: ${options.prompt}` : ''}

${itemsContext}

Respond ONLY with a JSON object in this exact schema without markdown backticks or commentary:
{
  "topic": "Concise topic or product comparison title",
  "attributes": ["Price", "Key Features", "Pros", "Cons", "Verdict"],
  "items": [
    {
      "tabId": <numeric tab ID from input>,
      "title": "Item name / title",
      "url": "Item url",
      "attributes": {
        "Price": "...",
        "Key Features": "...",
        "Pros": "...",
        "Cons": "...",
        "Verdict": "..."
      }
    }
  ],
  "summary": "Executive 2-3 sentence overview of the comparison.",
  "recommendation": "Clear, actionable recommendation on which option is best suited for the user and why."
}`;

    const rawResponse = await AIGateway.complete({
      prompt,
      systemInstruction,
    });

    return this.parseComparisonResponse(rawResponse, extractions);
  }

  /**
   * Parses and validates LLM JSON response with robust fallback
   */
  public static parseComparisonResponse(
    raw: string,
    fallbackExtractions: TabExtractionResult[]
  ): ComparisonMatrix {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        return {
          topic: parsed.topic || 'Comparison Matrix',
          attributes: parsed.attributes || ['Price', 'Pros', 'Cons', 'Verdict'],
          items: parsed.items.map((it: any, idx: number) => ({
            tabId: it.tabId || fallbackExtractions[idx]?.tabId || idx + 1,
            title: it.title || fallbackExtractions[idx]?.title || `Option ${idx + 1}`,
            url: it.url || fallbackExtractions[idx]?.url || '',
            attributes: it.attributes || {},
          })),
          summary: parsed.summary || 'Comparison synthesized across target tabs.',
          recommendation: parsed.recommendation || undefined,
        };
      }
    } catch {
      // Fallback if model output was not strict JSON
    }

    // Heuristic Fallback Matrix
    return {
      topic: 'Comparison Matrix',
      attributes: ['Key Features', 'Summary'],
      items: fallbackExtractions.map((ext) => ({
        tabId: ext.tabId,
        title: ext.title,
        url: ext.url,
        attributes: {
          'Key Features': ext.content.slice(0, 150) + '...',
          Summary: ext.content.slice(150, 300) + '...',
        },
      })),
      summary: raw.slice(0, 300) || 'Synthesized overview of compared tabs.',
      recommendation: undefined,
    };
  }
}
