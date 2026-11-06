// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ActionCard } from '@/sidepanel/components/ActionCard';
import type { AgentActionProposal } from '@/common/types';

describe('ActionCard Component (Task 3.7)', () => {
  const sampleProposal: AgentActionProposal = {
    action: 'type',
    target_id: 4,
    value: 'Stanford University',
    reason: 'Typing college name from user profile into institution field',
    is_consequential: false,
  };

  it('instantiates correctly as a valid React component with props', () => {
    const onApprove = vi.fn();
    const onSkip = vi.fn();
    const onStop = vi.fn();

    const element = React.createElement(ActionCard, {
      step: 3,
      maxSteps: 15,
      proposal: sampleProposal,
      onApprove,
      onSkip,
      onStop,
    });

    expect(element).toBeDefined();
    expect(element.props.step).toBe(3);
    expect(element.props.maxSteps).toBe(15);
    expect(element.props.proposal.target_id).toBe(4);
    expect(element.props.proposal.value).toBe('Stanford University');
  });

  it('renders step number, target element badge, value, and reasoning into DOM', () => {
    const html = renderToString(
      React.createElement(ActionCard, {
        step: 3,
        maxSteps: 15,
        proposal: sampleProposal,
        onApprove: vi.fn(),
        onSkip: vi.fn(),
        onStop: vi.fn(),
      })
    );

    expect(html).toContain('Step 3 of 15');
    expect(html).toContain('#4');
    expect(html).toContain('Stanford University');
    expect(html).toContain('Typing college name');
    expect(html).toContain('Approve Step');
    expect(html).toContain('Skip');
    expect(html).toContain('Stop');
  });

  it('renders consequential warning banner when is_consequential is true', () => {
    const consequentialProposal: AgentActionProposal = {
      action: 'click',
      target_id: 9,
      reason: 'Submitting finalized application payment',
      is_consequential: true,
    };

    const html = renderToString(
      React.createElement(ActionCard, {
        step: 5,
        maxSteps: 10,
        proposal: consequentialProposal,
        onApprove: vi.fn(),
        onSkip: vi.fn(),
        onStop: vi.fn(),
      })
    );

    expect(html).toContain('Consequential Action Warning');
    expect(html).toContain('submit a form');
  });

  it('displays dry-run active badge when dryRun is true', () => {
    const html = renderToString(
      React.createElement(ActionCard, {
        step: 2,
        maxSteps: 10,
        proposal: sampleProposal,
        dryRun: true,
        onToggleDryRun: vi.fn(),
        onApprove: vi.fn(),
        onSkip: vi.fn(),
        onStop: vi.fn(),
      })
    );

    expect(html).toContain('Dry-Run Active');
  });
});
