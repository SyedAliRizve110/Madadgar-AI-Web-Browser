// @vitest-environment jsdom
/**
 * Cross-Tab Map-Reduce Synthesizer & Comparison Engine Tests (Task 7.2)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MapReduceSynthesizer } from '@/background/synthesizer';
import { TabCoordinator } from '@/background/tab_coordinator';
import { AIGateway } from '@/ai/ai_gateway';

describe('Cross-Tab Map-Reduce Synthesizer & Comparison Engine (Task 7.2)', () => {
  beforeEach(() => {
    TabCoordinator.reset();
    vi.restoreAllMocks();

    // Mock chrome.tabs API
    (globalThis as any).chrome = {
      runtime: { lastError: null },
      tabs: {
        create: vi.fn().mockImplementation(async ({ url }) => ({
          id: Math.floor(Math.random() * 1000) + 100,
          url,
          status: 'complete',
        })),
        sendMessage: vi.fn().mockImplementation((tabId, message, callback) => {
          if (message.type === 'EXTRACT_READABILITY_CONTENT') {
            callback({
              title: `Item on Tab ${tabId}`,
              url: `https://store.com/item-${tabId}`,
              textContent: `This is a high performance product on tab ${tabId} priced at $${tabId * 10}. Includes 2 year warranty and fast free shipping.`,
            });
          } else {
            callback({ success: true });
          }
        }),
        remove: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue({}),
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
    };

    TabCoordinator.init();
  });

  afterEach(() => {
    TabCoordinator.reset();
  });

  describe('Map Phase: Parallel Tab Content Extraction', () => {
    it('extracts content snippet from a single tab via messaging', async () => {
      const result = await MapReduceSynthesizer.extractFromTab(101);
      expect(result.success).toBe(true);
      expect(result.tabId).toBe(101);
      expect(result.title).toBe('Item on Tab 101');
      expect(result.content).toContain('priced at $1010');
    });

    it('gracefully handles tab communication error in map phase', async () => {
      vi.spyOn(TabCoordinator, 'sendMessageToTab').mockRejectedValueOnce(new Error('Content script unreachable'));
      const result = await MapReduceSynthesizer.extractFromTab(999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Content script unreachable');
    });
  });

  describe('Reduce Phase: LLM Synthesis into Comparison Matrix', () => {
    it('synthesizes structured ComparisonMatrix from multiple tab extractions', async () => {
      const mockMatrixJson = JSON.stringify({
        topic: 'Wireless Noise Cancelling Headphones Comparison',
        attributes: ['Price', 'Battery Life', 'Pros', 'Cons', 'Verdict'],
        items: [
          {
            tabId: 101,
            title: 'Sony WH-1000XM5',
            url: 'https://store.com/sony',
            attributes: {
              Price: '$399',
              'Battery Life': '30 Hours',
              Pros: 'Industry leading ANC, lightweight',
              Cons: 'Non-folding design',
              Verdict: 'Top pick for travelers',
            },
          },
          {
            tabId: 102,
            title: 'Bose QuietComfort Ultra',
            url: 'https://store.com/bose',
            attributes: {
              Price: '$429',
              'Battery Life': '24 Hours',
              Pros: 'Ultra comfortable, spatial audio',
              Cons: 'Higher price point',
              Verdict: 'Best for pure comfort',
            },
          },
        ],
        summary: 'Both flagship headphones offer exceptional ANC. Sony leads in battery life, while Bose provides superior long-session comfort.',
        recommendation: 'Choose Sony WH-1000XM5 for better battery and value, or Bose Ultra if comfort is paramount.',
      });

      vi.spyOn(AIGateway, 'complete').mockResolvedValueOnce(mockMatrixJson);

      const matrix = await MapReduceSynthesizer.compareTabs([101, 102], {
        prompt: 'Focus on battery life and comfort',
      });

      expect(matrix).toBeDefined();
      expect(matrix.topic).toBe('Wireless Noise Cancelling Headphones Comparison');
      expect(matrix.items).toHaveLength(2);
      expect(matrix.attributes).toContain('Price');
      expect(matrix.attributes).toContain('Battery Life');
      expect(matrix.items[0].title).toBe('Sony WH-1000XM5');
      expect(matrix.items[1].attributes['Price']).toBe('$429');
      expect(matrix.recommendation).toContain('Sony WH-1000XM5');
    });

    it('recovers with heuristic fallback matrix when LLM returns non-JSON commentary', async () => {
      vi.spyOn(AIGateway, 'complete').mockResolvedValueOnce(
        'Here is my comparative assessment: Option A is cheaper while Option B has better build quality.'
      );

      const matrix = await MapReduceSynthesizer.compareTabs([101, 102]);
      expect(matrix).toBeDefined();
      expect(matrix.items).toHaveLength(2);
      expect(matrix.attributes).toContain('Key Features');
      expect(matrix.summary).toContain('Option A is cheaper');
    });

    it('proceeds successfully if 1 tab extraction fails but others succeed', async () => {
      vi.spyOn(TabCoordinator, 'sendMessageToTab').mockImplementation(async (tabId) => {
        if (tabId === 101) throw new Error('Tab crashed');
        return {
          title: `Product #${tabId}`,
          url: `https://store.com/${tabId}`,
          textContent: `Description for product #${tabId}`,
        };
      });

      const mockJson = JSON.stringify({
        topic: 'Partial Comparison',
        attributes: ['Price', 'Pros'],
        items: [
          {
            tabId: 102,
            title: 'Product #102',
            url: 'https://store.com/102',
            attributes: { Price: '$200', Pros: 'Reliable' },
          },
        ],
        summary: 'Comparison based on available tabs.',
      });
      vi.spyOn(AIGateway, 'complete').mockResolvedValueOnce(mockJson);

      const matrix = await MapReduceSynthesizer.compareTabs([101, 102]);
      expect(matrix.items).toHaveLength(1);
      expect(matrix.items[0].tabId).toBe(102);
    });
  });

  describe('compareUrls Errand Pipeline', () => {
    it('spawns managed tabs, performs map-reduce, and respects closeWhenDone flag', async () => {
      const mockJson = JSON.stringify({
        topic: 'URL Comparison',
        attributes: ['Price'],
        items: [{ tabId: 1, title: 'Item', url: 'https://site.com', attributes: { Price: '$50' } }],
        summary: 'Done',
      });
      vi.spyOn(AIGateway, 'complete').mockResolvedValueOnce(mockJson);

      const closeSpy = vi.spyOn(TabCoordinator, 'closeTab');

      const matrix = await MapReduceSynthesizer.compareUrls(
        ['https://example.com/item1', 'https://example.com/item2'],
        { closeWhenDone: true }
      );

      expect(matrix).toBeDefined();
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
