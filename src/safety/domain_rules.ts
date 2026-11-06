/**
 * Madadgar - Deterministic Domain Safety Guardrail (Task 4.4.1)
 * Enforces non-negotiable blocking of banking, financial, payment gateways,
 * UPI, cryptocurrency, and sensitive identity portals directly in TypeScript code.
 */

export const BANKING_FINANCIAL_DOMAIN_PATTERNS: string[] = [
  // --- Indian Banks & Netbanking ---
  '*.onlinesbi.com',
  '*.onlinesbi.sbi',
  '*.sbi.co.in',
  '*.hdfcbank.com',
  '*.netbanking.hdfcbank.com',
  '*.icicibank.com',
  '*.infinity.icicibank.com',
  '*.axisbank.com',
  '*.axisbank.co.in',
  '*.kotak.com',
  '*.pnbindia.in',
  '*.netpnb.com',
  '*.bankofbaroda.in',
  '*.bobibanking.com',
  '*.canarabank.com',
  '*.unionbankofindia.co.in',
  '*.indusind.com',
  '*.yesbank.in',
  '*.federalbank.co.in',
  '*.idbibank.in',

  // --- International Banks ---
  '*.chase.com',
  '*.bankofamerica.com',
  '*.wellsfargo.com',
  '*.citibank.com',
  '*.citibank.co.in',
  '*.barclays.com',
  '*.barclays.co.uk',
  '*.hsbc.com',
  '*.hsbc.co.in',
  '*.sc.com',

  // --- Payment Gateways, Wallets & UPI ---
  '*paytm.com',
  '*.paytm.in',
  '*razorpay.com',
  '*.razorpay.in',
  '*phonepe.com',
  '*pay.google.com',
  '*paypal.com',
  '*stripe.com',
  'checkout.stripe.com',
  '*billdesk.com',
  '*payu.in',
  '*cashfree.com',
  '*cred.club',
  '*mobikwik.com',
  '*ccavenue.com',
  '*venmo.com',

  // --- Cryptocurrency & Trading ---
  '*binance.com',
  '*coinbase.com',
  '*kraken.com',
  '*wazirx.com',
  '*coindcx.com',
  '*kucoin.com',
  '*bybit.com',

  // --- Sensitive Identity & Tax Portals ---
  'login.gov',
  'incometax.gov.in',
  'uidai.gov.in',
  'tin-nsdl.com',
];

export const SAFETY_BLOCKED_DOMAIN_MESSAGE =
  'Madadgar is disabled on financial and banking pages for your security.';

/**
 * Extracts normalized hostname from a URL string
 */
export function extractHostname(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      return parsed.hostname.toLowerCase();
    }
    // Handle URLs without scheme
    const match = trimmed.match(/^(?:https?:\/\/)?([^/:]+)/i);
    return match ? match[1].toLowerCase() : trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Checks whether a hostname matches a wildcard pattern (e.g. *.onlinesbi.com or *paytm.com)
 */
export function matchesDomainPattern(hostname: string, pattern: string): boolean {
  if (!hostname || !pattern) return false;
  const h = hostname.toLowerCase();
  const p = pattern.toLowerCase();

  // Exact match
  if (h === p) return true;

  // Wildcard with dot: *.example.com matches sub.example.com and example.com
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h === base || h.endsWith('.' + base);
  }

  // Prefix wildcard: *example.com matches myexample.com or example.com
  if (p.startsWith('*')) {
    const base = p.slice(1);
    return h === base || h.endsWith(base) || h.includes(base);
  }

  // Subdomain match: example.com matches sub.example.com
  if (h.endsWith('.' + p)) {
    return true;
  }

  return false;
}

/**
 * Validates whether a URL belongs to a restricted/blacklisted banking or financial domain
 */
export function validateDomainSafety(url?: string): {
  safe: boolean;
  reason?: string;
  matchedPattern?: string;
} {
  if (!url) return { safe: true };
  const u = url.trim().toLowerCase();

  // Internal browser schemes
  if (
    u.startsWith('chrome://') ||
    u.startsWith('chrome-extension://') ||
    u.startsWith('edge://') ||
    u.startsWith('about:') ||
    u.startsWith('devtools://')
  ) {
    return {
      safe: false,
      reason: 'Madadgar is prohibited on browser internal and extension URLs.',
      matchedPattern: 'browser-internal',
    };
  }

  const hostname = extractHostname(u);

  // Check against defined blacklist patterns
  for (const pattern of BANKING_FINANCIAL_DOMAIN_PATTERNS) {
    if (matchesDomainPattern(hostname, pattern) || u.includes(pattern.replace(/^\*\.?/, ''))) {
      return {
        safe: false,
        reason: SAFETY_BLOCKED_DOMAIN_MESSAGE,
        matchedPattern: pattern,
      };
    }
  }

  // Heuristic safety net for netbanking domains
  if (
    hostname.includes('netbanking') ||
    hostname.includes('onlinebanking') ||
    hostname.includes('ibanking')
  ) {
    return {
      safe: false,
      reason: SAFETY_BLOCKED_DOMAIN_MESSAGE,
      matchedPattern: 'heuristic-netbanking',
    };
  }

  return { safe: true };
}

/**
 * Helper returning boolean indicating if a URL is blacklisted
 */
export function isBlacklistedDomain(url?: string): boolean {
  return !validateDomainSafety(url).safe;
}

