import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '@/background/agent_orchestrator';
import { AIGateway } from '@/ai/ai_gateway';
import type { ScanDOMResponse, ExecuteActionResponse } from '@/common/types';

vi.mock('@/ai/ai_gateway', () => ({
  AIGateway: {
    proposeNextAction: vi.fn(),
  },
}));

describe('HITL Agent Orchestrator Finite State Machine (Task 3.6)', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage = {};

    // Setup chrome API mocks
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn((keys: string[]) => {
            const result: Record<string, any> = {};
            for (const k of keys) {
              if (mockStorage[k] !== undefined) {
                result[k] = mockStorage[k];
              }
            }
            return Promise.resolve(result);
          }),
          set: vi.fn((items: Record<string, any>) => {
            Object.assign(mockStorage, items);
            return Promise.resolve();
          }),
          remove: vi.fn((keys: string[]) => {
            for (const k of keys) {
              delete mockStorage[k];
            }
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
              url: 'https://example.com/apply',
              title: 'Application Form',
              elements: [
                {
                  id: 1,
                  tag: 'input',
                  type: 'text',
                  label: 'Full Name',
                  rect: { top: 10, left: 10, width: 100, height: 30, bottom: 40, right: 110 },
                },
                {
                  id: 2,
                  tag: 'button',
                  text: 'Submit Application',
                  isConsequential: true,
                  rect: { top: 50, left: 10, width: 100, height: 30, bottom: 80, right: 110 },
                },
              ],
            };
            callback?.(scanResponse);
          } else if (message.type === 'EXECUTE_ACTION') {
            const execResponse: ExecuteActionResponse = {
              success: true,
              action: message.action.action,
              targetId: message.action.target_id,
            };
            callback?.(execResponse);
          } else {
            callback?.({ success: true });
          }
        }),
      },
      runtime: {
        lastError: null,
      },
    } as any;

    await AgentOrchestrator.clearSession();
  });

  describe('startTask & step loop lifecycle', () => {
    it('initializes task, scans DOM, and transitions to AWAITING_APPROVAL with proposal', async () => {
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'type',
        target_id: 1,
        value: 'Alice Smith',
        reason: 'Typing name into Full Name field',
        is_consequential: false,
      });

      const session = await AgentOrchestrator.startTask('Fill application with my name', 101, {
        url: 'https://example.com/apply',
      });

      expect(session.status).toBe('AWAITING_APPROVAL');
      expect(session.currentStep).toBe(1);
      expect(session.pendingProposal?.action).toBe('type');
      expect(session.pendingProposal?.target_id).toBe(1);
      expect(session.pendingProposal?.value).toBe('Alice Smith');
      expect(AIGateway.proposeNextAction).toHaveBeenCalledTimes(1);

      // Verify element highlight message sent to tab
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ type: 'HIGHLIGHT_ELEMENT', targetId: 1 }),
        expect.any(Function)
      );
    });

    it('approves step, executes action, and loops to the next proposal', async () => {
      // Step 1 Proposal
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'type',
        target_id: 1,
        value: 'Alice',
        reason: 'Type name',
      });

      // Step 2 Proposal (Done)
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'done',
        reason: 'Form successfully completed',
      });

      await AgentOrchestrator.startTask('Fill application', 101);

      // User approves Step 1
      const updatedSession = await AgentOrchestrator.approveStep();

      expect(updatedSession.history.length).toBe(1);
      expect(updatedSession.history[0].action.action).toBe('type');
      expect(updatedSession.history[0].result?.success).toBe(true);

      // Terminal step achieved
      expect(updatedSession.status).toBe('TASK_COMPLETED');
    });

    it('skips step without executing and requests next proposal', async () => {
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'click',
        target_id: 1,
        reason: 'Optional toggle',
      });

      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'done',
        reason: 'Completed remaining steps',
      });

      await AgentOrchestrator.startTask('Task', 101);

      const session = await AgentOrchestrator.skipStep();
      expect(session.history[0].result?.error).toBe('Skipped by user.');
      expect(session.status).toBe('TASK_COMPLETED');
    });

    it('aborts task immediately on stopTask / kill switch', async () => {
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'click',
        target_id: 2,
        reason: 'Submit order',
      });

      await AgentOrchestrator.startTask('Submit order', 101);

      const session = await AgentOrchestrator.stopTask('User clicked Stop');
      expect(session.status).toBe('TASK_ABORTED');
      expect(session.error).toBe('User clicked Stop');
      expect(session.pendingProposal).toBeNull();
    });
  });

  describe('safety validation and step cap limits', () => {
    it('blocks execution on internal or financial domains', async () => {
      const session = await AgentOrchestrator.startTask('Transfer funds', 101, {
        url: 'https://paypal.com/transfer',
      });

      expect(session.status).toBe('BLOCKED_SAFETY');
      expect(session.error).toContain('financial');
    });

    it('blocks proposal that attempts to interact with password fields', async () => {
      // Mock scanner returning a password element
      vi.mocked(chrome.tabs.sendMessage as any).mockImplementation((_tabId: number, msg: any, cb: any) => {
        if (msg?.type === 'SCAN_INTERACTIVE_DOM') {
          cb?.({
            success: true,
            count: 1,
            elements: [{ id: 5, tag: 'input', type: 'password', isPassword: true }],
          });
        } else {
          cb?.({ success: true });
        }
        return Promise.resolve({ success: true });
      });

      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'type',
        target_id: 5,
        value: 'SecretPass123',
        reason: 'Entering password',
      });

      const session = await AgentOrchestrator.startTask('Login', 101, {
        url: 'https://example.com/login',
      });

      expect(session.status).toBe('BLOCKED_SAFETY');
      expect(session.error).toContain('password fields is strictly prohibited');
    });

    it('enforces maximum step cap preventing endless loops', async () => {
      // Propose repeating click action
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValue({
        action: 'scroll',
        value: 'down',
        reason: 'Scrolling down',
      });

      await AgentOrchestrator.startTask('Endless scroll errand', 101, { maxSteps: 2 });

      // Step 1 approved
      await AgentOrchestrator.approveStep();
      // Step 2 approved -> Should hit step cap
      const finalSession = await AgentOrchestrator.approveStep();

      expect(finalSession.status).toBe('TASK_COMPLETED');
      expect(finalSession.currentStep).toBeGreaterThan(finalSession.maxSteps);
    });
  });

  describe('Worker dormancy persistence & rehydration (Task 3.8)', () => {
    it('persists session to chrome.storage.local on state changes and rehydrates', async () => {
      vi.mocked(AIGateway.proposeNextAction).mockResolvedValueOnce({
        action: 'type',
        target_id: 1,
        value: 'Resume info',
        reason: 'Typing resume info',
      });

      const session = await AgentOrchestrator.startTask('Fill resume', 101);

      // Verify persisted in storage
      expect(mockStorage['active_task_session']).toBeDefined();
      expect(mockStorage['active_task_session'].taskId).toBe(session.taskId);

      // Simulate worker restart: rehydrate from storage
      const rehydrated = await AgentOrchestrator.rehydrate();
      expect(rehydrated).not.toBeNull();
      expect(rehydrated?.taskId).toBe(session.taskId);
      expect(rehydrated?.status).toBe('AWAITING_APPROVAL');
    });
  });
});

