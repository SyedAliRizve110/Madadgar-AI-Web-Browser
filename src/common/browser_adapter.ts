/**
 * Madadgar Universal Browser Adapter (CBAE)
 * Cross-browser abstraction layer for Chromium (Chrome, Edge, Brave, Opera) and Gecko (Firefox).
 * Safe across browser extensions, web previews, and Node.js test runners.
 */

import type { Browser } from 'webextension-polyfill';

declare const browser: Browser | undefined;

let cachedPolyfill: Browser | null = null;

/**
 * Resets any cached browser polyfill instance (useful for unit testing and runtime switching).
 */
export function resetBrowserCache(): void {
  cachedPolyfill = null;
}

/**
 * Checks whether the current runtime is a genuine web extension context.
 */
export function isExtensionContext(): boolean {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) return true;
  if (typeof (globalThis as unknown as { browser?: { runtime?: { id?: string } } }).browser?.runtime?.id !== 'undefined') return true;
  return false;
}

/**
 * Determines whether the host browser engine is Mozilla Firefox (Gecko).
 */
export function isFirefox(): boolean {
  if (typeof navigator !== 'undefined' && /Firefox\/([0-9.]+)/i.test(navigator.userAgent)) {
    return true;
  }
  // Fallback: Firefox exposes browser.sidebarAction natively while chrome.sidePanel is absent
  const gBrowser = (globalThis as unknown as { browser?: { sidebarAction?: unknown } }).browser;
  if (typeof gBrowser?.sidebarAction !== 'undefined' && typeof chrome?.sidePanel === 'undefined') {
    return true;
  }
  return false;
}

/**
 * Determines whether the host browser engine is Chromium-based (Chrome, Edge, Brave, Opera, etc.).
 */
export function isChromium(): boolean {
  return !isFirefox() && (typeof chrome !== 'undefined' || typeof navigator !== 'undefined' && /Chrome|Chromium|Edg|OPR/i.test(navigator.userAgent));
}

/**
 * Checks if the Chrome/Chromium native sidePanel API is available.
 */
export function hasSidePanel(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.sidePanel?.open === 'function';
}

/**
 * Checks if the Firefox native sidebarAction API is available.
 */
export function hasSidebarAction(): boolean {
  const gBrowser = (globalThis as unknown as { browser?: { sidebarAction?: { open?: unknown } } }).browser;
  if (typeof gBrowser?.sidebarAction?.open === 'function') {
    return true;
  }
  if (typeof chrome !== 'undefined' && typeof (chrome as unknown as { sidebarAction?: { open?: unknown } }).sidebarAction?.open === 'function') {
    return true;
  }
  return false;
}

/**
 * Safely retrieves the universal Browser API instance.
 * Reconciles native Firefox browser.*, Chromium chrome.*, and webextension-polyfill.
 */
export function getBrowser(): Browser | null {
  if (cachedPolyfill) {
    return cachedPolyfill;
  }

  // 1. If native Firefox browser API exists and has runtime
  if (typeof (globalThis as unknown as { browser?: Browser }).browser?.runtime?.id !== 'undefined') {
    cachedPolyfill = (globalThis as unknown as { browser: Browser }).browser;
    return cachedPolyfill;
  }

  // 2. If in extension environment, lazily load webextension-polyfill
  if (isExtensionContext()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const p = require('webextension-polyfill');
      cachedPolyfill = (p.default || p) as Browser;
      return cachedPolyfill;
    } catch {
      // Polyfill require unavailable, continue to fallbacks
    }
  }

  // 3. Fallback wrapper around globalThis.chrome for tests or environments without polyfill
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return chrome as unknown as Browser;
  }

  return null;
}

/**
 * Helper to dispatch runtime messages universally across browser implementations.
 */
export async function sendUniversalMessage<T = unknown, R = unknown>(message: T): Promise<R> {
  const b = getBrowser();
  if (b?.runtime?.sendMessage) {
    try {
      return await b.runtime.sendMessage(message);
    } catch {
      // Fall through to callback-style chrome.runtime
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    return new Promise<R>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: R) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(response);
      });
    });
  }

  throw new Error('[BrowserAdapter] Runtime messaging is not available in current environment');
}

/**
 * Helper to establish a persistent runtime port universally across Chrome and Firefox.
 */
export function connectUniversalPort(name: string): chrome.runtime.Port | null {
  const b = getBrowser();
  if (b?.runtime?.connect) {
    try {
      return b.runtime.connect({ name }) as unknown as chrome.runtime.Port;
    } catch {
      // Fall through to callback-style / direct chrome.runtime
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
    try {
      return chrome.runtime.connect({ name });
    } catch {
      // Port connection unavailable
    }
  }

  return null;
}

export type { ISidebarController, SidebarOpenOptions } from './sidebar_adapter';


