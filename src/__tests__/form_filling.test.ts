// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAgentPlannerPrompt, parseAgentActionProposal } from '@/ai/prompts/agent_planner';
import { AgentOrchestrator } from '@/background/agent_orchestrator';
import { clearAllStorage, saveUserProfile, DEMO_USER_PROFILE } from '@/common/storage_adapter';
import { AIGateway } from '@/ai/ai_gateway';
import type { UserProfileMemory, AgentActionProposal } from '@/common/types';

describe('Automated Profile Form-Filling Engine (Task 4.2)', () => {
  beforeEach(async () => {
    await clearAllStorage();
    vi.restoreAllMocks();
  });

  describe('Prompt Construction & Field Mapping', () => {
    it('injects all user profile memory fields into the agent planner prompt', () => {
      const profile: UserProfileMemory = {
        personal: {
          fullName: 'Ananya Roy',
          email: 'ananya.roy@example.com',
          phone: '+91 9876543210',
          location: 'Kolkata, India',
        },
        academic: {
          institution: 'Jadavpur University',
          degree: 'Bachelor of Engineering',
          major: 'Electronics & Telecommunication',
          graduationYear: '2025',
        },
        professional: {
          skills: ['C++', 'Embedded Systems', 'IoT', 'Linux'],
          linkedInUrl: 'https://linkedin.com/in/ananyaroy',
          githubUrl: 'https://github.com/ananyaroy',
          portfolioUrl: 'https://ananya.dev',
        },
        preferences: {
          defaultLanguage: 'en',
          tone: 'formal',
        },
      };

      const actionMap = '#1 [input:text] "Full Name" (value: "")\n#2 [input:email] "Email" (value: "")';
      const { userPrompt, systemInstruction } = buildAgentPlannerPrompt(
        'Fill internship application form from my profile',
        actionMap,
        [],
        profile
      );

      // Verify all personal fields injected
      expect(userPrompt).toContain('Ananya Roy');
      expect(userPrompt).toContain('ananya.roy@example.com');
      expect(userPrompt).toContain('+91 9876543210');
      expect(userPrompt).toContain('Kolkata, India');

      // Verify all academic fields injected
      expect(userPrompt).toContain('Jadavpur University');
      expect(userPrompt).toContain('Bachelor of Engineering');
      expect(userPrompt).toContain('Electronics & Telecommunication');
      expect(userPrompt).toContain('2025');

      // Verify professional & preference fields injected
      expect(userPrompt).toContain('Embedded Systems');
      expect(userPrompt).toContain('https://linkedin.com/in/ananyaroy');
      expect(userPrompt).toContain('https://github.com/ananyaroy');
      expect(userPrompt).toContain('https://ananya.dev');
      expect(userPrompt).toContain('formal');

      // Verify explicit form-filling instructions in systemInstruction
      expect(systemInstruction).toContain('Profile Form-Filling Engine (Task 4.2)');
      expect(systemInstruction).toContain('Correlate each field with the User Profile Memory');
      expect(systemInstruction).toContain('Propose ONE field fill per step');
    });

    it('instructs sequential atomic field fills in Hinglish mode', () => {
      const actionMap = '#1 [input:text] "Name" (value: "")';
      const { systemInstruction, userPrompt } = buildAgentPlannerPrompt(
        'Form fill karo',
        actionMap,
        [],
        DEMO_USER_PROFILE,
        'hinglish'
      );

      expect(systemInstruction).toContain('Form-Filling Engine');
      expect(systemInstruction).toContain('ek-ek karke fill karein');
      expect(userPrompt).toContain('User Profile Memory');
    });

    it('strictly parses valid type action proposals with profile mapping reasons', () => {
      const rawOutput = JSON.stringify({
        action: 'type',
        target_id: 3,
        value: 'National Institute of Technology',
        reason: 'Typing college name from user profile into institution field',
        is_consequential: false,
      });

      const parsed = parseAgentActionProposal(rawOutput);
      expect(parsed.action).toBe('type');
      expect(parsed.target_id).toBe(3);
      expect(parsed.value).toBe('National Institute of Technology');
      expect(parsed.reason).toContain('Typing college name from user profile');
      expect(parsed.is_consequential).toBe(false);
    });
  });

  describe('Agent Orchestrator Sequential Form-Filling Lifecycle', () => {
    it('automatically retrieves stored profile and proposes sequential field fills with HITL approvals', async () => {
      // 1. Save profile to storage
      await saveUserProfile(DEMO_USER_PROFILE);

      // Mock tab messaging
      const tabMessages: any[] = [];
      const mockSendTabMessage = vi
        .spyOn(AgentOrchestrator as any, 'sendTabMessage')
        .mockImplementation((...args: any[]) => {
          const [_tabId, msg] = args;
          tabMessages.push(msg);
          if (msg.type === 'SCAN_INTERACTIVE_DOM') {
            return Promise.resolve({
              success: true,
              url: 'https://internships.example.com/apply',
              elements: [
                {
                  id: 1,
                  tag: 'input',
                  type: 'text',
                  label: 'Full Name',
                  value: '',
                  isVisible: true,
                },
                {
                  id: 2,
                  tag: 'input',
                  type: 'email',
                  label: 'Email Address',
                  value: '',
                  isVisible: true,
                },
                {
                  id: 3,
                  tag: 'input',
                  type: 'text',
                  label: 'College / University',
                  value: '',
                  isVisible: true,
                },
                {
                  id: 4,
                  tag: 'button',
                  label: 'Submit Application',
                  isVisible: true,
                },
              ],
            });
          }
          if (msg.type === 'EXECUTE_PAGE_ACTION') {
            return Promise.resolve({ success: true });
          }
          if (msg.type === 'CLEAR_BADGES') {
            return Promise.resolve({ success: true });
          }
          return Promise.resolve({ success: true });
        });

      // Mock LLM proposals: Step 1 = Name, Step 2 = Email, Step 3 = College, Step 4 = Submit (consequential)
      const proposal1: AgentActionProposal = {
        action: 'type',
        target_id: 1,
        value: 'Aarav Sharma',
        reason: 'Typing full name from user profile into field #1',
        is_consequential: false,
      };

      const proposal2: AgentActionProposal = {
        action: 'type',
        target_id: 2,
        value: 'aarav.sharma@example.com',
        reason: 'Typing email address from profile into field #2',
        is_consequential: false,
      };

      const proposal3: AgentActionProposal = {
        action: 'type',
        target_id: 3,
        value: 'National Institute of Technology',
        reason: 'Typing college name from profile into field #3',
        is_consequential: false,
      };

      const proposal4: AgentActionProposal = {
        action: 'click',
        target_id: 4,
        reason: 'Submitting completed application form',
        is_consequential: true,
      };

      const aiSpy = vi
        .spyOn(AIGateway, 'proposeNextAction')
        .mockResolvedValueOnce(proposal1)
        .mockResolvedValueOnce(proposal2)
        .mockResolvedValueOnce(proposal3)
        .mockResolvedValueOnce(proposal4);

      // Start form-filling errand (without passing options.profileMemory directly, tests auto-loading from storage)
      const session = await AgentOrchestrator.startTask(
        'Fill the application form with my profile information',
        100
      );

      // --- Step 1: Full Name proposal ---
      expect(session.currentStep).toBe(1);
      expect(session.status).toBe('AWAITING_APPROVAL');
      expect(session.pendingProposal?.target_id).toBe(1);
      expect(session.pendingProposal?.value).toBe('Aarav Sharma');
      expect(session.pendingProposal?.is_consequential).toBe(false);

      // User Approves Step 1
      const step2Session = await AgentOrchestrator.approveStep();

      // --- Step 2: Email Address proposal ---
      expect(step2Session.currentStep).toBe(2);
      expect(step2Session.status).toBe('AWAITING_APPROVAL');
      expect(step2Session.pendingProposal?.target_id).toBe(2);
      expect(step2Session.pendingProposal?.value).toBe('aarav.sharma@example.com');

      // User Approves Step 2
      const step3Session = await AgentOrchestrator.approveStep();

      // --- Step 3: College Name proposal ---
      expect(step3Session.currentStep).toBe(3);
      expect(step3Session.status).toBe('AWAITING_APPROVAL');
      expect(step3Session.pendingProposal?.target_id).toBe(3);
      expect(step3Session.pendingProposal?.value).toBe('National Institute of Technology');

      // User Approves Step 3
      const step4Session = await AgentOrchestrator.approveStep();

      // --- Step 4: Submit button proposal (consequential) ---
      expect(step4Session.currentStep).toBe(4);
      expect(step4Session.status).toBe('AWAITING_APPROVAL');
      expect(step4Session.pendingProposal?.target_id).toBe(4);
      expect(step4Session.pendingProposal?.action).toBe('click');
      expect(step4Session.pendingProposal?.is_consequential).toBe(true);

      expect(aiSpy).toHaveBeenCalledTimes(4);
      mockSendTabMessage.mockRestore();
    });
  });
});
