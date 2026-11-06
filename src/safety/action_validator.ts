/**
 * Madadgar - Consequential Action Interceptor Gate (Task 4.4.3)
 * Deterministic safety gate that identifies consequential, destructive, or financial actions
 * (e.g. Submit, Pay, Transfer, Delete, Send, Confirm Order) and enforces elevated confirmation.
 */

import type { AgentActionProposal, ScannedElement } from '@/common/types';
import { isSensitiveField } from './field_sanitizer';
import { isBlacklistedDomain, SAFETY_BLOCKED_DOMAIN_MESSAGE } from './domain_rules';

export const CONSEQUENTIAL_KEYWORDS: RegExp =
  /\b(submit|pay|pay now|transfer|delete|remove|send|confirm order|place order|buy now|checkout|authorize|purchase|confirm payment|complete purchase|wire transfer)\b/i;

function isDomElement(el: unknown): el is HTMLElement {
  return typeof HTMLElement !== 'undefined' && el instanceof HTMLElement;
}

/**
 * Inspects an action proposal and its target element to determine if it is consequential.
 */
export function isConsequentialAction(
  action: AgentActionProposal,
  element?: ScannedElement | HTMLElement | null
): boolean {
  // If the LLM planner or user already flagged it as consequential
  if (action.is_consequential) {
    return true;
  }

  // Check action type: delete or payment actions
  if (action.action === 'click') {
    // Check element text or label
    if (element) {
      const label =
        'label' in element
          ? element.label || ''
          : isDomElement(element)
          ? element.innerText || element.textContent || element.getAttribute('aria-label') || ''
          : '';

      if (CONSEQUENTIAL_KEYWORDS.test(label.trim())) {
        return true;
      }
    }

    // Check action reason
    if (action.reason && CONSEQUENTIAL_KEYWORDS.test(action.reason)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates the proposed action against all deterministic safety gates:
 * 1. Blacklisted domain check
 * 2. Sensitive field shield (passwords, OTP, PIN, CVV)
 * 3. Consequential action detection
 */
export function validateActionProposal(
  proposal: AgentActionProposal,
  elements: ScannedElement[],
  activeUrl?: string
): {
  safe: boolean;
  reason?: string;
  isConsequential: boolean;
  requiresDoubleConfirmation: boolean;
} {
  // 1. Check URL Domain Rules
  if (activeUrl && isBlacklistedDomain(activeUrl)) {
    return {
      safe: false,
      reason: SAFETY_BLOCKED_DOMAIN_MESSAGE,
      isConsequential: true,
      requiresDoubleConfirmation: false,
    };
  }

  // 2. Check Target Element for Sensitive Credentials
  const targetElement = elements.find((e) => e.id === proposal.target_id);

  if (targetElement && (proposal.action === 'type' || proposal.action === 'click')) {
    if (isSensitiveField(targetElement)) {
      return {
        safe: false,
        reason:
          'Security Policy Violation: Autonomous interaction with password fields is strictly prohibited for security (credential safety shield).',
        isConsequential: false,
        requiresDoubleConfirmation: false,
      };
    }
  }

  // 3. Check Consequential Action Gate
  const consequential = isConsequentialAction(proposal, targetElement);

  return {
    safe: true,
    isConsequential: consequential,
    requiresDoubleConfirmation: consequential,
  };
}
