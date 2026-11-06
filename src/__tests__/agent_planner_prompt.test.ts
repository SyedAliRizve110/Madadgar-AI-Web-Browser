import { describe, it, expect } from 'vitest';
import {
  buildAgentPlannerPrompt,
  parseAgentActionProposal,
  buildErrorCorrectionPrompt,
} from '@/ai/prompts/agent_planner';
import type { AgentTaskStepHistory, UserProfileMemory } from '@/common/types';

describe('Agent Planner Prompt & Strict Parser (Task 3.6)', () => {
  describe('buildAgentPlannerPrompt', () => {
    it('constructs prompt with goal and action map adhering to JSON schema rules', () => {
      const { systemInstruction, userPrompt } = buildAgentPlannerPrompt(
        'Submit the application form',
        '#1 [input:text] "Full Name"\n#2 [button] "Submit"'
      );

      expect(systemInstruction).toContain('AgentActionProposal');
      expect(systemInstruction).toContain('"action"');
      expect(systemInstruction).toContain('"click" | "type" | "select"');
      expect(userPrompt).toContain('Submit the application form');
      expect(userPrompt).toContain('#1 [input:text] "Full Name"');
      expect(userPrompt).toContain('#2 [button] "Submit"');
    });

    it('includes previous steps history in prompt', () => {
      const history: AgentTaskStepHistory[] = [
        {
          step: 1,
          action: { action: 'type', target_id: 1, value: 'Alice', reason: 'Entered name' },
          result: { success: true, action: 'type', targetId: 1 },
          timestamp: Date.now(),
        },
      ];

      const { userPrompt } = buildAgentPlannerPrompt(
        'Fill form',
        '#2 [button] "Continue"',
        history
      );

      expect(userPrompt).toContain('Step 1: [type] on #1 (value: "Alice") -> Success');
      expect(userPrompt).toContain('Entered name');
    });

    it('injects user profile memory to guide form filling', () => {
      const profile: UserProfileMemory = {
        personal: {
          fullName: 'Syed Ali',
          email: 'ali@example.com',
          phone: '+91-9999999999',
          location: 'Hyderabad, India',
        },
        academic: {
          institution: 'Tech University',
          degree: 'B.Tech',
          graduationYear: '2026',
          major: 'CS',
        },
        professional: {
          skills: ['TypeScript', 'React', 'Python'],
          linkedInUrl: 'https://linkedin.com/in/test',
          githubUrl: 'https://github.com/test',
          portfolioUrl: 'https://portfolio.test',
        },
        preferences: {
          defaultLanguage: 'en',
          tone: 'formal',
        },
      };

      const { userPrompt } = buildAgentPlannerPrompt('Fill profile', '#1 [input:text] "Name"', [], profile);

      expect(userPrompt).toContain('Syed Ali');
      expect(userPrompt).toContain('ali@example.com');
      expect(userPrompt).toContain('Tech University');
      expect(userPrompt).toContain('TypeScript');
    });

    it('supports Hinglish language instruction tone', () => {
      const { systemInstruction } = buildAgentPlannerPrompt(
        'Apply for job',
        '#1 [button] "Apply"',
        [],
        undefined,
        'hinglish'
      );

      expect(systemInstruction).toContain('Madadgar ke Human-in-the-Loop Browser Agent');
      expect(systemInstruction).toContain('STRICTLY valid JSON schema');
    });
  });

  describe('parseAgentActionProposal', () => {
    it('parses valid click proposal correctly', () => {
      const json = JSON.stringify({
        action: 'click',
        target_id: 5,
        reason: 'Clicking continue button to proceed',
        is_consequential: false,
      });

      const parsed = parseAgentActionProposal(json);
      expect(parsed.action).toBe('click');
      expect(parsed.target_id).toBe(5);
      expect(parsed.reason).toBe('Clicking continue button to proceed');
      expect(parsed.is_consequential).toBe(false);
    });

    it('parses valid type proposal with value', () => {
      const json = JSON.stringify({
        action: 'type',
        target_id: 3,
        value: 'john.doe@example.com',
        reason: 'Typing email address into email input field',
        is_consequential: false,
      });

      const parsed = parseAgentActionProposal(json);
      expect(parsed.action).toBe('type');
      expect(parsed.target_id).toBe(3);
      expect(parsed.value).toBe('john.doe@example.com');
    });

    it('parses markdown code block enclosed JSON', () => {
      const markdown = `\`\`\`json
{
  "action": "click",
  "target_id": 9,
  "reason": "Proceeding to checkout",
  "is_consequential": true
}
\`\`\``;

      const parsed = parseAgentActionProposal(markdown);
      expect(parsed.action).toBe('click');
      expect(parsed.target_id).toBe(9);
      expect(parsed.is_consequential).toBe(true);
    });

    it('rejects unsupported actions', () => {
      const invalid = JSON.stringify({
        action: 'destroy',
        target_id: 1,
        reason: 'Invalid action',
      });

      expect(() => parseAgentActionProposal(invalid)).toThrow(/Invalid action "destroy"/);
    });

    it('rejects click/type/select actions without target_id', () => {
      const missingTarget = JSON.stringify({
        action: 'type',
        value: 'Hello',
        reason: 'Typing without target ID',
      });

      expect(() => parseAgentActionProposal(missingTarget)).toThrow(/requires a valid numeric target_id/);
    });

    it('rejects non-JSON output', () => {
      expect(() => parseAgentActionProposal('Just click the red button on screen.')).toThrow(
        /not valid JSON/
      );
    });
  });

  describe('buildErrorCorrectionPrompt', () => {
    it('generates repair prompt containing previous output and error reason', () => {
      const broken = '{ action: click, target: "five" }';
      const repair = buildErrorCorrectionPrompt(broken, 'Unexpected token c in JSON at position 10');

      expect(repair.systemInstruction).toContain('JSON syntax and schema repair');
      expect(repair.userPrompt).toContain(broken);
      expect(repair.userPrompt).toContain('Unexpected token c');
    });
  });
});

