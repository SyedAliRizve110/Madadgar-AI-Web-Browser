/**
 * Madadgar - Background Service Worker
 * Central orchestration hub and event listener for Manifest V3 lifecycle.
 */

import { MessageBus } from './message_bus';
import { ContextMenuManager } from './context_menus';
import { ScreenCaptureManager } from './screen_capture';
import { AgentOrchestrator } from './agent_orchestrator';
import { getAuditLogs, clearAuditLogs } from '@/common/storage_adapter';
import { UniversalSidebarAdapter } from '@/common/sidebar_adapter';
import { TabCoordinator } from './tab_coordinator';
import { MapReduceSynthesizer } from './synthesizer';

// Initialize persistent bidirectional message bus & tab tracking
MessageBus.init();

// Rehydrate active task session on service worker startup (Task 3.6 / Task 3.8)
AgentOrchestrator.rehydrate().catch((err) => {
  console.warn('[Madadgar Service Worker] Session rehydration failed:', err);
});

// Initialize context menus and register click listener synchronously on worker boot (Task 2.3)
ContextMenuManager.init();

// Configure universal sidebar / sidepanel behavior across Chromium and Gecko (Task 5.2)
UniversalSidebarAdapter.configureActionClick().catch((error: unknown) => {
  console.warn('[Madadgar Service Worker] Failed to configure action click behavior:', error);
});

// Initialize multi-tab errand coordinator (Task 7.1)
TabCoordinator.init();

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

// Helper to open sidepanel if closed and broadcast voice toggle
async function handleVoiceToggleCommand(senderTab?: chrome.tabs.Tab): Promise<void> {
  let targetTab = senderTab;
  if (!targetTab && typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTab = tabs[0];
    } catch {
      // Ignored
    }
  }

  // Ensure sidepanel / sidebar is open
  if (targetTab?.windowId) {
    try {
      await UniversalSidebarAdapter.open({ windowId: targetTab.windowId, tabId: targetTab.id });
    } catch {
      // Ignored
    }
  }

  // Allow short delay for sidepanel port to establish if it was closed
  setTimeout(() => {
    MessageBus.broadcast({ type: 'TOGGLE_VOICE_INPUT' });
  }, 150);
}

// Global hotkey command listener (Task 5.4: Alt+V toggles voice input)
if (typeof chrome !== 'undefined' && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-voice-input') {
      console.log('[Madadgar Service Worker] Global command received: toggle-voice-input (Alt+V)');
      handleVoiceToggleCommand().catch(() => {});
    }
  });
}

// Listener for runtime messages from content scripts and sidepanel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TOGGLE_VOICE_FROM_CONTENT') {
    handleVoiceToggleCommand(_sender.tab)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'OPEN_PERMISSIONS_TAB') {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      const url = chrome.runtime.getURL('src/sidepanel/index.html?request_mic=true');
      chrome.tabs.create({ url });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Tabs API unavailable' });
    }
    return true;
  }

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

  // HITL Agent Orchestrator Commands (Task 3.6 & Task 6.2)
  if (message?.type === 'START_AGENT_TASK') {
    AgentOrchestrator.startTask(message.goal, message.tabId, {
      maxSteps: message.maxSteps,
      dryRun: message.dryRun,
      profileMemory: message.profileMemory,
      url: message.url,
      autonomyMode: message.autonomyMode,
    })
      .then((session) => sendResponse({ success: true, session }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'SET_AUTONOMY_MODE') {
    AgentOrchestrator.setAutonomyMode(message.mode)
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

  if (message?.type === 'UNDO_LAST_ACTION') {
    AgentOrchestrator.undoLastAction(message.tabId)
      .then((result) => sendResponse(result))
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

  // Cross-Tab Map-Reduce & Multi-Tab Errand Handlers (Task 7.1 & Task 7.2)
  if (message?.type === 'COMPARE_TABS') {
    MapReduceSynthesizer.compareTabs(message.tabIds, message.options)
      .then((matrix) => sendResponse({ success: true, matrix }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'COMPARE_URLS') {
    MapReduceSynthesizer.compareUrls(message.urls, message.options)
      .then((matrix) => sendResponse({ success: true, matrix }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message?.type === 'GET_MANAGED_TABS') {
    sendResponse({ success: true, tabs: TabCoordinator.getManagedTabs() });
    return true;
  }

  return false;
});
