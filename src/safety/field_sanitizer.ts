/**
 * Madadgar - Sensitive Field & Credential Shield (Task 4.4.2)
 * Deterministic code-level safety guardrail that strictly prohibits reading,
 * scraping, typing, or interacting with password, PIN, CVV, OTP, and payment card fields.
 */

import type { ScannedElement } from '@/common/types';

export const SENSITIVE_AUTOCOMPLETE_VALUES: Set<string> = new Set([
  'current-password',
  'new-password',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'cc-type',
  'one-time-code',
  'otp',
  'pin',
  'transaction-pin',
  'cvv',
  'cvc',
]);

// RegEx matching sensitive field names, IDs, placeholders, or aria-labels
export const SENSITIVE_FIELD_REGEX =
  /(?:^|[-_ ])(password|passwd|pin|cvv|cvc|otp|one[-_]?time[-_]?code|passcode|secret|ssn|aadhaar|pan[-_]?card|cc[-_]?num|card[-_]?num|credit[-_]?card)(?:$|[-_ ])/i;

export const SENSITIVE_INPUT_TYPES: Set<string> = new Set(['password']);

function isDomElement(el: unknown): el is HTMLElement {
  return typeof HTMLElement !== 'undefined' && el instanceof HTMLElement;
}

/**
 * Checks if a live DOM element or a ScannedElement metadata object is sensitive/credential protected.
 */
export function isSensitiveField(
  element: HTMLElement | ScannedElement | null | undefined
): boolean {
  if (!element) return false;

  // 1. Check ScannedElement metadata
  if ('isPassword' in element && element.isPassword) {
    return true;
  }

  // 2. Check DOM element type or ScannedElement type
  const type = (
    'type' in element && typeof element.type === 'string'
      ? element.type
      : isDomElement(element)
      ? element.getAttribute('type') || ''
      : ''
  ).toLowerCase();

  if (SENSITIVE_INPUT_TYPES.has(type)) {
    return true;
  }

  // 3. Inspect attributes on live DOM element
  if (isDomElement(element)) {
    const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase().trim();
    if (autocomplete) {
      const parts = autocomplete.split(/\s+/);
      for (const p of parts) {
        if (SENSITIVE_AUTOCOMPLETE_VALUES.has(p)) {
          return true;
        }
      }
    }

    const name = element.getAttribute('name') || '';
    const id = element.id || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const ariaLabel = element.getAttribute('aria-label') || '';

    if (
      SENSITIVE_FIELD_REGEX.test(name) ||
      SENSITIVE_FIELD_REGEX.test(id) ||
      SENSITIVE_FIELD_REGEX.test(placeholder) ||
      SENSITIVE_FIELD_REGEX.test(ariaLabel)
    ) {
      return true;
    }
  }

  // 4. Inspect ScannedElement attributes (label, placeholder, type)
  if ('label' in element || 'placeholder' in element) {
    const scanned = element as ScannedElement;
    const label = scanned.label || '';
    const placeholder = scanned.placeholder || '';
    if (SENSITIVE_FIELD_REGEX.test(label) || SENSITIVE_FIELD_REGEX.test(placeholder)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates whether an action targeting the field is safe to execute.
 * Prohibits typing, selecting, or mutating protected credential fields.
 */
export function validateFieldActionSafety(
  element: HTMLElement | ScannedElement | null | undefined,
  actionType: string
): { safe: boolean; reason?: string } {
  if (!element) return { safe: true };

  if (isSensitiveField(element)) {
    return {
      safe: false,
      reason:
        `Security Guardrail Block: Autonomous interaction with sensitive/credential field ` +
        `("${actionType}" on password, PIN, CVV, or OTP) is strictly prohibited.`,
    };
  }

  return { safe: true };
}

/**
 * Redacts any sensitive values so protected fields are never leaked to LLMs or prompt history.
 */
export function sanitizeElementValue(
  element: HTMLElement | ScannedElement,
  value?: string
): string {
  if (isSensitiveField(element)) {
    return '••••••••';
  }
  return value || '';
}
