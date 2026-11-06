/**
 * Madadgar - HITL Agent Action Planner Prompt (Task 3.6)
 * Generates strict JSON action proposals for multi-step browser tasks
 * following the schema specified in architecture.md (Section 5.2).
 */

import type {
  AgentActionProposal,
  AgentActionType,
  AgentTaskStepHistory,
  UserProfileMemory,
  SupportedLanguage,
} from '@/common/types';

export interface AgentPlannerPromptResult {
  systemInstruction: string;
  userPrompt: string;
}

const VALID_ACTIONS: Set<AgentActionType> = new Set([
  'click',
  'type',
  'select',
  'scroll',
  'done',
  'fail',
]);

/**
 * Builds the system instruction and user prompt for proposing the next step
 */
export function buildAgentPlannerPrompt(
  goal: string,
  actionMap: string,
  history: AgentTaskStepHistory[] = [],
  profileMemory?: UserProfileMemory,
  language: SupportedLanguage = 'en'
): AgentPlannerPromptResult {
  const isHinglish = language === 'hinglish';

  const systemInstruction = isHinglish
    ? `Aap Madadgar ke Human-in-the-Loop Browser Agent hain.
Aapka kaam user ke goal ko step-by-step achieve karna hai. Webpage ke numbered Action Map ko dekhein aur agla single safe action propose karein.

Aapko STRICTLY valid JSON schema mein respond karna hai:
{
  "action": "click" | "type" | "select" | "scroll" | "done" | "fail",
  "target_id": <numeric_id_or_null>,
  "value": "<text_to_type_or_select_or_scroll_direction>",
  "reason": "<clear_one_sentence_explanation_in_Hinglish>",
  "is_consequential": true | false
}

Rules:
1. Ek waqt mein sirf EK step propose karein.
2. "target_id" numbered action map ke #<id> se match hona chahiye.
3. Agar form submit ho raha ho, payment ho rahi ho, ya delete action ho, toh "is_consequential": true set karein.
4. Agar goal achieve ho chuka hai, toh "action": "done" propose karein. Step 1 par ya jab tak goal ke interactions perform nahi hue hain, "done" propose na karein; pehla click ya type step propose karein.
5. Loop Prevention: Agar pichle step mein wohi button click kiya gaya tha aur page nahi badla, toh dobara wahi action propose na karein. Agar form submit nahi ho raha ya login fail ho raha hai, "fail" propose karein explanation ke saath.
6. Markdown code fences ke bina sirf raw JSON return karein.`
    : `You are Madadgar's Human-in-the-Loop Autonomous Browser Agent.
Your goal is to accomplish the user's task step-by-step by analyzing the numbered Action Map of the current webpage and proposing the single best next action.

You MUST respond strictly with a valid JSON object adhering to this schema:
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentActionProposal",
  "action": "click" | "type" | "select" | "scroll" | "done" | "fail",
  "target_id": <integer_or_null>,
  "value": "<string_or_undefined>",
  "reason": "<clear_one_sentence_plain_English_explanation>",
  "is_consequential": <boolean>
}

Core Rules:
1. Propose exactly ONE atomic action per step.
2. For "click": "target_id" must be an integer matching an element from the Action Map.
3. For "type": "target_id" must be the input/textarea ID, and "value" must be the text to type.
4. For "select": "target_id" must be the dropdown ID, and "value" must be the option text or value.
5. For "scroll": set "value" to "down", "up", "top", or "bottom".
6. If the user's overall goal is completed, output "action": "done" with a congratulatory reason. IMPORTANT: On Step 1 (or whenever the requested interactions have not yet been executed), DO NOT propose "done"; you MUST actively propose the click, type, select, or scroll step to perform the errand.
7. Set "is_consequential": true whenever an action submits a form, places an order, executes a delete, or makes a payment.
8. NEVER guess passwords, security codes, or credit card numbers. If encountered, set action to "fail" or ask the user.
9. Loop Prevention: DO NOT propose the exact same action and target_id repeatedly if it was already executed in recent steps and produced no state change or navigation. If a button was already clicked and the page is unchanged, do not click it again; analyze if an input field is missing, or conclude "fail" with an explanation.
10. Accurate Task Completion: DO NOT conclude "done" if the goal was to log in, submit, or search, but the page is still stuck on the initial unsubmitted form, login screen, or empty result page. Conclude "fail" with a clear reason instead of falsely claiming completion.
11. Return ONLY the JSON object. Do not enclose in markdown backticks or add introductory prose.`;

  // Format past steps history
  let historyBlock = '(No prior steps executed yet. This is Step 1.)';
  if (history.length > 0) {
    const lines = history.map((item) => {
      const outcome = item.result?.success ? 'Success' : `Failed: ${item.result?.error || 'unknown'}`;
      const valStr = item.action.value ? ` (value: "${item.action.value}")` : '';
      const targetStr = item.action.target_id ? ` on #${item.action.target_id}` : '';
      return `- Step ${item.step}: [${item.action.action}]${targetStr}${valStr} -> ${outcome} | Reason: ${item.action.reason}`;
    });
    historyBlock = lines.join('\n');
  }

  // Format local profile memory if available
  let profileBlock = '';
  if (profileMemory) {
    const personal = profileMemory.personal || {};
    const academic = profileMemory.academic || {};
    const professional = profileMemory.professional || {};

    const profileDetails: string[] = [];
    if (personal.fullName) profileDetails.push(`- Full Name: ${personal.fullName}`);
    if (personal.email) profileDetails.push(`- Email: ${personal.email}`);
    if (personal.phone) profileDetails.push(`- Phone: ${personal.phone}`);
    if (personal.location) profileDetails.push(`- Location: ${personal.location}`);
    if (academic.institution) profileDetails.push(`- University/School: ${academic.institution}`);
    if (academic.degree) profileDetails.push(`- Degree: ${academic.degree} (${academic.major || ''})`);
    if (professional.skills?.length) profileDetails.push(`- Skills: ${professional.skills.join(', ')}`);
    if (professional.linkedInUrl) profileDetails.push(`- LinkedIn: ${professional.linkedInUrl}`);
    if (professional.githubUrl) profileDetails.push(`- GitHub: ${professional.githubUrl}`);

    if (profileDetails.length > 0) {
      profileBlock = `\n\nUser Profile Memory (Available to fill relevant forms):\n${profileDetails.join('\n')}`;
    }
  }

  const userPrompt = `User Goal: "${goal.trim()}"

Previous Steps History:
${historyBlock}${profileBlock}

Active Page Numbered Action Map:
${actionMap}

Propose the single best next action in strict JSON:`;

  return { systemInstruction, userPrompt };
}

