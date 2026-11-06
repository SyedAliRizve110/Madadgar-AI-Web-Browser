// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { SkillsDrawer } from '@/sidepanel/components/SkillsDrawer';
import {
  getSavedSkills,
  saveSkill,
  deleteSkill,
  resetDefaultSkills,
  exportSkillsJson,
  importSkillsJson,
  clearAllStorage,
} from '@/common/storage_adapter';
import type { SavedSkill } from '@/common/types';

function fireInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLInputElement
      ? window.HTMLInputElement.prototype
      : window.HTMLTextAreaElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  nativeSetter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Saved Skills Catalog & Prompt Recipes (Task 4.3)', () => {
  beforeEach(async () => {
    await clearAllStorage();
  });

  describe('Storage Layer & Operations', () => {
    it('returns the 4 curated built-in skills by default when storage is empty', async () => {
      const skills = await getSavedSkills();
      expect(skills).toHaveLength(4);

      const names = skills.map((s) => s.name);
      expect(names).toContain('Exam Notes');
      expect(names).toContain('Explain in Hinglish');
      expect(names).toContain('Reply to this email politely');
      expect(names).toContain('Fill form from my profile');

      // Verify categories
      const fillSkill = skills.find((s) => s.name === 'Fill form from my profile');
      expect(fillSkill?.category).toBe('forms');
      expect(fillSkill?.requiresProfile).toBe(true);
      expect(fillSkill?.targetTab).toBe('agent');
    });

    it('creates, saves, and updates custom skills in storage', async () => {
      const custom: Omit<SavedSkill, 'id' | 'createdAt'> = {
        name: 'Technical Code Reviewer',
        title: 'Technical Code Reviewer',
        description: 'Critiques code snippets for complexity, security, and edge cases.',
        promptTemplate: 'Review this code for edge cases, memory leaks, and performance.',
        category: 'study',
        tags: ['Code', 'Review'],
        requiresProfile: false,
        targetTab: 'chat',
      };

      const saved = await saveSkill(custom);
      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Technical Code Reviewer');

      const all = await getSavedSkills();
      expect(all.some((s) => s.id === saved.id)).toBe(true);

      // Update skill
      await saveSkill({
        ...saved,
        description: 'Updated description for code review',
      });

      const updatedList = await getSavedSkills();
      const updated = updatedList.find((s) => s.id === saved.id);
      expect(updated?.description).toBe('Updated description for code review');
    });

    it('deletes custom skills from storage', async () => {
      const created = await saveSkill({
        name: 'Temporary Skill',
        description: 'Will be deleted',
        promptTemplate: 'Do something temporary',
        category: 'custom',
        tags: ['Temp'],
      });

      let all = await getSavedSkills();
      expect(all.some((s) => s.id === created.id)).toBe(true);

      await deleteSkill(created.id);
      all = await getSavedSkills();
      expect(all.some((s) => s.id === created.id)).toBe(false);
    });

    it('resets catalog to the 4 default curated skills', async () => {
      await saveSkill({
        name: 'Custom To Reset',
        description: 'Test',
        promptTemplate: 'Test prompt',
        category: 'custom',
        tags: [],
      });

      let all = await getSavedSkills();
      expect(all.length).toBeGreaterThan(4);

      const restored = await resetDefaultSkills();
      expect(restored).toHaveLength(4);
      expect(restored.some((s) => s.name === 'Custom To Reset')).toBe(false);
    });

    it('exports and imports skills as valid JSON format', async () => {
      const json = await exportSkillsJson();
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(4);

      // Import custom list
      const newSkillsJson = JSON.stringify([
        {
          id: 'skill-custom-mock-1',
          name: 'Imported Marketing Writer',
          description: 'Writes engaging copy',
          promptTemplate: 'Write high converting ad copy for this product.',
          category: 'writing',
          tags: ['Copywriting', 'Marketing'],
          requiresProfile: false,
          targetTab: 'chat',
        },
      ]);

      const imported = await importSkillsJson(newSkillsJson);
      expect(imported.some((s) => s.name === 'Imported Marketing Writer')).toBe(true);
    });

    it('rejects invalid or malformed JSON during skill import', async () => {
      await expect(importSkillsJson('invalid json string')).rejects.toThrow();
      await expect(importSkillsJson('[]')).rejects.toThrow('contains no valid skills');
      await expect(importSkillsJson(JSON.stringify([{ invalid: 'field' }]))).rejects.toThrow(
        'must contain at least a name'
      );
    });
  });

  describe('SkillsDrawer React Component UI', () => {
    it('renders header, action buttons, category filter, and skill cards', () => {
      const html = renderToString(React.createElement(SkillsDrawer, {}));

      expect(html).toContain('Skills Catalog');
      expect(html).toContain('New Skill');
      expect(html).toContain('Export');
      expect(html).toContain('Import');
      expect(html).toContain('Reset Defaults');
      expect(html).toContain('Search skills');
    });

    it('interactively filters skills by category pills and search queries', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(SkillsDrawer, {}));
      });

      // Initially shows all 4 default skills
      expect(container.textContent).toContain('Exam Notes');
      expect(container.textContent).toContain('Explain in Hinglish');
      expect(container.textContent).toContain('Reply to this email politely');
      expect(container.textContent).toContain('Fill form from my profile');

      // Click "Writing" category pill
      const writingPill = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Writing'
      );
      expect(writingPill).toBeDefined();

      await act(async () => {
        writingPill?.click();
      });

      expect(container.textContent).toContain('Reply to this email politely');
      expect(container.textContent).not.toContain('Exam Notes');

      // Search input test
      const allPill = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'All'
      );
      await act(async () => {
        allPill?.click();
      });

      const searchInput = container.querySelector(
        'input[placeholder*="Search skills"]'
      ) as HTMLInputElement;

      await act(async () => {
        fireInput(searchInput, 'Hinglish');
      });

      expect(container.textContent).toContain('Explain in Hinglish');
      expect(container.textContent).not.toContain('Exam Notes');

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it('runs a skill when clicking Run Skill button and triggers callback', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onRunSkill = vi.fn();

      await act(async () => {
        root.render(React.createElement(SkillsDrawer, { onRunSkill }));
      });

      // Find "Run Skill" button on "Exam Notes" card
      const runButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('Run Skill')
      );
      expect(runButtons.length).toBeGreaterThan(0);

      await act(async () => {
        runButtons[0].click();
      });

      expect(onRunSkill).toHaveBeenCalled();
      const calledSkill = onRunSkill.mock.calls[0][0] as SavedSkill;
      expect(calledSkill.name).toBeDefined();

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it('creates a new custom skill via the modal', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(SkillsDrawer, {}));
      });

      // Click "New Skill" button
      const newSkillBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('New Skill')
      );
      expect(newSkillBtn).toBeDefined();

      await act(async () => {
        newSkillBtn?.click();
      });

      expect(container.textContent).toContain('Create Custom Skill');

      // Fill in modal form
      const nameInput = container.querySelector('input[placeholder*="Code Reviewer"]') as HTMLInputElement;
      const promptTextarea = container.querySelector('textarea') as HTMLTextAreaElement;

      expect(nameInput).toBeDefined();
      expect(promptTextarea).toBeDefined();

      await act(async () => {
        fireInput(nameInput, 'Research Paper Summarizer');
        fireInput(promptTextarea, 'Extract abstract, methodology, and limitations.');
      });

      // Submit form
      const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save Skill')
      );

      await act(async () => {
        saveBtn?.click();
      });

      expect(container.textContent).toContain('Research Paper Summarizer');

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });
  });
});
