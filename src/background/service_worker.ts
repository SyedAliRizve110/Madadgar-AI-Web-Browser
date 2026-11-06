/**
 * Madadgar - Background Service Worker
 * Central orchestration hub and event listener for Manifest V3 lifecycle.
 */

import { MessageBus } from './message_bus';
import { ContextMenuManager } from './context_menus';
import { ScreenCaptureManager } from './screen_capture';
import { AgentOrchestrator } from './agent_orchestrator';
import { getAuditLogs, clearAuditLogs } from '@/common/storage_adapter';

// Initialize persistent bidirectional message bus & tab tracking
MessageBus.init();

// Rehydrate active task session on service worker startup (Task 3.6 / Task 3.8)
AgentOrchestrator.rehydrate().catch((err) => {
  console.warn('[Madadgar Service Worker] Session rehydration failed:', err);
});

// Initialize context menus and register click listener synchronously on worker boot (Task 2.3)
ContextMenuManager.init();

// Configure side panel behavior to open when user clicks the extension action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: unknown) => {
    console.error('[Madadgar Service Worker] Failed to set panel behavior:', error);
  });

// Handle extension installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Madadgar Service Worker] Extension installed/updated:', details.reason);
  
  // Ensure context menus are cleanly registered upon installation/update
  ContextMenuManager.createMenus();

  // Set default storage keys if not present
  chrome.storage.local.get(['gemini_api_key', 'preferred_language'], (items) => {
    if (!items.preferred_language) {
      chrome.storage.local.set({ preferred_language: 'en' });
    }
  });
});

// Also ensure context menus are created on browser startup
if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    ContextMenuManager.createMenus();
  });
}

// Listener for runtime messages from content scripts and sidepanel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
    return true;
  }

  if (message?.type === 'GET_PENDING_CONTEXT_ACTION') {
    ContextMenuManager.consumePendingAction().then((action) => {
      sendResponse({ action });
    });
    return true; // asynchronous response
  }

  if (message?.type === 'CAPTURE_VISIBLE_TAB') {
    ScreenCaptureManager.captureCurrentTab(message.windowId, message.quality).then((result) => {
      sendResponse(result);
    });
    return true; // asynchronous response
  }

  // HITL Agent Orchestrator Commands (Task 3.6)
  if (message?.type === 'START_AGENT_TASK') {
    AgentOrchestrator.startTask(message.goal, message.tabId, {
      maxSteps: message.maxSteps,
      dryRun: message.dryRun,
      profileMemory: message.profileMemory,
      url: message.url,
    })
      .then((session) => sendResponse({ success: true, session }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'APPROVE_AGENT_STEP') {
    AgentOrchestrator.approveStep()
      .then((session) => sendResponse({ success: true, session }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'SKIP_AGENT_STEP') {
    AgentOrchestrator.skipStep()
      .then((session) => sendResponse({ success: true, session }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'STOP_AGENT_TASK') {
    AgentOrchestrator.stopTask(message.reason)
      .then((session) => sendResponse({ success: true, session }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'EMERGENCY_KILL_SWITCH') {
    AgentOrchestrator.emergencyKillSwitch(message.reason)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'CLEAR_AGENT_SESSION' || message?.type === 'RESET_AGENT_SESSION') {
    AgentOrchestrator.clearSession()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'GET_AGENT_SESSION') {
    const session = AgentOrchestrator.getSession();
    if (session) {
      sendResponse({ success: true, session });
    } else {
      AgentOrchestrator.rehydrate().then((rehydrated) => {
        sendResponse({ success: true, session: rehydrated });
      });
    }
    return true;
  }

  // Action Audit Log Handlers (Task 3.9)
  if (message?.type === 'GET_AUDIT_LOGS') {
    getAuditLogs()
      .then((logs) => sendResponse({ success: true, logs }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'CLEAR_AUDIT_LOGS') {
    clearAuditLogs()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});
