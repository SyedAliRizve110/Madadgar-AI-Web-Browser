// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AgentPilot } from '@/sidepanel/components/AgentPilot';
import type { PageContext } from '@/common/types';

describe('AgentPilot Component (Task 3.7)', () => {
  beforeEach(() => {
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn((message, callback) => {
          if (message.type === 'GET_AGENT_SESSION') {
            callback?.({ session: null });
          }
        }),
        lastError: null,
      },
      tabs: {
        sendMessage: vi.fn(),
      },
    } as any;
  });

  const mockContext: PageContext = {
    tabId: 101,
    title: 'Job Application Portal',
    url: 'https://example.com/apply',
    textContent: 'Job application form fields',
    length: 25,
  };

  it('instantiates correctly as a valid React component with props', () => {
    const element = React.createElement(AgentPilot, {
      context: mockContext,
      hasTabChanged: false,
    });

    expect(element).toBeDefined();
    expect(element.props.context?.title).toBe('Job Application Portal');
    expect(element.props.hasTabChanged).toBe(false);
  });

  it('renders initial IDLE state with goal input, starter errands, and start button', () => {
    const html = renderToString(
      React.createElement(AgentPilot, {
        context: mockContext,
      })
    );

    expect(html).toContain('What errand should Madadgar handle on this page?');
    expect(html).toContain('Start Pilot Errand');
    expect(html).toContain('Example Errands');
    expect(html).toContain('HITL Guardrails Active');
  });

  it('displays tab switch notification banner when hasTabChanged is true', () => {
    const html = renderToString(
      React.createElement(AgentPilot, {
        context: mockContext,
        hasTabChanged: true,
        onSyncContext: vi.fn(),
      })
    );

    expect(html).toContain('Switched tabs. Pilot is tracking previous page.');
    expect(html).toContain('Sync Tab');
  });
});
