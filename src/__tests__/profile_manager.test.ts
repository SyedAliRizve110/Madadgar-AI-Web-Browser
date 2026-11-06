// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

// Configure React act environment for jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ProfileManager } from '@/sidepanel/components/ProfileManager';
import {
  getUserProfile,
  saveUserProfile,
  clearUserProfile,
  exportUserProfileJson,
  importUserProfileJson,
  clearAllStorage,
  DEMO_USER_PROFILE,
} from '@/common/storage_adapter';
import type { UserProfileMemory } from '@/common/types';

describe('Local Profile Memory Subsystem (Task 4.1)', () => {
  beforeEach(async () => {
    await clearAllStorage();
  });

  describe('Storage Layer & Persistence', () => {
    it('returns default empty profile memory when storage is empty', async () => {
      const profile = await getUserProfile();
      expect(profile).toBeDefined();
      expect(profile.personal.fullName).toBe('');
      expect(profile.personal.email).toBe('');
      expect(profile.academic.institution).toBe('');
      expect(profile.professional.skills).toEqual([]);
      expect(profile.preferences.defaultLanguage).toBe('en');
      expect(profile.preferences.tone).toBe('formal');
    });

    it('saves and retrieves complete user profile memory correctly', async () => {
      const testProfile: UserProfileMemory = {
        personal: {
          fullName: 'Priya Patel',
          email: 'priya.patel@example.com',
          phone: '+91 91234 56789',
          location: 'Pune, Maharashtra',
        },
        academic: {
          institution: 'COEP Technological University',
          degree: 'Bachelor of Technology',
          major: 'Information Technology',
          graduationYear: '2026',
        },
        professional: {
          skills: ['Python', 'Django', 'PostgreSQL', 'Docker'],
          linkedInUrl: 'https://linkedin.com/in/priyapatel',
          githubUrl: 'https://github.com/priyapatel',
          portfolioUrl: 'https://priya.tech',
        },
        preferences: {
          defaultLanguage: 'hinglish',
          tone: 'casual',
        },
      };

      await saveUserProfile(testProfile);
      const retrieved = await getUserProfile();

      expect(retrieved.personal.fullName).toBe('Priya Patel');
      expect(retrieved.personal.email).toBe('priya.patel@example.com');
      expect(retrieved.academic.institution).toBe('COEP Technological University');
      expect(retrieved.professional.skills).toContain('PostgreSQL');
      expect(retrieved.preferences.tone).toBe('casual');
      expect(retrieved.preferences.defaultLanguage).toBe('hinglish');
    });

    it('resets user profile memory back to blank defaults', async () => {
      await saveUserProfile(DEMO_USER_PROFILE);
      let profile = await getUserProfile();
      expect(profile.personal.fullName).toBe('Aarav Sharma');

      await clearUserProfile();
      profile = await getUserProfile();
      expect(profile.personal.fullName).toBe('');
      expect(profile.academic.institution).toBe('');
      expect(profile.professional.skills).toEqual([]);
    });

    it('exports profile memory to a valid formatted JSON string', async () => {
      await saveUserProfile(DEMO_USER_PROFILE);
      const json = await exportUserProfileJson();

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.personal.fullName).toBe('Aarav Sharma');
      expect(parsed.academic.degree).toContain('Bachelor of Technology');
      expect(parsed.professional.skills).toContain('React');
    });

    it('imports and validates JSON string into storage with fallback handling', async () => {
      const jsonToImport = JSON.stringify({
        personal: {
          fullName: 'Vikram Malhotra',
          email: 'vikram@example.com',
          phone: '+91 9988776655',
          location: 'Delhi, India',
        },
        academic: {
          college: 'IIT Delhi', // test alias support
          degree: 'M.Tech',
          major: 'Data Science',
          graduationYear: '2024',
        },
        professional: {
          skills: 'PyTorch, Machine Learning, Python', // test comma separated string support
          linkedInUrl: 'https://linkedin.com/in/vikram',
          githubUrl: 'https://github.com/vikram',
          portfolioUrl: '',
        },
        preferences: {
          defaultLanguage: 'en',
          tone: 'academic',
        },
      });

      const imported = await importUserProfileJson(jsonToImport);
      expect(imported.personal.fullName).toBe('Vikram Malhotra');
      expect(imported.academic.institution).toBe('IIT Delhi');
      expect(imported.professional.skills).toEqual(['PyTorch', 'Machine Learning', 'Python']);
      expect(imported.preferences.tone).toBe('academic');

      // Verify persisted in storage
      const saved = await getUserProfile();
      expect(saved.personal.fullName).toBe('Vikram Malhotra');
    });

    it('rejects invalid or corrupted JSON during import', async () => {
      await expect(importUserProfileJson('not a valid json string')).rejects.toThrow();
      await expect(importUserProfileJson('null')).rejects.toThrow('Invalid JSON format');
    });
  });

  describe('ProfileManager React Component UI', () => {
    it('renders header, completeness meter, and navigation tabs', () => {
      const html = renderToString(React.createElement(ProfileManager, {}));

      expect(html).toContain('Profile Memory');
      expect(html).toContain('Local-Only');
      expect(html).toContain('Profile Completeness');
      expect(html).toContain('Personal');
      expect(html).toContain('Academic');
      expect(html).toContain('Professional');
      expect(html).toContain('Preferences');
      expect(html).toContain('Sample Profile');
      expect(html).toContain('Save Profile');
    });

    it('renders personal details form by default', () => {
      const html = renderToString(React.createElement(ProfileManager, {}));

      expect(html).toContain('Full Name');
      expect(html).toContain('Email Address');
      expect(html).toContain('Phone Number');
      expect(html).toContain('Current Location / City');
    });

    it('interactively switches tabs, loads demo profile, and handles save', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onProfileUpdated = vi.fn();

      await act(async () => {
        root.render(React.createElement(ProfileManager, { onProfileUpdated }));
      });

      // 1. Check initially loaded Personal tab
      expect(container.textContent).toContain('Full Name');

      // 2. Click "Academic" tab button
      const academicBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Academic')
      );
      expect(academicBtn).toBeDefined();

      await act(async () => {
        academicBtn?.click();
      });

      expect(container.textContent).toContain('College / University');
      expect(container.textContent).toContain('Degree / Qualification');
      expect(container.textContent).toContain('Major / Field of Study');

      // 3. Click "Professional" tab button
      const profBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Professional')
      );
      await act(async () => {
        profBtn?.click();
      });

      expect(container.textContent).toContain('Key Skills & Technologies');
      expect(container.textContent).toContain('LinkedIn Profile URL');
      expect(container.textContent).toContain('GitHub Profile URL');

      // 4. Click "Preferences" tab button
      const prefBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Preferences')
      );
      await act(async () => {
        prefBtn?.click();
      });

      expect(container.textContent).toContain('Writing Tone for Application Answers');
      expect(container.textContent).toContain('Deterministic Privacy Guarantee');

      // 5. Click "Sample Profile" button
      const demoBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Sample Profile')
      );
      await act(async () => {
        demoBtn?.click();
      });

      // Switch back to Personal tab to check loaded values
      const personalBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Personal')
      );
      await act(async () => {
        personalBtn?.click();
      });

      const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(nameInput.value).toBe('Aarav Sharma');

      // Completeness should now be 100%
      expect(container.textContent).toContain('100%');

      // 6. Click "Save Profile"
      const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save Profile')
      );
      await act(async () => {
        saveBtn?.click();
      });

      expect(onProfileUpdated).toHaveBeenCalled();
      const savedInStorage = await getUserProfile();
      expect(savedInStorage.personal.fullName).toBe('Aarav Sharma');

      // Cleanup
      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it('interactively adds and removes skills via tag chips', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(ProfileManager, {}));
      });

      // Switch to Professional tab
      const profBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Professional')
      );
      await act(async () => {
        profBtn?.click();
      });

      // Find skill input and Add button
      const skillInput = container.querySelector(
        'input[placeholder*="Type skill"]'
      ) as HTMLInputElement;
      const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add')
      );

      expect(skillInput).toBeDefined();
      expect(addBtn).toBeDefined();

      // Add "React"
      await act(async () => {
        skillInput.value = 'React';
        skillInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        addBtn?.click();
      });

      expect(container.textContent).toContain('React');

      // Add "TypeScript"
      await act(async () => {
        skillInput.value = 'TypeScript';
        skillInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        addBtn?.click();
      });

      expect(container.textContent).toContain('TypeScript');

      // Remove "React"
      const removeReactBtn = container.querySelector(
        'button[title="Remove React"]'
      ) as HTMLButtonElement;
      expect(removeReactBtn).toBeDefined();

      await act(async () => {
        removeReactBtn?.click();
      });

      expect(container.textContent).not.toContain('Remove React');
      expect(container.textContent).toContain('TypeScript');

      // Cleanup
      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it('prompts confirmation dialog and resets profile when user clears', async () => {
      // First save sample profile
      await saveUserProfile(DEMO_USER_PROFILE);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(ProfileManager, {}));
      });

      // Initial name should be Aarav Sharma
      const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(nameInput.value).toBe('Aarav Sharma');

      // Find Reset/Trash button
      const trashBtn = container.querySelector(
        'button[title="Reset profile to blank"]'
      ) as HTMLButtonElement;
      expect(trashBtn).toBeDefined();

      // Click Trash
      await act(async () => {
        trashBtn.click();
      });

      expect(container.textContent).toContain('Reset all saved profile fields to blank?');

      // Confirm Reset
      const confirmResetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Yes, Reset')
      );
      await act(async () => {
        confirmResetBtn?.click();
      });

      expect(nameInput.value).toBe('');
      const inStorage = await getUserProfile();
      expect(inStorage.personal.fullName).toBe('');

      // Cleanup
      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });
  });
});
