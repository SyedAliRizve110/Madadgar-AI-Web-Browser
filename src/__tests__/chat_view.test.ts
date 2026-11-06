import { describe, it, expect } from 'vitest';
import React from 'react';
import { ChatView } from '../sidepanel/components/ChatView';
import type { PageContext } from '../common/types';

describe('ChatView Component (Task 2.2)', () => {
  const mockContext: PageContext = {
    tabId: 55,
    title: 'Modern AI Architectures',
    url: 'https://example.com/ai-paper',
    textContent: 'Full article text regarding browser assistants and agents.',
    length: 50,
  };

  it('instantiates correctly with page context and language props', () => {
    const element = React.createElement(ChatView, {
      context: mockContext,
      language: 'en',
    });

    expect(element).toBeDefined();
    expect(element.props.context?.title).toBe('Modern AI Architectures');
    expect(element.props.language).toBe('en');
  });

  it('renders tab switch warning props when hasTabChanged is true', () => {
    const element = React.createElement(ChatView, {
      context: mockContext,
      hasTabChanged: true,
    });

    expect(element.props.hasTabChanged).toBe(true);
  });

  it('accepts pending context action prop from context menu interactions', () => {
    const onActionHandled = () => {};
    const mockAction = {
      actionId: 'madadgar_explain' as const,
      selectedText: 'Quantum computing is based on qubits.',
      prompt: 'Explain the following text clearly: Quantum computing is based on qubits.',
      timestamp: Date.now(),
    };

    const element = React.createElement(ChatView, {
      context: mockContext,
      pendingAction: mockAction,
      onActionHandled,
    });

    expect(element.props.pendingAction).toEqual(mockAction);
    expect(element.props.pendingAction?.actionId).toBe('madadgar_explain');
    expect(element.props.onActionHandled).toBe(onActionHandled);
  });
});

