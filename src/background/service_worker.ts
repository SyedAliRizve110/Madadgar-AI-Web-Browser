/**
 * Madadgar - Background Service Worker
 * Central orchestration hub and event listener for Manifest V3 lifecycle.
 */

import { MessageBus } from './message_bus';
import { ContextMenuManager } from './context_menus';
import { ScreenCaptureManager } from './screen_capture';

// Initialize persistent bidirectional message bus & tab tracking
MessageBus.init();

// Register context menu click listener synchronously on worker boot (Task 2.3)
ContextMenuManager.registerClickListener();

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

  return false;
});
