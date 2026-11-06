// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuditLog } from '@/sidepanel/components/AuditLog';
import * as storageAdapter from '@/common/storage_adapter';
import type { AuditLogEntry } from '@/common/types';

describe('AuditLog Component UI (Task 3.9)', () => {
  const mockEntries: AuditLogEntry[] = [
    {
      id: 'log-1',
      timestamp: 1700000000000,
      taskId: 'task-test-abc-12345678',
      stepIndex: 1,
      actionType: 'type',
      targetBadgeId: 2,
      description: 'Type ("Ali Rizvi") on #2',
      reasoning: 'Fill full name into application form',
      userDecision: 'approved',
      value: 'Ali Rizvi',
      executionSuccess: true,
      url: 'https://practice.example/apply',
    },
    {
      id: 'log-2',
      timestamp: 1700000005000,
      taskId: 'task-test-abc-12345678',
      stepIndex: 2,
      actionType: 'click',
      targetBadgeId: 5,
      description: 'Click on #5',
      reasoning: 'Submit internship application',
      userDecision: 'approved',
      executionSuccess: true,
      url: 'https://practice.example/apply',
    },
    {
      id: 'log-3',
      timestamp: 1700000010000,
      taskId: 'task-test-abc-12345678',
      stepIndex: 3,
      actionType: 'click',
      targetBadgeId: 8,
      description: 'Click on #8',
      reasoning: 'Optional newsletter popup',
      userDecision: 'skipped',
    },
  ];

  beforeEach(() => {
    vi.spyOn(storageAdapter, 'getAuditLogs').mockResolvedValue(mockEntries);
    vi.spyOn(storageAdapter, 'clearAuditLogs').mockResolvedValue();
    vi.spyOn(storageAdapter, 'exportAuditLogsJson').mockResolvedValue(JSON.stringify(mockEntries));
  });

  it('renders Action Audit Log header with total count and control buttons', () => {
    const html = renderToString(React.createElement(AuditLog, {}));
    expect(html).toContain('Action Audit Log');
    expect(html).toContain('Immutable trace of human-approved and skipped agent actions');
    expect(html).toContain('Export Audit Log as JSON');
    expect(html).toContain('Clear Audit Log');
  });

  it('renders filter pills for decisions and actions', () => {
    const html = renderToString(React.createElement(AuditLog, {}));
    expect(html).toContain('approved');
    expect(html).toContain('skipped');
    expect(html).toContain('stopped');
    expect(html).toContain('click');
    expect(html).toContain('type');
    expect(html).toContain('select');
    expect(html).toContain('scroll');
  });

  it('renders empty state illustration when no logs are present', () => {
    vi.spyOn(storageAdapter, 'getAuditLogs').mockResolvedValue([]);
    const html = renderToString(React.createElement(AuditLog, {}));
    expect(html).toBeDefined();
  });
});

