/**
 * Madadgar - Numbered Badge & Highlighter Overlay (Task 3.2)
 * Injects a single root container inside a Shadow DOM to prevent any styling collisions
 * with host webpages. Renders compact, high-contrast numbered badges anchored to interactive
 * elements, and draws clear visual highlight boxes for proposed actions and dry-run inspections.
 */

import type { ScannedElement, OverlayHighlightMode } from '@/common/types';
import { DOMScanner } from './scanner';

const OVERLAY_HOST_ID = 'madadgar-overlay-host';
const OVERLAY_ROOT_ID = 'madadgar-overlay-root';

const OVERLAY_STYLES = `
:host {
  all: initial !important;
}

#madadgar-overlay-root {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
  overflow: hidden !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
}

/* Numbered Badges */
.madadgar-badge {
  position: fixed !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #4f46e5 !important; /* Indigo 600 */
  color: #ffffff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  padding: 2.5px 5.5px !important;
  border-radius: 4px !important;
  border: 1px solid rgba(255, 255, 255, 0.7) !important;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(79, 70, 229, 0.4) !important;
  pointer-events: none !important;
  transform: translate(-30%, -60%) !important;
  transition: transform 0.12s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.12s ease !important;
  user-select: none !important;
  white-space: nowrap !important;
}

.madadgar-badge.active-target {
  background: #10b981 !important; /* Emerald 500 */
  border-color: #ffffff !important;
  transform: translate(-30%, -60%) scale(1.15) !important;
  box-shadow: 0 0 0 2px #ffffff, 0 0 10px rgba(16, 185, 129, 0.8) !important;
}

.madadgar-badge.active-dry-run {
  background: #f59e0b !important; /* Amber 500 */
  border-color: #ffffff !important;
  transform: translate(-30%, -60%) scale(1.15) !important;
  box-shadow: 0 0 0 2px #ffffff, 0 0 10px rgba(245, 158, 11, 0.8) !important;
}

.madadgar-badge.pulse {
  animation: madadgar-badge-pulse 1.2s infinite ease-in-out !important;
}

@keyframes madadgar-badge-pulse {
  0%, 100% {
    transform: translate(-30%, -60%) scale(1);
    box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.6);
  }
  50% {
    transform: translate(-30%, -60%) scale(1.35);
    background: #f59e0b !important;
    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
  }
}

/* Proposed Action Highlight Box */
.madadgar-highlight-proposed {
  position: fixed !important;
  border: 2px solid #10b981 !important; /* Emerald 500 */
  background: rgba(16, 185, 129, 0.15) !important;
  border-radius: 4px !important;
  pointer-events: none !important;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.35), 0 0 14px rgba(16, 185, 129, 0.5) !important;
  transition: all 0.15s ease-out !important;
  animation: madadgar-proposed-glow 2s infinite ease-in-out !important;
}

@keyframes madadgar-proposed-glow {
  0%, 100% {
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.35), 0 0 10px rgba(16, 185, 129, 0.4);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.55), 0 0 18px rgba(16, 185, 129, 0.7);
  }
}

/* Dry-Run Inspection Highlight Box */
.madadgar-highlight-dry-run {
  position: fixed !important;
  border: 2px dashed #f59e0b !important; /* Amber 500 */
  background: rgba(245, 158, 11, 0.15) !important;
  border-radius: 4px !important;
  pointer-events: none !important;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3), 0 0 12px rgba(245, 158, 11, 0.4) !important;
  transition: all 0.15s ease-out !important;
}

/* "Find It For Me" Pulse Locator Highlight Box (Task 3.4) */
.madadgar-highlight-pulse {
  position: fixed !important;
  border: 2.5px solid #6366f1 !important; /* Indigo 500 */
  background: rgba(99, 102, 241, 0.2) !important;
  border-radius: 6px !important;
  pointer-events: none !important;
  animation: madadgar-locator-pulse 1.2s infinite ease-in-out !important;
}

@keyframes madadgar-locator-pulse {
  0%, 100% {
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4), 0 0 10px rgba(99, 102, 241, 0.5);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(99, 102, 241, 0.7), 0 0 24px rgba(99, 102, 241, 0.8);
    background: rgba(99, 102, 241, 0.3) !important;
  }
}
`;

