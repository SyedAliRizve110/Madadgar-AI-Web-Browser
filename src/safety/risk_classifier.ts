/**
 * Madadgar - Deterministic Risk Assessment Classifier (Task 6.1)
 * Evaluates proposed agent actions across multi-signal heuristics (action type, element metadata,
 * nearby currencies, form action targets, and non-negotiable security boundaries)
 * to assign deterministic risk scores between 0.0 and 1.0.
 */

import type { AgentActionProposal, ScannedElement, RiskAssessment } from '@/common/types';
import { isBlacklistedDomain, SAFETY_BLOCKED_DOMAIN_MESSAGE } from './domain_rules';
import { isSensitiveField } from './field_sanitizer';

// Financial and monetary transaction keywords
export const FINANCIAL_KEYWORDS =
  /\b(pay|pay now|payment|buy|buy now|purchase|order|place order|confirm order|checkout|subscribe|charge|billing|wire transfer|donate|invest|make payment|complete order|send money)\b/i;

// Currency symbols and currency code indicators
export const CURRENCY_SYMBOLS_REGEX = /([$₹€£¥]|INR|USD|EUR|GBP|BTC|ETH)/;

// Irreversible / destructive keywords
export const DESTRUCTIVE_KEYWORDS =
  /\b(delete|remove|destroy|cancel account|close account|terminate|discard|clear all|erase|unsubscribe|drop|wipe|purge|revoke|deactivate)\b/i;

// Form actions pointing to checkout or transaction processing
export const FINANCIAL_FORM_ACTION_REGEX =
  /(checkout|payment|order|purchase|billing|cart\/checkout|charge|pay)/i;

// Search keywords and element identifiers
export const SEARCH_KEYWORDS =
  /\b(search|find|query|lookup|filter|browse)\b/i;

function isDomElement(el: unknown): el is HTMLElement {
  return typeof HTMLElement !== 'undefined' && el instanceof HTMLElement;
}

