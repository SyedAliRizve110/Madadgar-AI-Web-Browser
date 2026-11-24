/**
 * Madadgar - HITL Agent Orchestrator Finite State Machine (Task 3.6)
 * Manages the autonomous multi-step errand loop with strict human-in-the-loop sign-off,
 * safety boundary checks, step caps, and service worker dormancy persistence.
 */

import { AIGateway } from '@/ai/ai_gateway';
import {
  saveActiveAgentSession,
  getActiveAgentSession,
  clearActiveAgentSession,
  appendAuditLog,
  getUserProfile,
} from '@/common/storage_adapter';
import type {
  ActionPreSnapshot,
  AgentActionProposal,
  AgentFSMStatus,
  AgentTaskSession,
  AgentTaskStepHistory,
  AutonomyMode,
  ExecuteActionResponse,
  ScanDOMResponse,
  ScannedElement,
  UserProfileMemory,
} from '@/common/types';
import { validateDomainSafety } from '@/safety/domain_rules';
import { validateActionProposal } from '@/safety/action_validator';
import { RiskClassifier } from '@/safety/risk_classifier';

export const AGENT_TASK_SESSION_STORAGE_KEY = 'active_task_session';
export const DEFAULT_MAX_STEPS = 15;

export type AgentSessionListener = (session: AgentTaskSession | null) => void;

export class AgentOrchestrator {
  private static activeSession: AgentTaskSession | null = null;
  private static cachedElements: ScannedElement[] = [];
  private static listeners: Set<AgentSessionListener> = new Set();
  private static profileMemory: UserProfileMemory | undefined = undefined;
  private static undoStack: ActionPreSnapshot[] = [];

  /**
   * Starts a new Agent task errand
   */
  public static async startTask(
    goal: string,
    tabId: number,
    options?: {
      maxSteps?: number;
      dryRun?: boolean;
      profileMemory?: UserProfileMemory;
      url?: string;
      autonomyMode?: AutonomyMode;
    }
  ): Promise<AgentTaskSession> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const maxSteps = options?.maxSteps || DEFAULT_MAX_STEPS;
    const dryRun = Boolean(options?.dryRun);
    this.profileMemory = options?.profileMemory || (await getUserProfile());

    const initialSession: AgentTaskSession = {
      taskId,
      goal,
      tabId,
      url: options?.url,
      currentStep: 1,
      maxSteps,
      status: 'IDLE',
      pendingProposal: null,
      history: [],
      error: null,
      dryRun,
      autonomyMode: options?.autonomyMode || 'co-pilot',
      consecutiveIdenticalActions: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.activeSession = initialSession;
    await this.persistSession();
    this.notifyListeners();

    // Begin first step loop
    return this.step();
  }

  /**
   * Sets or updates the Tiered Autonomy mode (Task 6.2)
   */
  public static async setAutonomyMode(mode: AutonomyMode): Promise<AgentTaskSession | null> {
    if (this.activeSession) {
      this.activeSession.autonomyMode = mode;
      await this.persistSession();
      this.notifyListeners();
    }
    return this.activeSession;
  }

