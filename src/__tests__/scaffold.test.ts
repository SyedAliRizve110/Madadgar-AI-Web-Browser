import { describe, it, expect } from 'vitest';
import App from '@/sidepanel/App';

describe('Madadgar Extension Shell', () => {
  it('loads App component successfully', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });
});
