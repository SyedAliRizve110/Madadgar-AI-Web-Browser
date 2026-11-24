// @vitest-environment jsdom
/**
 * Action Audit Trail Undo Stack & Rollback Dispatcher Tests (Task 6.7)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionExecutor } from '@/content/executor';
import { DOMScanner } from '@/content/scanner';
import { AgentOrchestrator } from '@/background/agent_orchestrator';
import { IntentRouter } from '@/voice/intent_router';
import type { AgentActionProposal, ActionPreSnapshot } from '@/common/types';

describe('Action Audit Trail Undo Stack & Rollback Dispatcher (Task 6.7)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Pre-Action Snapshot Capture in ActionExecutor', () => {
    it('captures pre-action value snapshot when executing type action', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Initial Value';
      document.body.appendChild(input);

      DOMScanner.scan();
      const scanned = DOMScanner.getLastScannedElements();
      expect(scanned.length).toBeGreaterThan(0);
      const targetId = scanned[0].id;

      const proposal: AgentActionProposal = {
        action: 'type',
        target_id: targetId,
        value: 'New Overwritten Value',
        reason: 'Type new data',
      };

      const result = await ActionExecutor.execute(proposal);
      expect(result.success).toBe(true);
      expect(input.value).toBe('New Overwritten Value');
      expect(result.preSnapshot).toBeDefined();
      expect(result.preSnapshot?.previousValue).toBe('Initial Value');
      expect(result.preSnapshot?.targetId).toBe(targetId);
      expect(result.preSnapshot?.action).toBe('type');
    });

    it('captures pre-action scroll coordinates when executing scroll action', async () => {
      const proposal: AgentActionProposal = {
        action: 'scroll',
        value: 'down',
        reason: 'Scroll page down',
      };

      const result = await ActionExecutor.execute(proposal);
      expect(result.success).toBe(true);
      expect(result.preSnapshot).toBeDefined();
      expect(result.preSnapshot?.action).toBe('scroll');
      expect(result.preSnapshot?.previousScroll).toBeDefined();
    });
  });

  describe('Rollback Execution via ActionExecutor.executeUndo', () => {
    it('reverts text input value back to snapshot previous value', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Mutated Value';
      document.body.appendChild(input);

      DOMScanner.scan();
      const scanned = DOMScanner.getLastScannedElements();
      const targetId = scanned[0].id;

      const snapshot: ActionPreSnapshot = {
        targetId,
        action: 'type',
        previousValue: 'Original Safe State',
        timestamp: Date.now(),
      };

      const undoResult = ActionExecutor.executeUndo(snapshot);
      expect(undoResult.success).toBe(true);
      expect(input.value).toBe('Original Safe State');
    });

    it('reverts contenteditable element back to snapshot previous text', () => {
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      editor.textContent = 'Accidentally modified paragraph.';
      document.body.appendChild(editor);

      DOMScanner.scan();
      const scanned = DOMScanner.getLastScannedElements();
      const targetId = scanned[0].id;

      const snapshot: ActionPreSnapshot = {
        targetId,
        action: 'type',
        previousValue: 'Draft paragraph before AI generation.',
        timestamp: Date.now(),
      };

      const undoResult = ActionExecutor.executeUndo(snapshot);
      expect(undoResult.success).toBe(true);
      expect(editor.textContent).toBe('Draft paragraph before AI generation.');
    });

    it('gracefully handles missing or disconnected elements', () => {
      const snapshot: ActionPreSnapshot = {
        targetId: 99999,
        action: 'type',
        previousValue: 'Missing',
        timestamp: Date.now(),
      };

      const undoResult = ActionExecutor.executeUndo(snapshot);
      expect(undoResult.success).toBe(false);
      expect(undoResult.error).toContain('no longer connected');
    });
  });

  describe('Spoken Voice Undo Intent Routing', () => {
    it('routes "Madadgar, undo that" to TASK_CONTROL with taskControl: undo', () => {
      const intent = IntentRouter.routeIntent('Madadgar, undo that');
      expect(intent.type).toBe('TASK_CONTROL');
      expect(intent.taskControl).toBe('undo');
    });

    it('routes "undo last action" to TASK_CONTROL with taskControl: undo', () => {
      const intent = IntentRouter.routeIntent('undo last action');
      expect(intent.type).toBe('TASK_CONTROL');
      expect(intent.taskControl).toBe('undo');
    });

    it('routes Hindi/Hinglish "wapas karo" to TASK_CONTROL with taskControl: undo', () => {
      const intent = IntentRouter.routeIntent('wapas karo');
      expect(intent.type).toBe('TASK_CONTROL');
      expect(intent.taskControl).toBe('undo');
    });
  });

  describe('AgentOrchestrator Undo Stack Management', () => {
    it('returns error when undoLastAction is called on empty undo stack', async () => {
      // Clear undo stack
      while (AgentOrchestrator.getUndoStack().length > 0) {
        await AgentOrchestrator.undoLastAction(1);
      }

      const res = await AgentOrchestrator.undoLastAction(1);
      expect(res.success).toBe(false);
      expect(res.error).toContain('No previous action available to undo');
    });
  });
});