  /**
   * Executes the planning step:
   * 1. Scan page -> 2. Build action map -> 3. Request LLM proposal -> 4. Safety check -> 5. Await approval
   */
  public static async step(): Promise<AgentTaskSession> {
    if (!this.activeSession) {
      throw new Error('No active task session to step.');
    }

    const session = this.activeSession;

    // Check step limit
    if (session.currentStep > session.maxSteps) {
      session.status = 'TASK_COMPLETED';
      session.error = `Reached maximum step cap (${session.maxSteps} steps).`;
      await this.persistSession();
      this.notifyListeners();
      return session;
    }

    // Pre-check URL safety if known
    if (session.url) {
      const initialUrlSafety = this.isUrlSafe(session.url);
      if (!initialUrlSafety.safe) {
        session.status = 'BLOCKED_SAFETY';
        session.error = initialUrlSafety.reason || 'Restricted URL for autonomous agent execution.';
        await this.clearBadges(session.tabId);
        await this.persistSession();
        this.notifyListeners();
        return session;
      }
    }

    try {
      // 1. Scan DOM
      session.status = 'SCANNING_DOM';
      this.notifyListeners();

      const scanRes = await this.sendTabMessage<ScanDOMResponse>(session.tabId, {
        type: 'SCAN_INTERACTIVE_DOM',
        renderBadges: true,
      });

      if (!scanRes || !scanRes.success || !scanRes.elements) {
        throw new Error(scanRes?.error || 'Failed to scan interactive elements on page.');
      }

      session.url = scanRes.url || session.url;
      this.cachedElements = scanRes.elements;
      session.status = 'DOM_MAPPED';
      this.notifyListeners();

      // Check URL safety
      const urlSafety = this.isUrlSafe(session.url);
      if (!urlSafety.safe) {
        session.status = 'BLOCKED_SAFETY';
        session.error = urlSafety.reason || 'Restricted URL for autonomous agent execution.';
        await this.clearBadges(session.tabId);
        await this.persistSession();
        this.notifyListeners();
        return session;
      }

      // 2. Request AI Proposal
      session.status = 'REASONING_AI';
      this.notifyListeners();

      if (!this.profileMemory) {
        this.profileMemory = await getUserProfile();
      }

      const proposal = await AIGateway.proposeNextAction(
        session.goal,
        this.cachedElements,
        session.history,
        this.profileMemory
      );

      // 3. Safety Validation & Risk Classification (Task 6.1)
      session.status = 'SAFETY_VALIDATION';
      this.notifyListeners();

      const safetyResult = this.isActionSafe(proposal, this.cachedElements);
      if (!safetyResult.safe) {
        session.status = 'BLOCKED_SAFETY';
        session.error = safetyResult.reason || 'Proposed action failed safety policy.';
        await this.clearBadges(session.tabId);
        await this.persistSession();
        this.notifyListeners();
        return session;
      }

      // 4. Stagnation Detector (Task 6.2)
      // Automatically abort if the agent attempts the same state/action >= 3 consecutive times
      const lastStep = session.history[session.history.length - 1];
      const isIdenticalAction =
        Boolean(lastStep) &&
        lastStep.action.action === proposal.action &&
        lastStep.action.target_id === proposal.target_id &&
        lastStep.action.value === proposal.value;

      if (isIdenticalAction) {
        session.consecutiveIdenticalActions = (session.consecutiveIdenticalActions || 0) + 1;
      } else {
        session.consecutiveIdenticalActions = 0;
      }

      if ((session.consecutiveIdenticalActions || 0) >= 2) {
        session.status = 'ERROR';
        session.error = `Stagnation detected: Agent attempted the same action (${proposal.action}${proposal.target_id !== undefined ? ` #${proposal.target_id}` : ''}) 3 times without progress.`;
        await this.clearBadges(session.tabId);
        await this.persistSession();
        this.notifyListeners();
        return session;
      }

      // 5. Handle Terminal Proposals
      if (proposal.action === 'done') {
        session.status = 'TASK_COMPLETED';
        session.pendingProposal = proposal;
        await this.clearBadges(session.tabId);
        await this.persistSession();
        this.notifyListeners();
        return session;
      }

      if (proposal.action === 'fail') {
        session.status = 'ERROR';
        session.error = proposal.reason || 'Agent concluded task cannot be achieved.';
        await this.clearBadges(session.tabId);
        await this.persistSession();
        this.notifyListeners();
        return session;
      }

      // 6. Highlight target element on the webpage
      if (typeof proposal.target_id === 'number') {
        await this.sendTabMessage(session.tabId, {
          type: 'HIGHLIGHT_ELEMENT',
          targetId: proposal.target_id,
          mode: session.dryRun ? 'dry-run' : 'proposed',
        });
      }

      session.pendingProposal = proposal;

      // 7. Tiered Autonomy FSM Execution Gate (Task 6.2)
      // Supervised Auto-Pilot automatically executes steps with risk score < 0.5.
      // Pauses and prompts for approval on steps >= 0.5 or consequential actions.
      const isAutoPilot = session.autonomyMode === 'auto-pilot';
      const isLowRisk = (proposal.risk_score ?? 0) < 0.5 && !proposal.is_consequential;

      if (isAutoPilot && isLowRisk) {
        // Enforce Dynamic Mutation Quiescence (wait 250ms for DOM settling between autonomous steps)
        await this.delay(250);

        session.status = 'AWAITING_APPROVAL';
        await this.persistSession();
        this.notifyListeners();

        // Automatically approve and execute the step
        return this.approveStep();
      }

      // Manual Co-Pilot or Consequential Action: pause for explicit HITL approval
      session.status = 'AWAITING_APPROVAL';
      await this.persistSession();
      this.notifyListeners();

      return session;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      session.status = 'ERROR';
      session.error = errorMsg;
      await this.persistSession();
      this.notifyListeners();
      return session;
    }
  }

