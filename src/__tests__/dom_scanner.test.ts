// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { DOMScanner } from '@/content/scanner';

describe('Interactive DOM Scanner & Unique Indexer (Task 3.1)', () => {
  beforeEach(() => {
    DOMScanner.clear();
    document.body.innerHTML = '';
  });

  it('scans and indexes standard interactive elements with sequential IDs', () => {
    document.body.innerHTML = `
      <div>
        <label for="name-input">Full Name</label>
        <input id="name-input" type="text" name="fullName" placeholder="John Doe" value="Alice" />

        <label>
          Email Address
          <input type="email" name="userEmail" placeholder="alice@example.com" />
        </label>

        <select id="country-select" name="country">
          <option value="us">United States</option>
          <option value="in" selected>India</option>
        </select>

        <textarea id="bio" placeholder="Write a short bio...">Software Engineer</textarea>

        <button id="submit-btn" type="submit">Submit Application</button>
        <a href="https://example.com/terms">Terms and Conditions</a>
      </div>
    `;

    const elements = DOMScanner.scan(document, { allowZeroRectInTest: true });

    expect(elements).toHaveLength(6);

    // Verify sequential IDs
    expect(elements.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6]);

    // Element 1: Full Name input
    expect(elements[0].tag).toBe('input');
    expect(elements[0].type).toBe('text');
    expect(elements[0].label).toBe('Full Name');
    expect(elements[0].name).toBe('fullName');
    expect(elements[0].currentValue).toBe('Alice');

    // Element 2: Email input with parent label
    expect(elements[1].tag).toBe('input');
    expect(elements[1].type).toBe('email');
    expect(elements[1].label).toBe('Email Address');

    // Element 3: Country select
    expect(elements[2].tag).toBe('select');
    expect(elements[2].currentValue).toBe('India');

    // Element 4: Bio textarea
    expect(elements[3].tag).toBe('textarea');
    expect(elements[3].currentValue).toBe('Software Engineer');

    // Element 5: Submit button (consequential)
    expect(elements[4].tag).toBe('button');
    expect(elements[4].label).toBe('Submit Application');
    expect(elements[4].isConsequential).toBe(true);

    // Element 6: Anchor link
    expect(elements[5].tag).toBe('a');
    expect(elements[5].href).toBe('https://example.com/terms');
    expect(elements[5].label).toBe('Terms and Conditions');
  });

  it('retrieves live DOM element by its assigned numeric ID via getElementById', () => {
    document.body.innerHTML = `
      <button id="my-action-btn">Click Me</button>
    `;

    const elements = DOMScanner.scan(document, { allowZeroRectInTest: true });
    expect(elements).toHaveLength(1);

    const liveBtn = DOMScanner.getElementById(elements[0].id);
    expect(liveBtn).not.toBeNull();
    expect(liveBtn?.id).toBe('my-action-btn');
    expect(liveBtn?.getAttribute('data-madadgar-id')).toBe('1');
  });

  it('filters out non-visible elements (display: none, hidden attributes)', () => {
    document.body.innerHTML = `
      <button id="btn-visible">Visible Button</button>
      <button id="btn-hidden" style="display: none;">Hidden Button</button>
      <input type="hidden" name="csrfToken" value="xyz123" />
    `;

    const elements = DOMScanner.scan(document, { allowZeroRectInTest: true });
    expect(elements).toHaveLength(1);
    expect(elements[0].label).toBe('Visible Button');
  });

  it('identifies password inputs and protects sensitive values', () => {
    document.body.innerHTML = `
      <label for="pwd">Password</label>
      <input id="pwd" type="password" value="SuperSecret123!" />
    `;

    const elements = DOMScanner.scan(document, { allowZeroRectInTest: true });
    expect(elements).toHaveLength(1);
    expect(elements[0].isPassword).toBe(true);
    // Value masked for safety
    expect(elements[0].currentValue).toBe('••••••••');
  });

  it('identifies ARIA roles and accessible names', () => {
    document.body.innerHTML = `
      <div role="button" aria-label="Close dialog" tabindex="0">✕</div>
      <span role="link" href="/help" aria-label="Get Help">Help</span>
    `;

    const elements = DOMScanner.scan(document, { allowZeroRectInTest: true });
    expect(elements).toHaveLength(2);

    expect(elements[0].role).toBe('button');
    expect(elements[0].label).toBe('Close dialog');

    expect(elements[1].role).toBe('link');
    expect(elements[1].label).toBe('Get Help');
  });

  it('detects consequential action buttons (pay, delete, submit)', () => {
    document.body.innerHTML = `
      <button>Pay Now $49.00</button>
      <button>Delete Account</button>
      <button>Confirm Order</button>
      <button>Cancel Subscription</button>
      <button>Read More</button>
    `;

    const elements = DOMScanner.scan(document, { allowZeroRectInTest: true });
    expect(elements).toHaveLength(5);

    expect(elements[0].isConsequential).toBe(true); // Pay Now
    expect(elements[1].isConsequential).toBe(true); // Delete
    expect(elements[2].isConsequential).toBe(true); // Confirm Order
    expect(elements[3].isConsequential).toBe(true); // Cancel Subscription
    expect(elements[4].isConsequential).toBe(false); // Read More
  });

  it('never indexes Madadgar overlay host or overlay root elements', () => {
    document.body.innerHTML = `
      <button>Regular Page Button</button>
      <div id="madadgar-overlay-host">
        <button>Inside Overlay Button</button>
      </div>
    `;

    const elements = DOMScanner.scan(document, { allowZeroRectInTest: true });
    expect(elements).toHaveLength(1);
    expect(elements[0].label).toBe('Regular Page Button');
  });
});
