// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BadgeOverlay } from '@/content/overlay';
import { DOMScanner } from '@/content/scanner';

describe('Zero-Interference Numbered Badge & Highlighter Overlay (Task 3.2)', () => {
  beforeEach(() => {
    BadgeOverlay.destroy();
    DOMScanner.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    BadgeOverlay.destroy();
    DOMScanner.clear();
    document.body.innerHTML = '';
  });

  it('injects overlay host with Shadow DOM container to prevent style interference', () => {
    const root = BadgeOverlay.ensureContainer();

    expect(root).not.toBeNull();
    expect(root.id).toBe('madadgar-overlay-root');

    const host = document.getElementById('madadgar-overlay-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    expect(host?.getAttribute('data-madadgar-overlay')).toBe('true');
  });

  it('renders numbered badges anchored to interactive elements inside Shadow DOM', () => {
    document.body.innerHTML = `
      <button id="btn1">Button 1</button>
      <button id="btn2">Button 2</button>
    `;

    // Mock bounding client rects
    const btn1 = document.getElementById('btn1') as HTMLElement;
    const btn2 = document.getElementById('btn2') as HTMLElement;

    btn1.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      width: 120,
      height: 40,
      bottom: 140,
      right: 170,
      x: 50,
      y: 100,
      toJSON: () => {},
    });

    btn2.getBoundingClientRect = () => ({
      top: 200,
      left: 50,
      width: 120,
      height: 40,
      bottom: 240,
      right: 170,
      x: 50,
      y: 200,
      toJSON: () => {},
    });

    const elements = DOMScanner.scan(document);
    expect(elements).toHaveLength(2);

    BadgeOverlay.renderBadges(elements);

    const host = document.getElementById('madadgar-overlay-host');
    const shadowRoot = host?.shadowRoot;
    const badges = shadowRoot?.querySelectorAll('.madadgar-badge');

    expect(badges).toHaveLength(2);
    expect(badges?.[0].textContent).toBe('[1]');
    expect(badges?.[1].textContent).toBe('[2]');

    // Check anchored coordinates
    expect((badges?.[0] as HTMLElement).style.top).toBe('100px');
    expect((badges?.[0] as HTMLElement).style.left).toBe('50px');
    expect((badges?.[1] as HTMLElement).style.top).toBe('200px');
    expect((badges?.[1] as HTMLElement).style.left).toBe('50px');
  });

  it('renders proposed action highlight box (emerald green) around target element', () => {
    document.body.innerHTML = `
      <button id="target-btn">Target Action</button>
    `;

    const btn = document.getElementById('target-btn') as HTMLElement;
    btn.getBoundingClientRect = () => ({
      top: 150,
      left: 80,
      width: 140,
      height: 45,
      bottom: 195,
      right: 220,
      x: 80,
      y: 150,
      toJSON: () => {},
    });

    const elements = DOMScanner.scan(document);
    BadgeOverlay.renderBadges(elements);

    const success = BadgeOverlay.highlightTarget(1, 'proposed', false);
    expect(success).toBe(true);

    const host = document.getElementById('madadgar-overlay-host');
    const shadowRoot = host?.shadowRoot;
    const highlight = shadowRoot?.querySelector('.madadgar-highlight-proposed') as HTMLElement;

    expect(highlight).not.toBeNull();
    expect(highlight.style.top).toBe('150px');
    expect(highlight.style.left).toBe('80px');
    expect(highlight.style.width).toBe('140px');
    expect(highlight.style.height).toBe('45px');

    // Badge should receive active class
    const badge = shadowRoot?.querySelector('.madadgar-badge') as HTMLElement;
    expect(badge.classList.contains('active-target')).toBe(true);
  });

  it('renders dry-run inspection highlight box (amber dashed)', () => {
    document.body.innerHTML = `
      <button id="dry-btn">Dry Run Target</button>
    `;

    const btn = document.getElementById('dry-btn') as HTMLElement;
    btn.getBoundingClientRect = () => ({
      top: 220,
      left: 60,
      width: 100,
      height: 35,
      bottom: 255,
      right: 160,
      x: 60,
      y: 220,
      toJSON: () => {},
    });

    const elements = DOMScanner.scan(document);
    BadgeOverlay.renderBadges(elements);

    BadgeOverlay.highlightTarget(1, 'dry-run', false);

    const host = document.getElementById('madadgar-overlay-host');
    const shadowRoot = host?.shadowRoot;
    const highlight = shadowRoot?.querySelector('.madadgar-highlight-dry-run') as HTMLElement;

    expect(highlight).not.toBeNull();
    expect(highlight.style.top).toBe('220px');

    const badge = shadowRoot?.querySelector('.madadgar-badge') as HTMLElement;
    expect(badge.classList.contains('active-dry-run')).toBe(true);
  });

  it('clears badges and highlights on clearBadges', () => {
    document.body.innerHTML = `
      <button id="btn1">Button</button>
    `;
    const btn = document.getElementById('btn1') as HTMLElement;
    btn.getBoundingClientRect = () => ({
      top: 10,
      left: 10,
      width: 50,
      height: 20,
      bottom: 30,
      right: 60,
      x: 10,
      y: 10,
      toJSON: () => {},
    });

    const elements = DOMScanner.scan(document);
    BadgeOverlay.renderBadges(elements);
    BadgeOverlay.highlightTarget(1, 'proposed', false);

    BadgeOverlay.clearBadges();

    const host = document.getElementById('madadgar-overlay-host');
    const shadowRoot = host?.shadowRoot;
    const badges = shadowRoot?.querySelectorAll('.madadgar-badge');
    const highlight = shadowRoot?.querySelector('.madadgar-highlight-proposed');

    expect(badges?.length).toBe(0);
    expect(highlight).toBeNull();
  });
});
