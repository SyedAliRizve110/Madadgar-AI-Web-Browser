// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleContentScriptMessage, DOMScanner, BadgeOverlay } from '@/content/index';

describe('Content Script Action Message Handlers (Task 3.1 & 3.2)', () => {
  beforeEach(() => {
    BadgeOverlay.destroy();
    DOMScanner.clear();
    document.body.innerHTML = '';
  });

  it('handles SCAN_INTERACTIVE_DOM and returns scanned elements with badges rendered', () => {
    document.body.innerHTML = `
      <form>
        <label for="username">Username</label>
        <input id="username" type="text" value="john_doe" />
        <button type="submit">Log In</button>
      </form>
    `;

    const sendResponseSpy = vi.fn();
    const isAsync = handleContentScriptMessage(
      { type: 'SCAN_INTERACTIVE_DOM', renderBadges: true },
      {} as chrome.runtime.MessageSender,
      sendResponseSpy
    );

    expect(isAsync).toBe(true);
    expect(sendResponseSpy).toHaveBeenCalledTimes(1);

    const response = sendResponseSpy.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.count).toBe(2);
    expect(response.elements).toHaveLength(2);
    expect(response.elements[0].label).toBe('Username');
    expect(response.elements[1].label).toBe('Log In');

    // Confirm badges rendered in Shadow DOM
    const host = document.getElementById('madadgar-overlay-host');
    const badges = host?.shadowRoot?.querySelectorAll('.madadgar-badge');
    expect(badges?.length).toBe(2);
  });

  it('handles HIGHLIGHT_ELEMENT for proposed and dry-run modes', () => {
    document.body.innerHTML = `
      <button id="cta-btn">Register Today</button>
    `;

    // Scan first
    DOMScanner.scan(document);

    const sendResponseSpy = vi.fn();
    handleContentScriptMessage(
      { type: 'HIGHLIGHT_ELEMENT', targetId: 1, mode: 'proposed', scrollIntoView: false },
      {} as chrome.runtime.MessageSender,
      sendResponseSpy
    );

    expect(sendResponseSpy).toHaveBeenCalledWith({ success: true });

    const host = document.getElementById('madadgar-overlay-host');
    const highlight = host?.shadowRoot?.querySelector('.madadgar-highlight-proposed');
    expect(highlight).not.toBeNull();
  });

  it('handles CLEAR_BADGES and clears both overlay and scanner registry', () => {
    document.body.innerHTML = `
      <button id="sample-btn">Sample</button>
    `;

    DOMScanner.scan(document);
    BadgeOverlay.renderBadges(DOMScanner.getLastScannedElements());

    const sendResponseSpy = vi.fn();
    handleContentScriptMessage(
      { type: 'CLEAR_BADGES' },
      {} as chrome.runtime.MessageSender,
      sendResponseSpy
    );

    expect(sendResponseSpy).toHaveBeenCalledWith({ success: true });
    expect(DOMScanner.getLastScannedElements()).toHaveLength(0);
    expect(DOMScanner.getElementById(1)).toBeNull();
  });
});