/**
 * Builds an error-correction prompt when the LLM outputs invalid JSON or schema violations
 */
export function buildErrorCorrectionPrompt(
  originalResponse: string,
  validationError: string
): { systemInstruction: string; userPrompt: string } {
  return {
    systemInstruction:
      'You are a JSON syntax and schema repair assistant. Output ONLY a valid JSON object matching the required AgentActionProposal schema.',
    userPrompt: `Your previous output could not be parsed or violated the required schema:
Error: ${validationError}

Your previous output was:
${originalResponse}

Please output ONLY the corrected JSON object now with no markdown fences:`,
  };
}

/**
 * Parses and strictly validates an AgentActionProposal from raw LLM output
 */
export function parseAgentActionProposal(rawResponse: string): AgentActionProposal {
  if (!rawResponse || !rawResponse.trim()) {
    throw new Error('Empty response received from agent planner.');
  }

  // 1. Strip markdown code fences if present
  let clean = rawResponse.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // 2. Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Regex fallback to extract outer JSON object
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error(`Model response is not valid JSON: "${clean.slice(0, 80)}..."`);
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Parsed response is not a valid JSON object.');
  }

  // 3. Validate 'action'
  const actionRaw = String(parsed.action || '').toLowerCase().trim();
  if (!VALID_ACTIONS.has(actionRaw as AgentActionType)) {
    throw new Error(
      `Invalid action "${actionRaw}". Must be one of: click, type, select, scroll, done, fail.`
    );
  }
  const action = actionRaw as AgentActionType;

  // 4. Validate 'reason'
  const reason =
    typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : `Executing ${action}`;

  // 5. Normalize 'target_id'
  let target_id: number | undefined;
  if (parsed.target_id !== undefined && parsed.target_id !== null) {
    const num = parseInt(String(parsed.target_id), 10);
    if (!isNaN(num)) {
      target_id = num;
    }
  } else if (parsed.targetId !== undefined && parsed.targetId !== null) {
    const num = parseInt(String(parsed.targetId), 10);
    if (!isNaN(num)) {
      target_id = num;
    }
  }

  // 6. Action-specific constraints
  if ((action === 'click' || action === 'type' || action === 'select') && target_id === undefined) {
    throw new Error(`Action "${action}" requires a valid numeric target_id.`);
  }

  // 7. Value normalization
  let value: string | undefined;
  if (parsed.value !== undefined && parsed.value !== null) {
    value = String(parsed.value);
  }

  // 8. is_consequential
  const is_consequential = Boolean(parsed.is_consequential || parsed.isConsequential);

  return {
    action,
    target_id,
    value,
    reason,
    is_consequential,
  };
}