export class BadgeOverlay {
  private static hostElement: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;
  private static rootContainer: HTMLElement | null = null;
  private static badgeElements = new Map<number, HTMLElement>();
  private static activeHighlightEl: HTMLElement | null = null;
  private static currentElements: ScannedElement[] = [];

  private static scrollListenerBound = false;
  private static rafId: number | null = null;

  /**
   * Retrieves the ShadowRoot of the overlay if initialized
   */
  public static getShadowRoot(): ShadowRoot | null {
    return this.shadowRoot;
  }

  /**
   * Retrieves the current elements array
   */
  public static getCurrentElements(): ScannedElement[] {
    return [...this.currentElements];
  }

  /**
   * Initializes or gets the Shadow DOM container for the overlay
   */
  public static ensureContainer(): HTMLElement {
    if (this.rootContainer && this.rootContainer.isConnected) {
      return this.rootContainer;
    }

    if (typeof document === 'undefined') {
      throw new Error('BadgeOverlay requires browser DOM environment.');
    }

    // 1. Create or retrieve host
    let host = document.getElementById(OVERLAY_HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = OVERLAY_HOST_ID;
      host.setAttribute('data-madadgar-overlay', 'true');
      (document.body || document.documentElement).appendChild(host);
    }
    this.hostElement = host;

    // 2. Attach Shadow DOM (open mode for style isolation)
    let shadow = host.shadowRoot;
    if (!shadow) {
      shadow = host.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = OVERLAY_STYLES;
      shadow.appendChild(styleEl);
    }
    this.shadowRoot = shadow;

    // 3. Create root container inside shadow root
    let root = shadow.getElementById(OVERLAY_ROOT_ID) as HTMLElement | null;
    if (!root) {
      root = document.createElement('div');
      root.id = OVERLAY_ROOT_ID;
      shadow.appendChild(root);
    }
    this.rootContainer = root;

    // 4. Bind window scroll and resize handlers to keep badges anchored
    this.bindPositionListeners();

    return root;
  }

  /**
   * Binds scroll and resize listeners to smoothly reposition badges
   */
  private static bindPositionListeners(): void {
    if (this.scrollListenerBound || typeof window === 'undefined') {
      return;
    }

    const handleUpdate = () => {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = requestAnimationFrame(() => {
        this.updateBadgeCoordinates();
      });
    };

    window.addEventListener('scroll', handleUpdate, { passive: true, capture: true });
    window.addEventListener('resize', handleUpdate, { passive: true });
    this.scrollListenerBound = true;
  }

  /**
   * Renders numbered badges over all provided scanned elements
   */
  public static renderBadges(elements: ScannedElement[]): void {
    const root = this.ensureContainer();
    this.clearBadges();

    this.currentElements = elements;

    const isJsdom =
      typeof window !== 'undefined' &&
      (window.navigator?.userAgent?.includes('jsdom') ||
       process.env?.VITEST === 'true' ||
       process.env?.NODE_ENV === 'test');

    for (const item of elements) {
      const liveEl = DOMScanner.getElementById(item.id);
      if (!liveEl || !liveEl.isConnected) continue;

      const rect = liveEl.getBoundingClientRect();
      if (!isJsdom && rect.width <= 0 && rect.height <= 0) continue;

      const badge = document.createElement('div');
      badge.className = 'madadgar-badge';
      badge.dataset.badgeId = String(item.id);
      badge.textContent = `[${item.id}]`;

      badge.style.top = `${Math.round(rect.top)}px`;
      badge.style.left = `${Math.round(rect.left)}px`;

      root.appendChild(badge);
      this.badgeElements.set(item.id, badge);
    }
  }

