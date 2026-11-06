/**
 * Madadgar - Content Script Guardrails Enforcement (Task 4.4)
 * Enforces client-side boundary checks on active webpage tabs:
 * - Domain Blacklist Enforcement
 * - Sensitive Field Interception
 * - Overlay Removal & Emergency Kill Switch cleanup
 */

import { isBlacklistedDomain, SAFETY_BLOCKED_DOMAIN_MESSAGE } from '@/safety/domain_rules';
import { validateFieldActionSafety } from '@/safety/field_sanitizer';
import { BadgeOverlay } from './overlay';

export class ContentGuardrails {
  private static bannerHostId = 'madadgar-safety-banner-host';

  /**
   * Verifies if the current active tab is safe to scan and interact with.
   * If blacklisted, strips overlays and displays security banner.
   */
  public static checkActivePageSafety(): { safe: boolean; reason?: string } {
    if (typeof window === 'undefined') return { safe: true };

    const url = window.location.href;
    if (isBlacklistedDomain(url)) {
      // Strip badges and outlines immediately
      BadgeOverlay.clearBadges();
      this.renderSafetyBanner(SAFETY_BLOCKED_DOMAIN_MESSAGE);

      return {
        safe: false,
        reason: SAFETY_BLOCKED_DOMAIN_MESSAGE,
      };
    }

    // Remove any previously rendered safety banner if page is safe
    this.removeSafetyBanner();
    return { safe: true };
  }

  /**
   * Validates target element before synthetic execution in content script.
   */
  public static validateElementExecution(
    targetEl: HTMLElement,
    actionType: string
  ): { safe: boolean; error?: string } {
    const safety = validateFieldActionSafety(targetEl, actionType);
    if (!safety.safe) {
      return {
        safe: false,
        error: safety.reason || 'Blocked by credential safety guardrail.',
      };
    }
    return { safe: true };
  }

  /**
   * Emergency Kill Switch cleanup at the content script level:
   * Clears badges, highlights, safety banners, and resets state.
   */
  public static emergencyTeardown(): void {
    BadgeOverlay.clearBadges();
    this.removeSafetyBanner();
  }

  /**
   * Renders a zero-interference safety alert banner inside a closed Shadow DOM
   */
  private static renderSafetyBanner(message: string): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(this.bannerHostId)) return;

    try {
      const host = document.createElement('div');
      host.id = this.bannerHostId;
      host.style.position = 'fixed';
      host.style.top = '12px';
      host.style.left = '50%';
      host.style.transform = 'translateX(-50%)';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'none';

      const shadow = host.attachShadow({ mode: 'closed' });

      const banner = document.createElement('div');
      banner.setAttribute('data-madadgar-safety-banner', 'true');
      banner.style.cssText = `
        background-color: #fef2f2;
        border: 1px solid #f87171;
        color: #991b1b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        padding: 8px 14px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: auto;
      `;

      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>${message}</span>
      `;

      shadow.appendChild(banner);
      document.body.appendChild(host);
    } catch (e) {
      console.warn('[Madadgar] Could not mount safety banner:', e);
    }
  }

  /**
   * Removes safety alert banner
   */
  private static removeSafetyBanner(): void {
    if (typeof document === 'undefined') return;
    const hosts = document.querySelectorAll(`#${this.bannerHostId}`);
    hosts.forEach((h) => {
      if (h.parentNode) {
        h.parentNode.removeChild(h);
      } else {
        h.remove();
      }
    });
  }
}
