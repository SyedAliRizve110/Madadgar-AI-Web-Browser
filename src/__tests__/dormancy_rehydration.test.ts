// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentOrchestrator } from '@/background/agent_orchestrator';
import { saveActiveAgentSession } from '@/common/storage_adapter';
import type { AgentTaskSession } from '@/common/types';

describe('MV3 Worker Dormancy Persistence & State Rehydration (Task 3.8)', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};

    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn((keys: string | string[], cb?: (res: any) => void) => {
            const key = Array.isArray(keys) ? keys[0] : keys;
            const res = { [key]: mockStorage[key] };
            if (cb) cb(res);
            return Promise.resolve(res);
          }),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            Object.assign(mockStorage, items);
            if (cb) cb();
            return Promise.resolve();
          }),
          remove: vi.fn((keys: string | string[], cb?: () => void) => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            keyList.forEach((k) => delete mockStorage[k]);
            if (cb) cb();
            return Promise.resolve();
          }),
        },
      },
      tabs: {
        sendMessage: vi.fn().mockImplementation((_tabId, _msg, cb) => {
          if (cb) cb({ success: true });
        }),
      },
      runtime: {
        lastError: null,
      },
    };
  });

  it('persists serialized FSM state to chrome.storage.local before awaiting approval', async () => {
    const mockSession: AgentTaskSession = {
      taskId: 'task-test-dormancy-123',
      goal: 'Fill internship application',
      tabId: 101,
      url: 'https://example.com/apply',
      status: 'AWAITING_APPROVAL',
      currentStep: 3,
      maxSteps: 15,
      history: [
        {
          step: 1,
          action: { action: 'type', target_id: 1, value: 'Ali Rizvi', reason: 'Enter name' },
          result: { success: true, action: 'type' },
          timestamp: Date.now() - 5000,
        },
        {
          step: 2,
          action: { action: 'type', target_id: 2, value: 'ali@example.com', reason: 'Enter email' },
          result: { success: true, action: 'type' },
          timestamp: Date.now() - 2500,
        },
      ],
      pendingProposal: {
        action: 'click',
        target_id: 5,
        reason: 'Submit form application',
        is_consequential: true,
      },
      dryRun: false,
      createdAt: Date.now() - 6000,
      updatedAt: Date.now(),
    };

    await saveActiveAgentSession(mockSession);

    expect(mockStorage['active_task_session']).toBeDefined();
    expect(mockStorage['active_task_session'].taskId).toBe('task-test-dormancy-123');
    expect(mockStorage['active_task_session'].currentStep).toBe(3);
    expect(mockStorage['active_task_session'].history.length).toBe(2);
    expect(mockStorage['active_task_session'].pendingProposal.target_id).toBe(5);
  });

  it('seamlessly rehydrates FSM state after simulated service worker restart', async () => {
    const serializedSession: AgentTaskSession = {
      taskId: 'task-dormancy-reboot-999',
      goal: 'Search for quantum computing textbooks',
      tabId: 202,
      url: 'https://shop.example.com',
      status: 'AWAITING_APPROVAL',
      currentStep: 2,
      maxSteps: 15,
      history: [
        {
          step: 1,
          action: { action: 'type', target_id: 3, value: 'quantum computing', reason: 'Type query' },
          result: { success: true, action: 'type' },
          timestamp: 1700000000,
        },
      ],
      pendingProposal: {
        action: 'click',
        target_id: 4,
        reason: 'Click search button',
      },
      dryRun: false,
      createdAt: 1700000000,
      updatedAt: 1700000005,
    };

    mockStorage['active_task_session'] = serializedSession;

    // Simulate worker boot rehydration
    const rehydrated = await AgentOrchestrator.rehydrate();

    expect(rehydrated).not.toBeNull();
    expect(rehydrated?.taskId).toBe('task-dormancy-reboot-999');
    expect(rehydrated?.status).toBe('AWAITING_APPROVAL');
    expect(rehydrated?.currentStep).toBe(2);
    expect(rehydrated?.history[0].action.value).toBe('quantum computing');
    expect(rehydrated?.pendingProposal?.target_id).toBe(4);

    // Verify orchestrator getSession() matches rehydrated instance
    expect(AgentOrchestrator.getSession()?.taskId).toBe('task-dormancy-reboot-999');
  });

  it('clears storage completely when clearSession() is called', async () => {
    mockStorage['active_task_session'] = {
      taskId: 'task-to-clear',
      goal: 'Done task',
      tabId: 1,
      status: 'TASK_COMPLETED',
      currentStep: 5,
      maxSteps: 15,
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await AgentOrchestrator.rehydrate();
    expect(AgentOrchestrator.getSession()).not.toBeNull();

    await AgentOrchestrator.clearSession();

    expect(AgentOrchestrator.getSession()).toBeNull();
    expect(mockStorage['active_task_session']).toBeUndefined();
  });
});
