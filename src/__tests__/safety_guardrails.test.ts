// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  BANKING_FINANCIAL_DOMAIN_PATTERNS,
  extractHostname,
  isBlacklistedDomain,
  validateDomainSafety,
  SAFETY_BLOCKED_DOMAIN_MESSAGE,
} from '@/safety/domain_rules';
import {
  isSensitiveField,
  validateFieldActionSafety,
  sanitizeElementValue,
} from '@/safety/field_sanitizer';
import {
  CONSEQUENTIAL_KEYWORDS,
  isConsequentialAction,
  validateActionProposal,
} from '@/safety/action_validator';
import { ContentGuardrails } from '@/content/guardrails';
import { AgentOrchestrator } from '@/background/agent_orchestrator';
import { ActionCard } from '@/sidepanel/components/ActionCard';
import { BadgeOverlay } from '@/content/overlay';
import type { AgentActionProposal, ScannedElement } from '@/common/types';

describe('Deterministic Code-Level Safety Guardrails (Task 4.4)', () => {
  // --------------------------------------------------------------------------
  // 4.4.1: Banking / UPI / Financial Domain Blacklist
  // --------------------------------------------------------------------------
  describe('4.4.1: Banking / UPI / Financial Domain Blacklist', () => {
    it('contains comprehensive patterns for Indian and international banks, UPI, and crypto', () => {
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS.length).toBeGreaterThan(30);
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('*.onlinesbi.com');
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('*.hdfcbank.com');
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('*paytm.com');
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('*razorpay.com');
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('*paypal.com');
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('*stripe.com');
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('*binance.com');
      expect(BANKING_FINANCIAL_DOMAIN_PATTERNS).toContain('login.gov');
    });

    it('correctly extracts normalized hostnames from diverse URL structures', () => {
      expect(extractHostname('https://www.onlinesbi.sbi/portal/login')).toBe('www.onlinesbi.sbi');
      expect(extractHostname('http://netbanking.hdfcbank.com:443/netbanking')).toBe('netbanking.hdfcbank.com');
      expect(extractHostname('paytm.com/recharge')).toBe('paytm.com');
      expect(extractHostname('')).toBe('');
    });

    it('identifies blacklisted financial domains using exact and wildcard matching', () => {
      const blockedUrls = [
        'https://retail.onlinesbi.sbi/retail/login.htm',
        'https://netbanking.hdfcbank.com/netbanking/',
        'https://infinity.icicibank.com/corp/AuthenticationController',
        'https://paytm.com/payment',
        'https://checkout.razorpay.com/v1/checkout.js',
        'https://checkout.stripe.com/c/pay/cs_live_123',
        'https://www.paypal.com/signin',
        'https://accounts.binance.com/en/login',
        'https://login.gov/auth',
        'https://eportal.incometax.gov.in/iec/foservices/',
      ];

      for (const url of blockedUrls) {
        expect(isBlacklistedDomain(url)).toBe(true);
        const safety = validateDomainSafety(url);
        expect(safety.safe).toBe(false);
        expect(safety.reason).toBe(SAFETY_BLOCKED_DOMAIN_MESSAGE);
      }
    });

    it('strictly prohibits browser internal (chrome://) and extension URLs', () => {
      const internalUrls = [
        'chrome://settings/',
        'chrome://extensions/',
        'chrome-extension://abcdefghijklmnopqrstuvwxyz/options.html',
      ];

      for (const url of internalUrls) {
        const safety = validateDomainSafety(url);
        expect(safety.safe).toBe(false);
        expect(safety.reason).toContain('prohibited on browser internal');
      }
    });

    it('allows safe, educational, and general web domains to execute normally', () => {
      const safeUrls = [
        'https://en.wikipedia.org/wiki/Computer_science',
        'https://github.com/google/gemini',
        'https://news.ycombinator.com/',
        'https://bbc.com/news',
        'https://docs.python.org/3/',
      ];

      for (const url of safeUrls) {
        expect(isBlacklistedDomain(url)).toBe(false);
        const safety = validateDomainSafety(url);
        expect(safety.safe).toBe(true);
        expect(safety.reason).toBeUndefined();
      }
    });

    it('ContentGuardrails strips overlays and renders safety banner when on blacklisted domain', () => {
      const clearSpy = vi.spyOn(BadgeOverlay, 'clearBadges');
      const originalLocation = window.location.href;

      // Mock window.location to a blacklisted domain
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: 'https://retail.onlinesbi.sbi/retail/login.htm' },
      });

      const safetyResult = ContentGuardrails.checkActivePageSafety();

      expect(safetyResult.safe).toBe(false);
      expect(safetyResult.reason).toBe(SAFETY_BLOCKED_DOMAIN_MESSAGE);
      expect(clearSpy).toHaveBeenCalled();

      // Check shadow DOM safety banner was appended to document
      const host = document.getElementById('madadgar-safety-banner-host');
      expect(host).not.toBeNull();

      // Restore original location
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: originalLocation },
      });
      clearSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // 4.4.2: Sensitive Field & Credential Shield
  // --------------------------------------------------------------------------
  describe('4.4.2: Sensitive Field & Credential Shield', () => {
    it('blocks elements with type="password" directly', () => {
      const input = document.createElement('input');
      input.type = 'password';

      expect(isSensitiveField(input)).toBe(true);
      const actionSafety = validateFieldActionSafety(input, 'type');
      expect(actionSafety.safe).toBe(false);
      expect(actionSafety.reason).toContain('strictly prohibited');
    });

    it('blocks fields with sensitive autocomplete values (cc-number, cvv, pin, otp)', () => {
      const sensitiveAutocompletes = [
        'cc-number',
        'cc-csc',
        'current-password',
        'new-password',
        'one-time-code',
        'pin',
      ];

      for (const auto of sensitiveAutocompletes) {
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('autocomplete', auto);

        expect(isSensitiveField(input)).toBe(true);
        const safety = validateFieldActionSafety(input, 'type');
        expect(safety.safe).toBe(false);
      }
    });

    it('blocks fields matching sensitive names, IDs, placeholders, or aria-labels', () => {
      const sensitiveAttrs = [
        { name: 'user_pin' },
        { id: 'enter-otp-input' },
        { placeholder: 'Enter 6-digit OTP' },
        { 'aria-label': 'Card CVV / CVC' },
        { name: 'pan_card_number' },
      ];

      for (const attr of sensitiveAttrs) {
        const input = document.createElement('input');
        input.type = 'text';
        for (const [key, val] of Object.entries(attr)) {
          input.setAttribute(key, val);
        }

        expect(isSensitiveField(input)).toBe(true);
        expect(validateFieldActionSafety(input, 'type').safe).toBe(false);
      }
    });

    it('allows benign input fields (e.g., name, email, query, address)', () => {
      const safeInputs = [
        { type: 'text', name: 'first_name', placeholder: 'Enter your first name' },
        { type: 'email', name: 'user_email', placeholder: 'email@example.com' },
        { type: 'text', name: 'search_query', placeholder: 'Search articles...' },
        { type: 'text', name: 'university_name', placeholder: 'College / Institute' },
      ];

      for (const attrs of safeInputs) {
        const input = document.createElement('input');
        for (const [key, val] of Object.entries(attrs)) {
          input.setAttribute(key, val);
        }

        expect(isSensitiveField(input)).toBe(false);
        expect(validateFieldActionSafety(input, 'type').safe).toBe(true);
      }
    });

    it('sanitizes and masks protected values when detected', () => {
      const passEl = document.createElement('input');
      passEl.type = 'password';
      passEl.value = 'SuperSecret123!';

      expect(sanitizeElementValue(passEl, passEl.value)).toBe('••••••••');

      const normalEl = document.createElement('input');
      normalEl.type = 'text';
      normalEl.value = 'Alice Smith';
      expect(sanitizeElementValue(normalEl, normalEl.value)).toBe('Alice Smith');
    });

    it('ContentGuardrails.validateElementExecution blocks synthetic dispatch on sensitive fields', () => {
      const otpInput = document.createElement('input');
      otpInput.setAttribute('name', 'otp_code');

      const check = ContentGuardrails.validateElementExecution(otpInput, 'type');
      expect(check.safe).toBe(false);
      expect(check.error).toContain('strictly prohibited');
    });
  });

  // --------------------------------------------------------------------------
  // 4.4.3: Consequential Action Interceptor Gate
  // --------------------------------------------------------------------------
  describe('4.4.3: Consequential Action Interceptor Gate', () => {
    it('detects consequential keywords in action reasons, buttons, and elements', () => {
      const consequentialLabels = [
        'Submit Application',
        'Pay Now',
        'Transfer Funds',
        'Delete Account',
        'Confirm Order',
        'Send Email',
        'Place Order',
        'Buy Now',
        'Authorize Payment',
      ];

      for (const label of consequentialLabels) {
        expect(CONSEQUENTIAL_KEYWORDS.test(label)).toBe(true);

        const button = document.createElement('button');
        button.textContent = label;

        const proposal: AgentActionProposal = {
          action: 'click',
          target_id: 10,
          reason: `Clicking ${label}`,
        };

        expect(isConsequentialAction(proposal, button)).toBe(true);
      }
    });

    it('does not flag benign non-destructive actions as consequential', () => {
      const benignLabels = [
        'Next',
        'Previous',
        'Read More',
        'Search',
        'Filter Results',
        'Close Preview',
        'Add Skill',
      ];

      for (const label of benignLabels) {
        const button = document.createElement('button');
        button.textContent = label;

        const proposal: AgentActionProposal = {
          action: 'click',
          target_id: 1,
          reason: `Clicking ${label}`,
        };

        expect(isConsequentialAction(proposal, button)).toBe(false);
      }
    });

    it('validateActionProposal flags consequential proposals and enforces elevated confirmation', () => {
      const elements: ScannedElement[] = [
        {
          id: 12,
          tag: 'button',
          text: 'Confirm Order & Pay',
          label: 'Confirm Order & Pay',
          rect: { top: 0, left: 0, width: 100, height: 40, bottom: 40, right: 100 },
        },
      ];

      const proposal: AgentActionProposal = {
        action: 'click',
        target_id: 12,
        reason: 'Finalizing purchase',
      };

      const result = validateActionProposal(proposal, elements, 'https://store.example.com');
      expect(result.safe).toBe(true);
      expect(result.isConsequential).toBe(true);
      expect(result.requiresDoubleConfirmation).toBe(true);
    });

    it('ActionCard displays elevated confirmation requirements when proposal is consequential', () => {
      const consequentialProposal: AgentActionProposal = {
        action: 'click',
        target_id: 15,
        reason: 'Submit final payment',
        is_consequential: true,
      };

      const html = renderToString(
        React.createElement(ActionCard, {
          step: 4,
          maxSteps: 10,
          proposal: consequentialProposal,
          onApprove: vi.fn(),
          onSkip: vi.fn(),
          onStop: vi.fn(),
        })
      );

      // Verify elevated double-confirmation alert is rendered
      expect(html).toContain('Consequential Action Warning');
      expect(html).toContain('Review &amp; Approve');
      expect(html).toContain('Elevated confirmation required');
    });
  });

  // --------------------------------------------------------------------------
  // 4.4.4: Immediate Emergency Kill Switch
  // --------------------------------------------------------------------------
  describe('4.4.4: Immediate Emergency Kill Switch', () => {
    let mockStorage: Record<string, any> = {};

    beforeEach(() => {
      mockStorage = {};
      globalThis.chrome = {
        storage: {
          local: {
            get: vi.fn((keys: string[], cb?: (res: any) => void) => {
              const res: Record<string, any> = {};
              for (const k of keys) {
                if (mockStorage[k] !== undefined) res[k] = mockStorage[k];
              }
              if (cb) cb(res);
              return Promise.resolve(res);
            }),
            set: vi.fn((items: Record<string, any>, cb?: () => void) => {
              Object.assign(mockStorage, items);
              if (cb) cb();
              return Promise.resolve();
            }),
            remove: vi.fn((keys: string[], cb?: () => void) => {
              for (const k of keys) delete mockStorage[k];
              if (cb) cb();
              return Promise.resolve();
            }),
          },
        },
        tabs: {
          sendMessage: vi.fn((_tabId: number, _msg: any, cb?: (res: any) => void) => {
            if (cb) cb({ success: true });
            return Promise.resolve({ success: true });
          }),
        },
        runtime: {
          lastError: null,
        },
      } as any;
    });

    afterEach(async () => {
      await AgentOrchestrator.clearSession();
      ContentGuardrails.emergencyTeardown();
      document.body.innerHTML = '';
    });

    it('emergencyKillSwitch immediately resets FSM to IDLE within 100ms and deletes active session', async () => {
      // Start a mock task
      await AgentOrchestrator.startTask('Complete test errand', 101, {
        url: 'https://example.com/test',
      });

      expect(AgentOrchestrator.getStatus()).not.toBe('IDLE');

      const startTime = Date.now();
      await AgentOrchestrator.emergencyKillSwitch('User initiated emergency stop.');
      const elapsed = Date.now() - startTime;

      // Must complete within 100ms
      expect(elapsed).toBeLessThan(100);

      // FSM status returned to IDLE
      expect(AgentOrchestrator.getStatus()).toBe('IDLE');
      expect(AgentOrchestrator.getSession()).toBeNull();

      // Deletes active_task_session from storage
      expect(mockStorage['active_task_session']).toBeUndefined();

      // Sends EMERGENCY_KILL_SWITCH to tab
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ type: 'EMERGENCY_KILL_SWITCH' }),
        expect.any(Function)
      );
    });

    it('ContentGuardrails.emergencyTeardown completely purges overlays and safety banners', () => {
      const clearSpy = vi.spyOn(BadgeOverlay, 'clearBadges');

      // Create a safety banner element in DOM
      const bannerHost = document.createElement('div');
      bannerHost.id = 'madadgar-safety-banner-host';
      document.body.appendChild(bannerHost);

      expect(document.getElementById('madadgar-safety-banner-host')).not.toBeNull();

      ContentGuardrails.emergencyTeardown();

      expect(clearSpy).toHaveBeenCalled();
      expect(document.getElementById('madadgar-safety-banner-host')).toBeNull();

      clearSpy.mockRestore();
    });
  });
});
