/**
 * Madadgar - Token-Optimized Action Map Serializer (Task 3.3)
 * Converts scanned DOM elements into a hyper-compact, token-efficient text format
 * optimized for LLM reasoning prompts and agent action planners.
 */

import type { ScannedElement } from '@/common/types';

export interface SerializeActionMapOptions {
  /** Include current values of inputs/selects (default: true) */
  includeValues?: boolean;
  /** Max elements to include in the serialized string (default: 150) */
  maxElements?: number;
  /** Max length for label and value strings before truncation (default: 80) */
  maxStringLength?: number;
  /** Include consequential warning tag on critical buttons (default: true) */
  markConsequential?: boolean;
  /** Filter out disabled elements (default: true) */
  excludeDisabled?: boolean;
  /** Include bounding box coordinates {x, y, w, h} (default: false) */
  includeCoordinates?: boolean;
  /** Include header with total element count (default: true) */
  includeHeader?: boolean;
}

/**
 * Truncates and sanitizes a string to prevent prompt token bloat
 */
export function sanitizeString(str?: string, maxLength = 80): string {
  if (!str) return '';
  const cleaned = str.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + '...';
}

/**
 * Estimates LLM token count for a given text (~4 characters per token heuristic)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Standard heuristic: ~4 characters per token for English & punctuation
  return Math.ceil(text.length / 4);
}

/**
 * Serializes a single ScannedElement into a concise, token-optimized line
 * e.g. #1 [input:text] "Full Name" (value: "Alice")
 */
export function serializeElement(
  el: ScannedElement,
  options: SerializeActionMapOptions = {}
): string {
  const {
    includeValues = true,
    maxStringLength = 80,
    markConsequential = true,
    includeCoordinates = false,
  } = options;

  const id = `#${el.id}`;
  const tag = el.tag.toLowerCase();
  const type = el.type ? `:${el.type.toLowerCase()}` : '';
  const role = el.role && el.role !== tag ? ` role="${el.role}"` : '';

  // 1. Tag & Type descriptor
  let typeDescriptor = `[${tag}${type}]`;
  if (tag === 'div' || tag === 'span' || tag === 'a') {
    if (el.role) {
      typeDescriptor = `[${el.role}]`;
    }
  }

  // 2. Primary Label / Name / Accessible Text
  const primaryLabel = sanitizeString(
    el.label || el.text || el.placeholder || el.name || 'unlabelled',
    maxStringLength
  );

  const parts: string[] = [`${id} ${typeDescriptor} "${primaryLabel}"${role}`];

  // 3. Values and State
  if (includeValues) {
    if (el.isPassword) {
      parts.push('(value: "••••••••")');
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      const isChecked =
        el.currentValue === 'checked' ||
        el.currentValue === 'true' ||
        el.currentValue === 'on';
      parts.push(isChecked ? '(checked: true)' : '(checked: false)');
    } else if (el.currentValue !== undefined && el.currentValue !== null) {
      const sanitizedVal = sanitizeString(el.currentValue, maxStringLength);
      parts.push(`(value: "${sanitizedVal}")`);
    } else if (el.placeholder && el.placeholder !== primaryLabel) {
      const sanitizedPh = sanitizeString(el.placeholder, maxStringLength);
      parts.push(`(placeholder: "${sanitizedPh}")`);
    }
  }

  // 4. Anchor href links (truncated relative path)
  if (el.tag === 'a' && el.href) {
    try {
      const parsedUrl = new URL(el.href, 'https://example.com');
      const shortPath = parsedUrl.pathname + parsedUrl.search;
      if (shortPath && shortPath !== '/') {
        parts.push(`(href: "${sanitizeString(shortPath, 40)}")`);
      }
    } catch {
      // ignore malformed URLs
    }
  }

  // 5. Special Flags (Consequential / Disabled)
  if (el.disabled) {
    parts.push('[disabled]');
  }

  if (markConsequential && el.isConsequential) {
    parts.push('[CONSEQUENTIAL]');
  }

  // 6. Coordinates if requested
  if (includeCoordinates && el.rect) {
    const x = Math.round(el.rect.left);
    const y = Math.round(el.rect.top);
    const w = Math.round(el.rect.width);
    const h = Math.round(el.rect.height);
    parts.push(`{x:${x},y:${y},w:${w},h:${h}}`);
  }

  return parts.join(' ');
}

/**
 * Converts a list of ScannedElements into a token-optimized multi-line Action Map
 */
export function serializeActionMap(
  elements: ScannedElement[],
  options: SerializeActionMapOptions = {}
): string {
  if (!elements || elements.length === 0) {
    return '(No interactive elements detected)';
  }

  const {
    maxElements = 150,
    excludeDisabled = true,
    includeHeader = true,
  } = options;

  let filtered = elements;
  if (excludeDisabled) {
    filtered = filtered.filter((el) => !el.disabled);
  }

  const limited = filtered.slice(0, maxElements);
  const lines = limited.map((el) => serializeElement(el, options));

  if (includeHeader) {
    return `=== Interactive Page Elements (Total: ${limited.length}) ===\n${lines.join('\n')}`;
  }

  return lines.join('\n');
}

/**
 * Compresses an Action Map to fit within a strict token budget
 * Progressively strips secondary metadata if token budget is exceeded.
 */
export function compressActionMapToBudget(
  elements: ScannedElement[],
  maxTokenBudget = 2000
): { serialized: string; estimatedTokens: number; elementCount: number } {
  // Pass 1: Full serialization
  let serialized = serializeActionMap(elements, { includeValues: true, maxElements: 120 });
  let estimated = estimateTokens(serialized);

  if (estimated <= maxTokenBudget) {
    return { serialized, estimatedTokens: estimated, elementCount: Math.min(elements.length, 120) };
  }

  // Pass 2: More concise string length & exclude non-essential values
  serialized = serializeActionMap(elements, {
    includeValues: true,
    maxStringLength: 45,
    maxElements: 80,
  });
  estimated = estimateTokens(serialized);

  if (estimated <= maxTokenBudget) {
    return { serialized, estimatedTokens: estimated, elementCount: Math.min(elements.length, 80) };
  }

  // Pass 3: Ultra compact without secondary values
  serialized = serializeActionMap(elements, {
    includeValues: false,
    maxStringLength: 35,
    maxElements: 50,
  });
  estimated = estimateTokens(serialized);

  if (estimated <= maxTokenBudget) {
    return { serialized, estimatedTokens: estimated, elementCount: Math.min(elements.length, 50) };
  }

  // Pass 4: Binary search to strictly fit the specified token budget
  let low = 1;
  let high = Math.min(elements.length, 50);
  let bestSerialized = serialized;
  let bestCount = high;
  let bestEstimated = estimated;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = serializeActionMap(elements, {
      includeValues: false,
      maxStringLength: 30,
      maxElements: mid,
    });
    const candTokens = estimateTokens(candidate);
    if (candTokens <= maxTokenBudget) {
      bestSerialized = candidate;
      bestCount = mid;
      bestEstimated = candTokens;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return { serialized: bestSerialized, estimatedTokens: bestEstimated, elementCount: bestCount };
}
