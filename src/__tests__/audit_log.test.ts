// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAuditLogs,
  appendAuditLog,
  clearAuditLogs,
  exportAuditLogsJson,
} from '@/common/storage_adapter';
import { AgentOrchestrator } from '@/background/agent_orchestrator';
import type { AgentTaskSession } from '@/common/types';

describe('Action Audit Log Subsystem (Task 3.9)', () => {
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

  it('appends and retrieves chronologically ordered audit log records', async () => {
    const entry1 = await appendAuditLog({
      taskId: 'task-100',
      stepIndex: 1,
      actionType: 'type',
      targetBadgeId: 2,
      description: 'Type into #2',
      reasoning: 'Entering full name into application form',
      userDecision: 'approved',
      url: 'https://practice.example/apply',
      value: 'Syed Ali',
      executionSuccess: true,
    });

    const entry2 = await appendAuditLog({
      taskId: 'task-100',
      stepIndex: 2,
      actionType: 'click',
      targetBadgeId: 5,
      description: 'Click on #5',
      reasoning: 'Submitting internship application',
      userDecision: 'approved',
      url: 'https://practice.example/apply',
      executionSuccess: true,
    });

    const logs = await getAuditLogs();
    expect(logs.length).toBe(2);
    // Newest log is prepended first
    expect(logs[0].id).toBe(entry2.id);
    expect(logs[0].actionType).toBe('click');
    expect(logs[1].id).toBe(entry1.id);
    expect(logs[1].actionType).toBe('type');
  });

  it('exports audit log records as valid JSON string', async () => {
    await appendAuditLog({
      taskId: 'task-export-1',
      stepIndex: 1,
      actionType: 'click',
      targetBadgeId: 1,
      description: 'Click on #1',
      reasoning: 'Testing export functionality',
      userDecision: 'approved',
    });

    const jsonStr = await exportAuditLogsJson();
    expect(typeof jsonStr).toBe('string');
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].taskId).toBe('task-export-1');
  });

  it('clears all audit log entries', async () => {
    await appendAuditLog({
      taskId: 'task-to-wipe',
      stepIndex: 1,
      actionType: 'click',
      description: 'Temporary action',
      reasoning: 'To be wiped',
      userDecision: 'approved',
    });

    let logs = await getAuditLogs();
    expect(logs.length).toBe(1);

    await clearAuditLogs();
    logs = await getAuditLogs();
    expect(logs.length).toBe(0);
  });

  it('automatically logs approved, skipped, and stopped actions in AgentOrchestrator', async () => {
    // Set up a session awaiting approval
    const testSession: AgentTaskSession = {
      taskId: 'task-auto-audit-777',
      goal: 'Complete form and search shop',
      tabId: 55,
      url: 'https://practice.com',
      status: 'AWAITING_APPROVAL',
      currentStep: 1,
      maxSteps: 10,
      history: [],
      pendingProposal: {
        action: 'type',
        target_id: 3,
        value: 'Stanford',
        reason: 'Fill university field',
      },
      dryRun: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    mockStorage['active_task_session'] = testSession;
    await AgentOrchestrator.rehydrate();

    // 1. Approve step
    // Mock step() to avoid real LLM call on loop continuation
    vi.spyOn(AgentOrchestrator as any, 'step').mockResolvedValue({
      ...testSession,
      status: 'AWAITING_APPROVAL',
      currentStep: 2,
    });

    await AgentOrchestrator.approveStep();

    let logs = await getAuditLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].taskId).toBe('task-auto-audit-777');
    expect(logs[0].userDecision).toBe('approved');
    expect(logs[0].actionType).toBe('type');
    expect(logs[0].value).toBe('Stanford');

    // 2. Set up next pending proposal and skip it
    const active = AgentOrchestrator.getSession()!;
    active.pendingProposal = {
      action: 'click',
      target_id: 9,
      reason: 'Skip optional newsletter subscription',
    };

    await AgentOrchestrator.skipStep();

    logs = await getAuditLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].userDecision).toBe('skipped');
    expect(logs[0].actionType).toBe('click');

    // 3. Stop task (kill switch)
    active.pendingProposal = {
      action: 'click',
      target_id: 12,
      reason: 'Click unexpected button',
    };

    await AgentOrchestrator.stopTask('User clicked stop');

    logs = await getAuditLogs();
    expect(logs.length).toBe(3);
    expect(logs[0].userDecision).toBe('stopped');
    expect(logs[0].error).toBe('User clicked stop');
  });
});
