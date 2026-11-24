/**
 * Deterministic Risk Assessment Classifier Tests (Task 6.1)
 */

import { describe, it, expect } from 'vitest';
import { RiskClassifier } from '@/safety/risk_classifier';
import type { AgentActionProposal, ScannedElement } from '@/common/types';

describe('Deterministic Risk Assessment Classifier (Task 6.1)', () => {
  const defaultRect = { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 };

  // --------------------------------------------------------------------------
  // 1. Strict Invariants (Hard-Blocked)
  // --------------------------------------------------------------------------
  describe('Strict Invariants (Hard-Blocked Domains & Sensitive Credentials)', () => {
    it('classifies any action on blacklisted banking domains as HARD_BLOCKED with score 1.0', () => {
      const proposal: AgentActionProposal = {
        action: 'click',
        target_id: 1,
        reason: 'Click login button',
      };

      const assessment = RiskClassifier.assess(proposal, null, 'https://netbanking.hdfcbank.com/netbanking');
      expect(assessment.isHardBlocked).toBe(true);
      expect(assessment.score).toBe(1.0);
      expect(assessment.level).toBe('HARD_BLOCKED');
      expect(assessment.requiresConfirmation).toBe(true);
      expect(assessment.reasons[0]).toContain('disabled on financial and banking pages');
    });

    it('classifies any interaction on password, OTP, or CVV fields as HARD_BLOCKED', () => {
      const proposal: AgentActionProposal = {
        action: 'type',
        target_id: 5,
        value: 'mySecretPassword123',
        reason: 'Fill password field',
      };

      const passwordEl: ScannedElement = {
        id: 5,
        tag: 'input',
        type: 'password',
        label: 'Enter Account Password',
        isPassword: true,
        rect: defaultRect,
      };

      const assessment = RiskClassifier.assess(proposal, passwordEl, 'https://example.com/login');
      expect(assessment.isHardBlocked).toBe(true);
      expect(assessment.score).toBe(1.0);
      expect(assessment.level).toBe('HARD_BLOCKED');
      expect(assessment.requiresConfirmation).toBe(true);
      expect(assessment.signals.credentials).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Financial & Monetary Actions (Score: 1.0, CRITICAL)
  // --------------------------------------------------------------------------
  describe('Financial and Monetary Commit Actions', () => {
    it('assigns 1.0 (CRITICAL) to payment, purchase, and checkout buttons', () => {
      const proposal: AgentActionProposal = {
        action: 'click',
        target_id: 10,
        reason: 'Click pay now to complete transaction',
      };

      const payButton: ScannedElement = {
        id: 10,
        tag: 'button',
        label: 'Pay Now ($49.99)',
        rect: defaultRect,
      };

      const assessment = RiskClassifier.assess(proposal, payButton, 'https://ecommerce.com/cart');
      expect(assessment.score).toBe(1.0);
      expect(assessment.level).toBe('CRITICAL');
      expect(assessment.requiresConfirmation).toBe(true);
      expect(assessment.signals.financial).toBe(true);
      expect(assessment.signals.currencyDetected).toBe('$');
    });

    it('detects Indian Rupee ₹ symbol and transactional form actions', () => {
      const proposal: AgentActionProposal = {
        action: 'click',
        target_id: 12,
        reason: 'Place order button',
      };

      const orderButton: ScannedElement = {
        id: 12,
        tag: 'button',
        label: 'Place Order - Total ₹1,499',
        rect: defaultRect,
      };

      const assessment = RiskClassifier.assess(
        proposal,
        orderButton,
        'https://shopping.in/checkout',
        { formAction: 'https://shopping.in/api/v1/checkout/pay' }
      );

      expect(assessment.score).toBe(1.0);
      expect(assessment.signals.financial).toBe(true);
      expect(assessment.signals.currencyDetected).toBe('₹');
      expect(assessment.requiresConfirmation).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Destructive and Irreversible Actions (Score: 0.9, HIGH)
  // --------------------------------------------------------------------------
  describe('Destructive & Irreversible Actions', () => {
    it('assigns 0.9 (HIGH) to delete account, remove item, or purge operations', () => {
      const proposal: AgentActionProposal = {
        action: 'click',
        target_id: 20,
        reason: 'Confirm irreversible account deletion',
      };

      const deleteButton: ScannedElement = {
        id: 20,
        tag: 'button',
        label: 'Delete Account Permanently',
        rect: defaultRect,
      };

      const assessment = RiskClassifier.assess(proposal, deleteButton, 'https://app.com/settings');
      expect(assessment.score).toBe(0.9);
      expect(assessment.level).toBe('HIGH');
      expect(assessment.requiresConfirmation).toBe(true);
      expect(assessment.signals.destructive).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Routine & Safe Form-Filling / Navigation Actions
  // --------------------------------------------------------------------------
  describe('Safe Form-Filling, Search, and Passive Actions', () => {
    it('assigns 0.0 (LOW) to scroll and done actions', () => {
      const scrollProposal: AgentActionProposal = {
        action: 'scroll',
        value: 'down',
        reason: 'Scroll down to read more content',
      };

      const assessment = RiskClassifier.assess(scrollProposal);
      expect(assessment.score).toBe(0.0);
      expect(assessment.level).toBe('LOW');
      expect(assessment.requiresConfirmation).toBe(false);
    });

    it('assigns 0.1 (LOW) to search query input fields', () => {
      const searchProposal: AgentActionProposal = {
        action: 'type',
        target_id: 3,
        value: 'typescript chrome extension',
        reason: 'Type search query into input box',
      };

      const searchInput: ScannedElement = {
        id: 3,
        tag: 'input',
        type: 'search',
        placeholder: 'Search documentation...',
        rect: defaultRect,
      };

      const assessment = RiskClassifier.assess(searchProposal, searchInput);
      expect(assessment.score).toBe(0.1);
      expect(assessment.level).toBe('LOW');
      expect(assessment.requiresConfirmation).toBe(false);
    });

    it('assigns 0.3 (LOW) to standard form field typing (e.g. name, email, location)', () => {
      const typeProposal: AgentActionProposal = {
        action: 'type',
        target_id: 7,
        value: 'Ali Rizvi',
        reason: 'Fill applicant full name',
      };

      const nameInput: ScannedElement = {
        id: 7,
        tag: 'input',
        type: 'text',
        placeholder: 'Full Name',
        label: 'Applicant Name',
        rect: defaultRect,
      };

      const assessment = RiskClassifier.assess(typeProposal, nameInput);
      expect(assessment.score).toBe(0.3);
      expect(assessment.level).toBe('LOW');
      expect(assessment.requiresConfirmation).toBe(false);
    });

    it('requiresConfirmation helper correctly flags actions >= 0.5', () => {
      expect(RiskClassifier.requiresConfirmation(0.0)).toBe(false);
      expect(RiskClassifier.requiresConfirmation(0.1)).toBe(false);
      expect(RiskClassifier.requiresConfirmation(0.3)).toBe(false);
      expect(RiskClassifier.requiresConfirmation(0.5)).toBe(true);
      expect(RiskClassifier.requiresConfirmation(0.9)).toBe(true);
      expect(RiskClassifier.requiresConfirmation(1.0)).toBe(true);
    });
  });
});