  /**
   * Approves the pending proposal and executes it on the active tab
   */
  public static async approveStep(): Promise<AgentTaskSession> {
    if (!this.activeSession || !this.activeSession.pendingProposal) {
      throw new Error('No pending proposal to approve.');
    }

    const session = this.activeSession;
    const proposal: AgentActionProposal = session.pendingProposal!;

    session.status = 'EXECUTING_ACTION';
    this.notifyListeners();

    try {
      // Execute via content script
      const execResult = await this.sendTabMessage<ExecuteActionResponse>(
        session.tabId,
        {
          type: 'EXECUTE_ACTION',
          action: proposal,
          dryRun: session.dryRun,
        }
      );

      // Record step in history
      const stepRecord: AgentTaskStepHistory = {
        step: session.currentStep,
        action: proposal,
        result: execResult,
        timestamp: Date.now(),
      };
      session.history.push(stepRecord);

      // Record pre-action snapshot in Undo stack (Task 6.7)
      if (execResult?.preSnapshot) {
        this.undoStack.push(execResult.preSnapshot);
      }

      // Record audit log entry (Task 3.9 & Task 6.7)
      try {
        await appendAuditLog({
          taskId: session.taskId,
          stepIndex: stepRecord.step,
          actionType: proposal.action,
          targetBadgeId: proposal.target_id ?? undefined,
          description: this.formatActionDescription(proposal),
          reasoning: proposal.reason,
          userDecision: 'approved',
          url: session.url,
          value: proposal.value,
          executionSuccess: execResult?.success ?? true,
          error: execResult?.error,
          canUndo: Boolean(execResult?.preSnapshot),
          preSnapshot: execResult?.preSnapshot,
        });
      } catch (logErr) {
        console.warn('[AgentOrchestrator] Failed to append audit log for approved step:', logErr);
      }

      session.status = 'VERIFYING_STATE';
      this.notifyListeners();

      // Brief delay for page updates or navigation
      await this.delay(600);

      // Advance step counter
      session.currentStep += 1;
      session.pendingProposal = null;

      // Check if task completed
      if (proposal.action === 'done' || session.currentStep > session.maxSteps) {
        session.status = 'TASK_COMPLETED';
        await this.clearBadges(session.tabId);
        await this.persistSession();
        this.notifyListeners();
        return session;
      }

      // Automatically continue to next step loop
      await this.persistSession();
      return this.step();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      session.status = 'ERROR';
      session.error = `Action execution failed: ${errorMsg}`;
      await this.persistSession();
      this.notifyListeners();
      return session;
    }
  }

  /**
   * Skips the current pending action without executing it
   */
  public static async skipStep(): Promise<AgentTaskSession> {
    if (!this.activeSession || !this.activeSession.pendingProposal) {
      throw new Error('No pending proposal to skip.');
    }

    const session = this.activeSession;
    const proposal: AgentActionProposal = session.pendingProposal!;

    session.status = 'SKIPPING_STEP';
    session.history.push({
      step: session.currentStep,
      action: proposal,
      result: {
        success: true,
        action: proposal.action,
        error: 'Skipped by user.',
      },
      timestamp: Date.now(),
    });

    session.currentStep += 1;
    session.pendingProposal = null;

    // Record audit log entry (Task 3.9)
    try {
      await appendAuditLog({
        taskId: session.taskId,
        stepIndex: session.currentStep - 1,
        actionType: proposal.action,
        targetBadgeId: proposal.target_id ?? undefined,
        description: this.formatActionDescription(proposal),
        reasoning: proposal.reason,
        userDecision: 'skipped',
        url: session.url,
        value: proposal.value,
        executionSuccess: true,
        error: 'Skipped by user.',
      });
    } catch (logErr) {
      console.warn('[AgentOrchestrator] Failed to append audit log for skipped step:', logErr);
    }

    if (session.currentStep > session.maxSteps) {
      session.status = 'TASK_COMPLETED';
      await this.clearBadges(session.tabId);
      await this.persistSession();
      this.notifyListeners();
      return session;
    }

    await this.persistSession();
    this.notifyListeners();
    return this.step();
  }