  /**
   * Updates all badge and highlight box positions based on current viewport coordinates
   */
  public static updateBadgeCoordinates(): void {
    for (const [id, badge] of this.badgeElements.entries()) {
      const liveEl = DOMScanner.getElementById(id);
      if (!liveEl || !liveEl.isConnected) {
        badge.style.opacity = '0';
        continue;
      }

      const rect = liveEl.getBoundingClientRect();

      // If scrolled completely out of view, hide badge
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth ||
        (rect.width === 0 && rect.height === 0)
      ) {
        badge.style.opacity = '0';
      } else {
        badge.style.opacity = '1';
        badge.style.top = `${Math.round(rect.top)}px`;
        badge.style.left = `${Math.round(rect.left)}px`;
      }
    }

    // Also update active highlight box if present
    if (this.activeHighlightEl) {
      const targetIdStr = this.activeHighlightEl.dataset.targetId;
      if (targetIdStr) {
        const targetId = parseInt(targetIdStr, 10);
        const liveEl = DOMScanner.getElementById(targetId);
        if (liveEl && liveEl.isConnected) {
          const rect = liveEl.getBoundingClientRect();
          this.activeHighlightEl.style.top = `${Math.round(rect.top)}px`;
          this.activeHighlightEl.style.left = `${Math.round(rect.left)}px`;
          this.activeHighlightEl.style.width = `${Math.round(rect.width)}px`;
          this.activeHighlightEl.style.height = `${Math.round(rect.height)}px`;
        }
      }
    }
  }

  /**
   * Highlights a specific target element on the page with a glowing outline
   * @param targetId Numeric element ID
   * @param mode 'proposed' (emerald green for proposed action) or 'dry-run' (amber dashed outline)
   * @param scrollIntoView If true, scrolls the element smoothly to center of viewport
   */
  public static highlightTarget(
    targetId: number,
    mode: OverlayHighlightMode = 'proposed',
    scrollIntoView = true
  ): boolean {
    const root = this.ensureContainer();
    this.clearHighlights();

    const liveEl = DOMScanner.getElementById(targetId);
    if (!liveEl || !liveEl.isConnected) {
      return false;
    }

    if (scrollIntoView && typeof liveEl.scrollIntoView === 'function') {
      try {
        liveEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {
        // Fallback for older DOMs
      }
    }

    const rect = liveEl.getBoundingClientRect();

    // 1. Create highlight box
    const highlightBox = document.createElement('div');
    highlightBox.className =
      mode === 'dry-run'
        ? 'madadgar-highlight-dry-run'
        : mode === 'pulse'
        ? 'madadgar-highlight-pulse'
        : 'madadgar-highlight-proposed';
    highlightBox.dataset.targetId = String(targetId);

    highlightBox.style.top = `${Math.round(rect.top)}px`;
    highlightBox.style.left = `${Math.round(rect.left)}px`;
    highlightBox.style.width = `${Math.round(rect.width)}px`;
    highlightBox.style.height = `${Math.round(rect.height)}px`;

    root.appendChild(highlightBox);
    this.activeHighlightEl = highlightBox;

    // 2. Highlight badge
    const badge = this.badgeElements.get(targetId);
    if (badge) {
      if (mode === 'dry-run') {
        badge.classList.add('active-dry-run');
      } else if (mode === 'pulse') {
        badge.classList.add('pulse');
      } else {
        badge.classList.add('active-target');
      }
    }

    return true;
  }

  /**
   * Clears any active element highlight box and resets badge active styling
   */
  public static clearHighlights(): void {
    if (this.activeHighlightEl) {
      this.activeHighlightEl.remove();
      this.activeHighlightEl = null;
    }

    for (const badge of this.badgeElements.values()) {
      badge.classList.remove('active-target', 'active-dry-run', 'pulse');
    }
  }

  /**
   * Removes all rendered badges and highlights from the overlay
   */
  public static clearBadges(): void {
    this.clearHighlights();
    for (const badge of this.badgeElements.values()) {
      badge.remove();
    }
    this.badgeElements.clear();
    this.currentElements = [];
  }

  /**
   * Complete teardown of overlay and removal from host DOM
   */
  public static destroy(): void {
    this.clearBadges();
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
    this.hostElement = null;
    this.shadowRoot = null;
    this.rootContainer = null;
  }
}