export class RiskClassifier {
  /**
   * Deterministically evaluates an action proposal and returns an exhaustive RiskAssessment.
   */
  public static assess(
    proposal: AgentActionProposal,
    element?: ScannedElement | HTMLElement | null,
    activeUrl?: string,
    pageContext?: { nearbyText?: string; formAction?: string }
  ): RiskAssessment {
    const reasons: string[] = [];
    const signals = {
      financial: false,
      credentials: false,
      destructive: false,
      blacklistedDomain: false,
      currencyDetected: undefined as string | undefined,
      formAction: pageContext?.formAction,
    };

    // -------------------------------------------------------------------------
    // 1. Strict Invariant A: Blacklisted Financial / Banking Domain Check
    // -------------------------------------------------------------------------
    if (activeUrl && isBlacklistedDomain(activeUrl)) {
      signals.blacklistedDomain = true;
      reasons.push(SAFETY_BLOCKED_DOMAIN_MESSAGE);
      return {
        score: 1.0,
        level: 'HARD_BLOCKED',
        isHardBlocked: true,
        requiresConfirmation: true,
        reasons,
        signals,
      };
    }

    // -------------------------------------------------------------------------
    // 2. Strict Invariant B: Sensitive Credential / Password / OTP Shield
    // -------------------------------------------------------------------------
    if (element && isSensitiveField(element)) {
      signals.credentials = true;
      reasons.push('Security Policy Violation: Autonomous interaction with password fields is strictly prohibited for security (credential safety shield).');
      return {
        score: 1.0,
        level: 'HARD_BLOCKED',
        isHardBlocked: true,
        requiresConfirmation: true,
        reasons,
        signals,
      };
    }

    // Passive & non-mutating actions
    if (proposal.action === 'scroll' || proposal.action === 'done' || proposal.action === 'fail') {
      return {
        score: 0.0,
        level: 'LOW',
        isHardBlocked: false,
        requiresConfirmation: false,
        reasons: ['Passive or informational action.'],
        signals,
      };
    }

    // -------------------------------------------------------------------------
    // 3. Multi-Signal Extraction: Collect Element Labels & Surrounding Text
    // -------------------------------------------------------------------------
    let elementText = '';
    let elementPlaceholder = '';
    let elementType = '';
    let elementAria = '';
    let formAction = pageContext?.formAction || '';

    if (element) {
      if ('label' in element) {
        // ScannedElement
        const sc = element as ScannedElement;
        elementText = sc.label || '';
        elementPlaceholder = sc.placeholder || '';
        elementType = (sc.type || '').toLowerCase();
      } else if (isDomElement(element)) {
        elementText = element.innerText || element.textContent || '';
        elementPlaceholder = element.getAttribute('placeholder') || '';
        elementAria = element.getAttribute('aria-label') || '';
        elementType = (element.getAttribute('type') || element.tagName).toLowerCase();

        const parentForm = element.closest('form');
        if (parentForm && !formAction) {
          formAction = parentForm.getAttribute('action') || '';
        }
      }
    }

    const combinedElementText = `${elementText} ${elementPlaceholder} ${elementAria} ${proposal.reason || ''} ${proposal.value || ''}`.trim();
    const contextWithNearby = `${combinedElementText} ${pageContext?.nearbyText || ''}`.trim();

    // Check for currency symbols
    const currencyMatch = contextWithNearby.match(CURRENCY_SYMBOLS_REGEX);
    if (currencyMatch) {
      signals.currencyDetected = currencyMatch[0];
    }

    // -------------------------------------------------------------------------
    // 4. Financial & Monetary Commit Signals (Score: 1.0)
    // -------------------------------------------------------------------------
    const hasFinancialKeyword = FINANCIAL_KEYWORDS.test(combinedElementText);
    const hasFinancialFormAction = formAction ? FINANCIAL_FORM_ACTION_REGEX.test(formAction) : false;

    if (hasFinancialKeyword || (signals.currencyDetected && proposal.action === 'click') || hasFinancialFormAction) {
      signals.financial = true;
      if (hasFinancialKeyword) {
        reasons.push('Financial commitment keyword detected in button/action label.');
      }
      if (signals.currencyDetected) {
        reasons.push(`Monetary currency indicator (${signals.currencyDetected}) detected in interaction context.`);
      }
      if (hasFinancialFormAction) {
        reasons.push(`Target element belongs to transactional form action ("${formAction}").`);
      }

      return {
        score: 1.0,
        level: 'CRITICAL',
        isHardBlocked: false,
        requiresConfirmation: true,
        reasons,
        signals,
      };
    }

    // -------------------------------------------------------------------------
    // 5. Irreversible / Destructive Signals (Score: 0.9)
    // -------------------------------------------------------------------------
    if (DESTRUCTIVE_KEYWORDS.test(combinedElementText)) {
      signals.destructive = true;
      reasons.push('Irreversible destructive action (delete, remove, cancel account, or purge) detected.');
      return {
        score: 0.9,
        level: 'HIGH',
        isHardBlocked: false,
        requiresConfirmation: true,
        reasons,
        signals,
      };
    }

    // Explicit proposal consequential flag
    if (proposal.is_consequential) {
      reasons.push('Action flagged as consequential by task planner.');
      return {
        score: 0.8,
        level: 'HIGH',
        isHardBlocked: false,
        requiresConfirmation: true,
        reasons,
        signals,
      };
    }

    // -------------------------------------------------------------------------
    // 6. Search Input & Passive Navigation (Score: 0.1)
    // -------------------------------------------------------------------------
    const isSearchField =
      elementType === 'search' ||
      SEARCH_KEYWORDS.test(elementPlaceholder) ||
      SEARCH_KEYWORDS.test(elementText) ||
      (proposal.action === 'type' && SEARCH_KEYWORDS.test(proposal.reason || ''));

    const isPassiveLinkClick =
      proposal.action === 'click' &&
      (element ? ('tag' in element ? element.tag === 'a' : isDomElement(element) && element.tagName.toLowerCase() === 'a') : false) &&
      !FINANCIAL_KEYWORDS.test(combinedElementText) &&
      !DESTRUCTIVE_KEYWORDS.test(combinedElementText);

    if (isSearchField || isPassiveLinkClick) {
      return {
        score: 0.1,
        level: 'LOW',
        isHardBlocked: false,
        requiresConfirmation: false,
        reasons: [isSearchField ? 'Standard search query input.' : 'Passive navigation link click.'],
        signals,
      };
    }

    // -------------------------------------------------------------------------
    // 7. Standard Profile / Form Inputs (Score: 0.3)
    // -------------------------------------------------------------------------
    if (proposal.action === 'type' || proposal.action === 'select') {
      return {
        score: 0.3,
        level: 'LOW',
        isHardBlocked: false,
        requiresConfirmation: false,
        reasons: ['Standard profile or form input field.'],
        signals,
      };
    }

    // Standard button click without financial or destructive keywords
    if (proposal.action === 'click') {
      return {
        score: 0.2,
        level: 'LOW',
        isHardBlocked: false,
        requiresConfirmation: false,
        reasons: ['Standard non-destructive button or UI element click.'],
        signals,
      };
    }

    // Default catch-all
    return {
      score: 0.2,
      level: 'LOW',
      isHardBlocked: false,
      requiresConfirmation: false,
      reasons: ['General low-risk UI interaction.'],
      signals,
    };
  }

  /**
   * Helper to determine whether an assessment requires explicit HITL approval.
   * Auto-Pilot executes steps with score < 0.5. Steps with score >= 0.5 require approval.
   */
  public static requiresConfirmation(assessmentOrScore: RiskAssessment | number): boolean {
    const score = typeof assessmentOrScore === 'number' ? assessmentOrScore : assessmentOrScore.score;
    return score >= 0.5;
  }
}