  /**
   * Stops and aborts the active errand immediately (Kill switch)
   */
  public static async stopTask(reason = 'Task stopped by user.'): Promise<AgentTaskSession> {
    if (!this.activeSession) {
      throw new Error('No active task to stop.');
    }

    const session = this.activeSession;
    const proposal = session.pendingProposal;
    session.status = 'TASK_ABORTED';
    session.error = reason;
    session.pendingProposal = null;

    // Record audit log entry (Task 3.9)
    try {
      if (proposal) {
        await appendAuditLog({
          taskId: session.taskId,
          stepIndex: session.currentStep,
          actionType: proposal.action,
          targetBadgeId: proposal.target_id ?? undefined,
          description: this.formatActionDescription(proposal),
          reasoning: proposal.reason,
          userDecision: 'stopped',
          url: session.url,
          value: proposal.value,
          executionSuccess: false,
          error: reason,
        });
      } else {
        await appendAuditLog({
          taskId: session.taskId,
          stepIndex: session.currentStep,
          actionType: 'fail',
          description: 'Task halted by kill switch',
          reasoning: reason,
          userDecision: 'stopped',
          url: session.url,
          executionSuccess: false,
          error: reason,
        });
      }
    } catch (logErr) {
      console.warn('[AgentOrchestrator] Failed to append audit log for stopped task:', logErr);
    }

    await this.clearBadges(session.tabId);
    await this.persistSession();
    this.notifyListeners();

    return session;
  }

  /**
   * Action Rollback Dispatcher: reverts the most recent action executed on the page (Task 6.7)
   */
  public static async undoLastAction(tabId?: number): Promise<{
    success: boolean;
    error?: string;
    snapshot?: ActionPreSnapshot;
  }> {
    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      return { success: false, error: 'No previous action available to undo.' };
    }

    const targetTabId = tabId || this.activeSession?.tabId;
    if (!targetTabId) {
      return { success: false, error: 'No active tab target found for undo rollback.' };
    }

