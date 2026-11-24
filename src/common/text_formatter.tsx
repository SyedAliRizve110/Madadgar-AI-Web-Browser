import React from 'react';
import { Play } from 'lucide-react';

/**
 * Converts LaTeX math tokens into clean, readable Unicode / plain text.
 */
export function cleanLaTeXMath(raw: string): string {
  let text = raw.trim();

  // If wrapped in $$...$$ or $...$, remove them
  if (text.startsWith('$$') && text.endsWith('$$')) {
    text = text.slice(2, -2).trim();
  } else if (text.startsWith('$') && text.endsWith('$')) {
    text = text.slice(1, -1).trim();
  } else if (text.startsWith('\\(') && text.endsWith('\\)')) {
    text = text.slice(2, -2).trim();
  } else if (text.startsWith('\\[') && text.endsWith('\\]')) {
    text = text.slice(2, -2).trim();
  }

  // Common LaTeX math symbols to Unicode
  const replacements: [RegExp, string][] = [
    [/\\times\b/g, '×'],
    [/\\cdot\b/g, '·'],
    [/\\div\b/g, '÷'],
    [/\\pm\b/g, '±'],
    [/\\mp\b/g, '∓'],
    [/\\le\b|\\leq\b/g, '≤'],
    [/\\ge\b|\\geq\b/g, '≥'],
    [/\\ne\b|\\neq\b/g, '≠'],
    [/\\approx\b/g, '≈'],
    [/\\equiv\b/g, '≡'],
    [/\\infty\b/g, '∞'],
    [/\\log\b/g, 'log'],
    [/\\ln\b/g, 'ln'],
    [/\\max\b/g, 'max'],
    [/\\min\b/g, 'min'],
    [/\\sum\b/g, '∑'],
    [/\\prod\b/g, '∏'],
    [/\\in\b/g, '∈'],
    [/\\notin\b/g, '∉'],
    [/\\subset\b/g, '⊂'],
    [/\\subseteq\b/g, '⊆'],
    [/\\rightarrow\b|\\to\b/g, '→'],
    [/\\leftarrow\b/g, '←'],
    [/\\leftrightarrow\b/g, '↔'],
    [/\\Rightarrow\b/g, '⇒'],
    [/\\Leftarrow\b/g, '⇐'],
    [/\\Leftrightarrow\b/g, '⇔'],
    [/\\alpha\b/g, 'α'],
    [/\\beta\b/g, 'β'],
    [/\\gamma\b/g, 'γ'],
    [/\\delta\b/g, 'δ'],
    [/\\epsilon\b/g, 'ε'],
    [/\\theta\b/g, 'θ'],
    [/\\lambda\b/g, 'λ'],
    [/\\mu\b/g, 'μ'],
    [/\\pi\b/g, 'π'],
    [/\\sigma\b/g, 'σ'],
    [/\\omega\b/g, 'ω'],
    [/\\Delta\b/g, 'Δ'],
    [/\\Omega\b/g, 'Ω'],
    [/\\Sigma\b/g, 'Σ'],
    // \frac{a}{b} -> (a / b)
    [/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)'],
    // \sqrt{x} -> √(x)
    [/\\sqrt\{([^}]+)\}/g, '√($1)'],
    // \text{...}, \mathrm{...}, \mathbf{...} -> ...
    [/\\(?:text|mathrm|mathbf|mathit|mathcal)\{([^}]+)\}/g, '$1'],
    // Unescape braces and underscores
    [/\\\{/g, '{'],
    [/\\\}/g, '}'],
    [/\\_/g, '_'],
    [/\\\(/g, '('],
    [/\\\)/g, ')'],
    [/\\\[/g, '['],
    [/\\\]/g, ']'],
  ];

  for (const [regex, replacement] of replacements) {
    text = text.replace(regex, replacement);
  }

  // Remove any remaining stray backslashes before words
  text = text.replace(/\\([a-zA-Z]+)/g, '$1');

  // Collapse multiple whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Checks if a string enclosed in $...$ represents a math / formula expression
 * rather than a monetary price (e.g. not "$50" or "$10.99").
 */
