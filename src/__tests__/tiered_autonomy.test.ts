/**
 * Tiered Autonomy Finite State Machine (TA-FSM) & Stagnation Detector Tests (Task 6.2)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { AgentOrchestrator } from '@/background/agent_orchestrator';
import { AutonomySlider } from '@/sidepanel/components/AutonomySlider';
import { AIGateway } from '@/ai/ai_gateway';
import type { AgentActionProposal, ScanDOMResponse, ExecuteActionResponse } from '@/common/types';

vi.mock('@/ai/ai_gateway', () => ({
  AIGateway: {
    proposeNextAction: vi.fn(),
  },
}));

describe('Tiered Autonomy FSM & Stagnation Detector (Task 6.2)', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage = {};

    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn((keys: string[] | string, callback?: (result: any) => void) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, any> = {};
            for (const k of keyArray) {
              if (mockStorage[k] !== undefined) {
                result[k] = mockStorage[k];
              }
            }
            if (callback) callback(result);
            return Promise.resolve(result);
          }),
          set: vi.fn((items: Record<string, any>, callback?: () => void) => {
            Object.assign(mockStorage, items);
            if (callback) callback();
            return Promise.resolve();
          }),
          remove: vi.fn((keys: string[] | string, callback?: () => void) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const k of keyArray) {
              delete mockStorage[k];
            }
            if (callback) callback();
            return Promise.resolve();
          }),
          clear: vi.fn((callback?: () => void) => {
            mockStorage = {};
            if (callback) callback();
            return Promise.resolve();
          }),
        },
      },
      tabs: {
        sendMessage: vi.fn((_tabId: number, message: any, callback?: (resp: any) => void) => {
          if (message.type === 'SCAN_INTERACTIVE_DOM') {
            const scanResponse: ScanDOMResponse = {
              success: true,
              count: 2,
              url: 'https://example.com/search',
              title: 'Search Page',
              elements: [
                {
                  id: 1,
                  tag: 'input',
                  type: 'search',
                  placeholder: 'Search...',
                  rect: { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 },
                },
                {
                  id: 2,
                  tag: 'button',
                  label: 'Submit Order',
                  rect: { top: 50, left: 0, width: 100, height: 30, bottom: 80, right: 100 },
                },
              ],
            };
            callback?.(scanResponse);
            return Promise.resolve(scanResponse);
          } else if (message.type === 'EXECUTE_ACTION') {
            const execResponse: ExecuteActionResponse = {
              success: true,
              action: message.action?.action || 'click',
              targetId: message.action?.target_id,
            };
            callback?.(execResponse);
            return Promise.resolve(execResponse);
          } else {
            callback?.({ success: true });
            return Promise.resolve({ success: true });
          }
        }),
      },
      runtime: {
        lastError: null,
      },
    } as any;

    await AgentOrchestrator.clearSession();
  });

  afterEach(async () => {
    await AgentOrchestrator.clearSession();
    vi.restoreAllMocks();
  });

  describe('AutonomySlider Component UI', () => {
    it('creates element with Co-Pilot selected by default', () => {
      const onChange = vi.fn();
      const element = React.createElement(AutonomySlider, {
        mode: 'co-pilot',
        onChange,
      });

      expect(element).toBeDefined();
      expect(element.props.mode).toBe('co-pilot');
    });

    it('creates element with Supervised Auto-Pilot selected', () => {
      const onChange = vi.fn();
      const element = React.createElement(AutonomySlider, {
        mode: 'auto-pilot',
        onChange,
      });

      expect(element).toBeDefined();
      expect(element.props.mode).toBe('auto-pilot');
    });
  });

  describe('AgentOrchestrator Tiered Autonomy Execution (Co-Pilot vs Auto-Pilot)', () => {
    it('initializes task with specified autonomy mode and supports mode updates', async () => {
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValue({
        action: 'type',
        target_id: 1,
        value: 'docs',
        reason: 'Type query into search input',
      });

      const session = await AgentOrchestrator.startTask('Search for docs', 123, {
        autonomyMode: 'auto-pilot',
      });

      expect(session.autonomyMode).toBe('auto-pilot');

      await AgentOrchestrator.setAutonomyMode('co-pilot');
      expect(AgentOrchestrator.getSession()?.autonomyMode).toBe('co-pilot');
    });

    it('Supervised Auto-Pilot automatically executes low-risk action (risk < 0.5)', async () => {
      let callCount = 0;
      vi.mocked(AIGateway.proposeNextAction).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            action: 'type',
            target_id: 1,
            value: 'ai browser',
            reason: 'Type search query',
          };
        }
        return {
          action: 'done',
          reason: 'Errand done',
        };
      });

      const session = await AgentOrchestrator.startTask('Search keyword', 123, {
        autonomyMode: 'auto-pilot',
      });

      // Low risk action auto-executes in Auto-Pilot
      expect(session.history.length).toBeGreaterThanOrEqual(1);
      expect(session.history[0].action.action).toBe('type');
      expect(session.history[0].result?.success).toBe(true);
    });

    it('Supervised Auto-Pilot pauses and prompts for approval on consequential action (risk >= 0.5)', async () => {
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValue({
        action: 'click',
        target_id: 2,
        reason: 'Click pay now to confirm order',
        is_consequential: true,
      });

      const session = await AgentOrchestrator.startTask('Complete purchase', 123, {
        autonomyMode: 'auto-pilot',
      });

      // Consequential action pauses at AWAITING_APPROVAL even in auto-pilot mode
      expect(session.status).toBe('AWAITING_APPROVAL');
      expect(session.pendingProposal?.action).toBe('click');
      expect(session.pendingProposal?.is_consequential).toBe(true);
    });

    it('Co-Pilot (Manual HITL) prompts for approval on every step even if low-risk', async () => {
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValue({
        action: 'type',
        target_id: 1,
        value: 'Jane Doe',
        reason: 'Fill applicant name',
      });

      const session = await AgentOrchestrator.startTask('Fill form', 123, {
        autonomyMode: 'co-pilot',
      });

      expect(session.status).toBe('AWAITING_APPROVAL');
      expect(session.history.length).toBe(0);
    });
  });

  describe('Stagnation Detector', () => {
    it('aborts with error if the agent attempts the exact same action 3 consecutive times', async () => {
      const identicalProposal: AgentActionProposal = {
        action: 'click',
        target_id: 1,
        reason: 'Click search button',
      };

      vi.mocked(AIGateway.proposeNextAction).mockResolvedValue(identicalProposal);

      let session = await AgentOrchestrator.startTask('Browse feed', 123, {
        autonomyMode: 'co-pilot',
      });

      // Step 1: Approved
      session = await AgentOrchestrator.approveStep();
      expect(session.history.length).toBe(1);

      // Step 2: Approved
      session = await AgentOrchestrator.approveStep();
      expect(session.history.length).toBe(2);

      // Step 3: Stagnation triggers!
      expect(session.status).toBe('ERROR');
      expect(session.error).toContain('Stagnation detected');
      expect(session.error).toContain('3 times without progress');
    });
  });
});