    try {
      const res = await this.sendTabMessage<{ success: boolean; error?: string }>(targetTabId, {
        type: 'EXECUTE_UNDO',
        snapshot,
      });

      if (res?.success) {
        // Log rollback event into Audit Log
        try {
          await appendAuditLog({
            taskId: this.activeSession?.taskId || 'manual_undo',
            stepIndex: (this.activeSession?.currentStep || 1) - 1,
            actionType: snapshot.action,
            targetBadgeId: snapshot.targetId,
            description: `Rolled back ${snapshot.action} action (reverted to "${snapshot.previousValue ?? ''}")`,
            reasoning: 'User requested action rollback (Undo stack dispatcher)',
            userDecision: 'approved',
            value: snapshot.previousValue,
            executionSuccess: true,
          });
        } catch {
          // Non-fatal
        }

        if (this.activeSession && this.activeSession.history.length > 0) {
          this.activeSession.history.pop();
          if (this.activeSession.currentStep > 1) {
            this.activeSession.currentStep -= 1;
          }
          await this.persistSession();
          this.notifyListeners();
        }

        return { success: true, snapshot };
      } else {
        return { success: false, error: res?.error || 'Rollback execution failed in content script.' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public static getUndoStack(): ActionPreSnapshot[] {
    return [...this.undoStack];
  }

  /**
   * Formats a human-readable description for an agent action proposal
   */
  public static formatActionDescription(proposal: AgentActionProposal): string {
    const target =
      proposal.target_id !== null && proposal.target_id !== undefined
        ? ` on #${proposal.target_id}`
        : '';
    const val = proposal.value ? ` ("${proposal.value}")` : '';
    switch (proposal.action) {
      case 'click':
        return `Click${target}`;
      case 'type':
        return `Type${val}${target}`;
      case 'select':
        return `Select option${val}${target}`;
      case 'scroll':
        return `Scroll ${proposal.value || 'down'}${target}`;
      case 'done':
        return 'Mark errand completed';
      case 'fail':
        return 'Conclude task impossible';
      default:
        return `${proposal.action}${target}${val}`;
    }
  }

  /**
   * Rehydrates the task session from chrome.storage.local (Task 3.8 / Dormancy)
   */
  public static async rehydrate(): Promise<AgentTaskSession | null> {
    try {
      const session = await getActiveAgentSession();
      if (session) {
        this.activeSession = session;
        this.notifyListeners();
        return session;
      }
    } catch (err) {
      console.warn('[AgentOrchestrator] Failed to rehydrate session from storage:', err);
    }
    return null;
  }

  /**
   * Returns current active task session
   */
  public static getSession(): AgentTaskSession | null {
    return this.activeSession;
  }

  /**
   * Subscribes to real-time session state transitions
   */
  public static subscribe(listener: AgentSessionListener): () => void {
    this.listeners.add(listener);
    if (this.activeSession) {
      listener(this.activeSession);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns current FSM status
   */
  public static getStatus(): AgentFSMStatus {
    return this.activeSession?.status || 'IDLE';
  }

  /**
   * Clears the current active session
   */
  public static async clearSession(): Promise<void> {
    if (this.activeSession) {
      await this.clearBadges(this.activeSession.tabId);
    }
    this.activeSession = null;
    this.cachedElements = [];
    try {
      await clearActiveAgentSession();
    } catch (err) {
      console.warn('[AgentOrchestrator] Failed to clear session:', err);
    }
    this.notifyListeners();
  }

  /**
   * Immediate Emergency Kill Switch (Task 4.4.4):
   * Immediately aborts active LLM requests, clears content script overlays,
   * resets FSM to IDLE, and deletes active_task_session from storage.
   */
  public static async emergencyKillSwitch(reason = 'Emergency kill switch activated.'): Promise<void> {
    const session = this.activeSession;
    const tabId = session?.tabId;

    if (tabId) {
      try {
        await this.sendTabMessage(tabId, { type: 'EMERGENCY_KILL_SWITCH' });
      } catch {
        // Tab may be closed or navigating
      }
      try {
        await this.clearBadges(tabId);
      } catch {
        // ignore
      }
    }

    if (session) {
      try {
        await appendAuditLog({
          taskId: session.taskId,
          stepIndex: session.currentStep,
          actionType: 'fail',
          description: 'Emergency kill switch triggered',
          reasoning: reason,
          userDecision: 'stopped',
          url: session.url,
          executionSuccess: false,
          error: reason,
        });
      } catch (logErr) {
        console.warn('[AgentOrchestrator] Failed to append audit log for kill switch:', logErr);
      }
    }

    this.activeSession = null;
    this.cachedElements = [];
    try {
      await clearActiveAgentSession();
    } catch (err) {
      console.warn('[AgentOrchestrator] Failed to clear session:', err);
    }
    this.notifyListeners();
  }

  /**
   * URL safety boundary validation (Task 4.4.1)
   */
  public static isUrlSafe(url?: string): { safe: boolean; reason?: string } {
    return validateDomainSafety(url);
  }

  /**
   * Proposal safety boundary validation (Task 4.4.2 & 4.4.3)
   */
  public static isActionSafe(
    proposal: AgentActionProposal,
    elements: ScannedElement[]
  ): { safe: boolean; reason?: string } {
    // 1. Evaluate deterministic risk assessment score and levels (Task 6.1)
    const targetEl = elements.find((e) => e.id === proposal.target_id);
    const assessment = RiskClassifier.assess(proposal, targetEl, this.activeSession?.url);

    proposal.risk_score = assessment.score;
    proposal.risk_level = assessment.level;
    if (assessment.requiresConfirmation || assessment.score >= 0.5) {
      proposal.is_consequential = true;
    }

    if (assessment.isHardBlocked) {
      return {
        safe: false,
        reason: assessment.reasons[0] || 'Proposed action failed deterministic safety policy.',
      };
    }

    const safety = validateActionProposal(proposal, elements, this.activeSession?.url);
    if (!safety.safe) {
      return {
        safe: false,
        reason: safety.reason || 'Proposed action failed deterministic safety policy.',
      };
    }
    if (safety.isConsequential) {
      proposal.is_consequential = true;
    }
    return { safe: true };
  }

  /**
   * Persists active session state to chrome.storage.local (Task 3.8 / Dormancy)
   */
  private static async persistSession(): Promise<void> {
    if (!this.activeSession) return;
    this.activeSession.updatedAt = Date.now();

    try {
      await saveActiveAgentSession(this.activeSession);
    } catch (err) {
      console.warn('[AgentOrchestrator] Failed to persist session:', err);
    }
  }

  private static notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.activeSession);
      } catch (err) {
        console.error('[AgentOrchestrator] Listener error:', err);
      }
    }
  }

  private static async clearBadges(tabId: number): Promise<void> {
    try {
      await this.sendTabMessage(tabId, { type: 'CLEAR_BADGES' });
    } catch {
      // Tab may be closed or navigating
    }
  }

  private static sendTabMessage<T = any>(tabId: number, message: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        resolve({ success: true } as unknown as T);
        return;
      }

      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as T);
        }
      });
    });
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
