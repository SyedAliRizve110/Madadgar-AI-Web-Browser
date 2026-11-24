// @vitest-environment jsdom
/**
 * Continuous Voice Navigation Directives & Fast-Path Grammar Tests (Task 6.3)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IntentRouter } from '@/voice/intent_router';
import { ActionExecutor } from '@/content/executor';
import { DOMScanner } from '@/content/scanner';

describe('Continuous Voice Navigation Directives (Task 6.3)', () => {
  describe('IntentRouter Fast-Path Grammar Parsing', () => {
    it('parses directional scroll commands', () => {
      const intentDown = IntentRouter.parse('scroll down');
      expect(intentDown.type).toBe('NAVIGATE_SCROLL');
      expect(intentDown.scrollDirection).toBe('down');

      const intentUp = IntentRouter.parse('scroll up');
      expect(intentUp.type).toBe('NAVIGATE_SCROLL');
      expect(intentUp.scrollDirection).toBe('up');

      const intentBottom = IntentRouter.parse('scroll to bottom');
      expect(intentBottom.type).toBe('NAVIGATE_SCROLL');
      expect(intentBottom.scrollDirection).toBe('bottom');

      const intentTop = IntentRouter.parse('scroll to top');
      expect(intentTop.type).toBe('NAVIGATE_SCROLL');
      expect(intentTop.scrollDirection).toBe('top');

      const intentHalfDown = IntentRouter.parse('half page down');
      expect(intentHalfDown.type).toBe('NAVIGATE_SCROLL');
      expect(intentHalfDown.scrollDirection).toBe('half_down');

      const intentHalfUp = IntentRouter.parse('half page up');
      expect(intentHalfUp.type).toBe('NAVIGATE_SCROLL');
      expect(intentHalfUp.scrollDirection).toBe('half_up');
    });

    it('parses numeric badge clicks directly without LLM planning', () => {
      const intent1 = IntentRouter.parse('click number 4');
      expect(intent1.type).toBe('CLICK_BADGE');
      expect(intent1.badgeNumber).toBe(4);

      const intent2 = IntentRouter.parse('click badge 7');
      expect(intent2.type).toBe('CLICK_BADGE');
      expect(intent2.badgeNumber).toBe(7);

      const intent3 = IntentRouter.parse('click 15');
      expect(intent3.type).toBe('CLICK_BADGE');
      expect(intent3.badgeNumber).toBe(15);
    });

    it('parses element text clicks', () => {
      const intentSubmit = IntentRouter.parse('click on Submit');
      expect(intentSubmit.type).toBe('CLICK_ELEMENT_TEXT');
      expect(intentSubmit.targetText).toBe('submit');

      const intentSearch = IntentRouter.parse('click Search');
      expect(intentSearch.type).toBe('CLICK_ELEMENT_TEXT');
      expect(intentSearch.targetText).toBe('search');
    });

    it('parses browser tab navigation directives', () => {
      const intentBack = IntentRouter.parse('go back');
      expect(intentBack.type).toBe('BROWSER_NAVIGATION');
      expect(intentBack.browserNav).toBe('back');

      const intentForward = IntentRouter.parse('go forward');
      expect(intentForward.type).toBe('BROWSER_NAVIGATION');
      expect(intentForward.browserNav).toBe('forward');

      const intentReload = IntentRouter.parse('reload page');
      expect(intentReload.type).toBe('BROWSER_NAVIGATION');
      expect(intentReload.browserNav).toBe('reload');
    });

    it('parses task control commands', () => {
      expect(IntentRouter.parse('approve step').taskControl).toBe('approve');
      expect(IntentRouter.parse('yes proceed').taskControl).toBe('approve');
      expect(IntentRouter.parse('skip step').taskControl).toBe('skip');
      expect(IntentRouter.parse('cancel task').taskControl).toBe('cancel');
      expect(IntentRouter.parse('pause task').taskControl).toBe('pause');
      expect(IntentRouter.parse('resume task').taskControl).toBe('resume');
    });
  });

  describe('ActionExecutor Fast-Path Direct Execution', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="container">
          <button id="btn1">Submit Application</button>
          <a id="link1" href="#about">About Us</a>
        </div>
      `;
      DOMScanner.clear();
      DOMScanner.scan(document);
    });

    afterEach(() => {
      DOMScanner.clear();
    });

    it('executes direct badge click by numeric ID in DOMScanner', () => {
      const elements = DOMScanner.getLastScannedElements();
      const firstElement = elements[0];
      expect(firstElement).toBeDefined();

      const clickSuccess = ActionExecutor.executeBadgeClick(firstElement.id);
      expect(clickSuccess).toBe(true);
    });

    it('executes direct click matching element label text', () => {
      const clickSuccess = ActionExecutor.executeClickByText('Submit');
      expect(clickSuccess).toBe(true);
    });

    it('executes scroll directions including half page offsets without throwing', () => {
      expect(ActionExecutor.executeScroll(null, 'half_down')).toBe(true);
      expect(ActionExecutor.executeScroll(null, 'half_up')).toBe(true);
      expect(ActionExecutor.executeScroll(null, 'top')).toBe(true);
      expect(ActionExecutor.executeScroll(null, 'bottom')).toBe(true);
    });
  });
});
