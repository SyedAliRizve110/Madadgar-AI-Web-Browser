import { describe, it, expect } from 'vitest';
import { cleanLaTeXMath, isMathExpression } from '../common/text_formatter';

describe('Text Formatter & Math Delimiter Cleaner', () => {
  it('cleans LaTeX math tokens from Big-O complexity expressions', () => {
    const raw = '$O(n \\times (\\max(arr) - \\min(arr)))$';
    const cleaned = cleanLaTeXMath(raw);
    expect(cleaned).toBe('O(n × (max(arr) - min(arr)))');
  });

  it('cleans single Big-O O(1) and log expressions', () => {
    expect(cleanLaTeXMath('$O(1)$')).toBe('O(1)');
    expect(cleanLaTeXMath('$O(n \\log d)$')).toBe('O(n log d)');
    expect(cleanLaTeXMath('$$O(V + E)$$')).toBe('O(V + E)');
  });

  it('correctly distinguishes math formulas from plain monetary prices', () => {
    expect(isMathExpression('O(1)')).toBe(true);
    expect(isMathExpression('n \\times k')).toBe(true);
    expect(isMathExpression('arr[i]')).toBe(true);
    expect(isMathExpression('100')).toBe(false);
    expect(isMathExpression('19.99')).toBe(false);
  });

  it('handles LaTeX operators and Greek symbols', () => {
    expect(cleanLaTeXMath('x \\le y \\text{ and } a \\ge b')).toBe('x ≤ y and a ≥ b');
    expect(cleanLaTeXMath('\\alpha + \\beta = \\theta')).toBe('α + β = θ');
    expect(cleanLaTeXMath('\\frac{a}{b}')).toBe('(a / b)');
    expect(cleanLaTeXMath('\\sqrt{n}')).toBe('√(n)');
  });
});