export function isMathExpression(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  // If it's purely digits and optional decimal (like price: 100 or 19.99), it's not a math formula
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return false;
  // If it contains typical math indicators: Big-O, backslash, Greek, operators, variable comparisons
  if (
    /\\/.test(trimmed) ||
    /\bO\s*\(/.test(trimmed) ||
    /[=<>≤≥≠≈×÷±^]/.test(trimmed) ||
    /\b(?:log|ln|min|max|arr|sum|sqrt)\b/i.test(trimmed) ||
    /[-+*/]/.test(trimmed)
  ) {
    return true;
  }
  // If it's an alphanumeric formula like n or k or x^2
  if (/^[a-zA-Z0-9_\-\s()[\],.+*^]+$/.test(trimmed) && trimmed.length <= 60) {
    return true;
  }
  return false;
}

/**
 * Parses inline formatting:
 * - Bold (**text**)
 * - Code (`code`)
 * - LaTeX math ($math$ and $$math$$ and \(math\))
 * - Clickable video timestamps ([mm:ss])
 */
export function renderInlineMarkdown(
  text: string,
  onTimestampClick?: (time: string) => void
): React.ReactNode {
  // Regex splitting by:
  // 1. $$...$$
  // 2. $...$
  // 3. \(...\)
  // 4. **...**
  // 5. `...`
  // 6. [mm:ss] or [hh:mm:ss]
  const tokenRegex = /(\$\$[^\$]+\$\$|\$[^\$]+\$|\\\([^\)]+\\\)|\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}:\d{2}(?::\d{2})?\])/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Display / block math $$...$$
    if (part.startsWith('$$') && part.endsWith('$$')) {
      const inner = part.slice(2, -2);
      if (isMathExpression(inner)) {
        return (
          <code
            key={idx}
            className="bg-slate-100 text-indigo-800 px-1.5 py-0.5 rounded font-mono text-[11px] font-medium tracking-tight mx-0.5"
          >
            {cleanLaTeXMath(inner)}
          </code>
        );
      }
      return part;
    }

    // Inline math $...$
    if (part.startsWith('$') && part.endsWith('$')) {
      const inner = part.slice(1, -1);
      if (isMathExpression(inner)) {
        return (
          <code
            key={idx}
            className="bg-slate-100 text-indigo-800 px-1 py-0.5 rounded font-mono text-[11px] font-medium tracking-tight mx-0.5"
          >
            {cleanLaTeXMath(inner)}
          </code>
        );
      }
      return part;
    }

    // LaTeX parentheses \(...\)
    if (part.startsWith('\\(') && part.endsWith('\\)')) {
      const inner = part.slice(2, -2);
      return (
        <code
          key={idx}
          className="bg-slate-100 text-indigo-800 px-1 py-0.5 rounded font-mono text-[11px] font-medium tracking-tight mx-0.5"
        >
          {cleanLaTeXMath(inner)}
        </code>
      );
    }

    // Bold **text**
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {renderInlineMarkdown(part.slice(2, -2), onTimestampClick)}
        </strong>
      );
    }

    // Code `code`
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="bg-slate-100 text-indigo-800 px-1 py-0.5 rounded font-mono text-[11px] font-medium">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Video Timestamp [mm:ss]
    const timestampMatch = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]$/.exec(part);
    if (timestampMatch) {
      const time = timestampMatch[1];
      if (onTimestampClick) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onTimestampClick(time)}
            className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-mono font-medium transition-colors cursor-pointer"
            title={`Seek video to ${time}`}
          >
            <Play className="w-2.5 h-2.5 fill-indigo-600 text-indigo-600" />
            <span>{time}</span>
          </button>
        );
      }
      return (
        <span key={idx} className="font-mono text-indigo-600 text-[11px]">
          [{time}]
        </span>
      );
    }

    return part;
  });
}
