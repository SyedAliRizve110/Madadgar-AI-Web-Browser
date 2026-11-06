# Madadgar: Phase-Wise Implementation Plan
**Document Version:** 1.0  
**Project Spec Reference:** `docs/problemstatement.md`  
**Architecture Reference:** `docs/architecture.md`  
**Target Completion:** 4 Weeks  
**Execution Strategy:** Incremental Vertical Slices  

---

## 1. Execution Strategy & Technical Stack

The implementation of **Madadgar** follows an incremental, test-driven **vertical slice architecture**. Instead of building horizontal layers (e.g., all UI first, then all backend), each slice implements a complete end-to-end user capability—from page DOM inspection through LLM reasoning to the Side Panel UI.

### Technology Stack & Tooling Choices
* **Extension Standard:** Chrome Extensions Manifest V3 (MV3).
* **Language & Runtime:** TypeScript (strict mode enabled).
* **Build System & Bundler:** Vite + `@crxjs/vite-plugin` (fast HMR for extension development and optimized production bundling).
* **UI Framework:** React 18 + Tailwind CSS + Lucide Icons (lightweight, zero runtime bloat inside the Side Panel).
* **Content Extraction:** `@mozilla/readability` (DOM article purification).
* **AI Provider SDKs / Clients:** Direct fetch requests to Google Gemini REST API (v1beta) and Groq REST API (eliminating heavy external SDK dependencies inside the extension bundle).
* **State & Persistence:** `chrome.storage.local` with type-safe wrappers.

---

## 2. Master Implementation Roadmap

```
├── Phase 1 (Week 1): Foundation & Reading ("The Eyes")
│   ├── Task 1.1: Project Scaffolding & Build Tooling
│   ├── Task 1.2: Manifest V3 Shell, Service Worker & Side Panel Mount
│   ├── Task 1.3: Local Storage Layer & API Key Settings UI
│   ├── Task 1.4: AI Gateway & Gemini 2.5 Flash-Lite Client
│   ├── Task 1.5: Article Extraction Engine (Readability.js)
│   ├── Task 1.6: Public YouTube Transcript & Caption Parser
│   └── Task 1.7: Structured Summarizer UI & Bilingual Toggle (English/Hinglish)
│
├── Phase 2 (Week 2): Page Understanding & Vision ("The Brain")
│   ├── Task 2.1: Active Tab Context Extractor & Bi-directional Port
│   ├── Task 2.2: Grounded Page Chat Engine with Streaming QA
│   ├── Task 2.3: Chrome Context Menu Integrations (Explain, Translate, Draft)
│   ├── Task 2.4: Multimodal Screen Inspection (captureVisibleTab + Gemini Vision)
│   └── Task 2.5: Free-Tier Resilience Engine (429 Retries & Groq Fallback)
│
├── Phase 3 (Week 3): Human-in-the-Loop Browser Actions ("The Hands")
│   ├── Task 3.1: Interactive DOM Scanner & Unique ID Indexer
│   ├── Task 3.2: Zero-Interference Numbered Badge & Highlighter Overlay
│   ├── Task 3.3: Token-Optimized Action Map Serializer
│   ├── Task 3.4: "Find It For Me" Natural Language Element Locator
│   ├── Task 3.5: Safe Synthetic Event Action Executor
│   ├── Task 3.6: HITL Agent Orchestrator Finite State Machine (FSM)
│   ├── Task 3.7: Step Approval UI Card [Approve | Skip | Stop | Dry-Run]
│   ├── Task 3.8: MV3 Worker Dormancy Persistence & State Rehydration
│   └── Task 3.9: Action Audit Log & Practice Errand Test Suite
│
└── Phase 4 (Week 4): Memory, Deterministic Safety & Shipping
    ├── Task 4.1: Local Profile Memory Subsystem
    ├── Task 4.2: Automated Profile Form-Filling Engine
    ├── Task 4.3: Saved Skills Catalog & Prompt Recipe Import/Export
    ├── Task 4.4: Deterministic Code-Level Safety Guardrails
    │   ├── 4.4.1: Banking / UPI / Financial Domain Blacklist
    │   ├── 4.4.2: Sensitive Field & Credential Shield (Password/OTP/Cards)
    │   ├── 4.4.3: Consequential Action Interceptor Gate
    │   └── 4.4.4: Immediate Kill Switch
    └── Task 4.5: Release Packaging, Distribution ZIP & Documentation
```

---

## 3. Phase 1 (Week 1): Foundation & Web Reading ("The Eyes")

### Objective
Establish the Manifest V3 foundation, wire up the Chrome Side Panel, securely store user API keys, extract clean page content via `Readability.js`, retrieve public YouTube transcripts, and generate structured summaries in English and Hinglish.

---

### Task 1.1: Project Scaffolding & Tooling Setup
- **Deliverables:**
  - Initialize `package.json` with scripts: `dev`, `build`, `test`, `lint`.
  - Install dev dependencies: `vite`, `@crxjs/vite-plugin`, `typescript`, `@types/chrome`, `tailwindcss`, `postcss`, `autoprefixer`, `lucide-react`.
  - Configure `tsconfig.json` with strict type checking and forward path aliases (`@/` -> `src/`).
  - Configure `vite.config.ts` with CRXJS targeting Chrome Manifest V3.
  - Setup Tailwind CSS in `src/sidepanel/styles/globals.css`.
- **Target Files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`.

---

### Task 1.2: Manifest V3 Shell, Background Worker & Side Panel Mount
- **Deliverables:**
  - Write `src/manifest.json`:
    - `manifest_version: 3`
    - Permissions: `sidePanel`, `storage`, `activeTab`, `scripting`, `contextMenus`, `tabs`.
    - Host permissions: `https://generativelanguage.googleapis.com/*`, `https://api.groq.com/*`, `*://*/*`.
    - Background service worker: `src/background/service_worker.ts`.
    - Side panel path: `src/sidepanel/index.html`.
  - Implement `service_worker.ts` with open side panel listener on extension action click:
    ```typescript
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    ```
  - Mount simple React shell inside `src/sidepanel/index.html` and `src/sidepanel/App.tsx`.
- **Target Files:** `src/manifest.json`, `src/background/service_worker.ts`, `src/sidepanel/index.html`, `src/sidepanel/App.tsx`.

---

### Task 1.3: Local Storage Layer & API Key Settings UI
- **Deliverables:**
  - Create async storage wrapper `src/common/storage_adapter.ts` for `chrome.storage.local`.
  - Implement `SettingsModal.tsx` in the Side Panel allowing the user to input and test:
    - Google Gemini API Key.
    - Groq API Key (optional fallback).
    - Preferred default language (English / Hinglish).
  - Implement validation ping to Gemini API to verify key validity before saving.
  - Assert zero network calls to 3rd-party loggers or telemetry.
- **Target Files:** `src/common/storage_adapter.ts`, `src/sidepanel/components/SettingsModal.tsx`.

---

### Task 1.4: AI Gateway & Gemini 2.5 Flash-Lite Client
- **Deliverables:**
  - Build `src/ai/gemini_client.ts` implementing direct HTTP calls to `v1beta/models/gemini-2.5-flash-lite:generateContent`.
  - Support streaming responses using Server-Sent Events (`alt=sse`) for low-latency Side Panel rendering.
  - Create prompt templates in `src/ai/prompts/summarizer.ts` enforcing:
    1. One-line TL;DR.
    2. Five bullet points of key takeaways.
    3. Actionable next steps.
- **Target Files:** `src/ai/gemini_client.ts`, `src/ai/prompts/summarizer.ts`, `src/ai/ai_gateway.ts`.

---

### Task 1.5: Content Extraction Engine (Readability.js)
- **Deliverables:**
  - Implement content script extractor in `src/content/extractor.ts` using `@mozilla/readability`.
  - Strip layout chrome, advertising tags, navbars, and hidden overlays.
  - Register message listener `EXTRACT_READABILITY_CONTENT` returning `{ title, textContent, byline, length }`.
  - Ensure graceful fallback if the target page has no article body (extract top-level visible text nodes).
- **Target Files:** `src/content/extractor.ts`, `src/content/index.ts`.

---

### Task 1.6: Public YouTube Transcript & Caption Parser
- **Deliverables:**
  - Implement YouTube video detector: identify `youtube.com/watch?v=...` and `youtu.be/...`.
  - In `src/content/extractor.ts`, extract video ID and retrieve transcript using either caption track scraping from the active player DOM or public player response metadata.
  - Format transcript into timestamped segments (`[mm:ss] text`).
  - Create summary prompt instructing Gemini to output chapter-style notes with clickable timestamps.
- **Target Files:** `src/content/extractor.ts`, `src/sidepanel/components/SummaryCard.tsx`.

---

### Task 1.7: Structured Summarizer UI & Bilingual Toggle
- **Deliverables:**
  - Build `SummaryCard.tsx` in Side Panel with clean UI tabs:
    - **Article / Video Details** (title, source, word count / duration).
    - **TL;DR Callout Box**.
    - **5 Key Highlights List**.
    - **Action Items / Next Steps Checklist**.
  - Add quick-switch **English / Hinglish** segmented control toggle.
  - In Hinglish mode, instruct the prompt: *"Explain in colloquial, conversational Hindi written in Roman script (Hinglish), mixing natural Hindi phrasing with English technical terms."*
- **Target Files:** `src/sidepanel/components/SummaryCard.tsx`, `src/sidepanel/App.tsx`.

---

### Phase 1 Acceptance Criteria & Verification
- [ ] Extension builds cleanly (`npm run build`) and loads in Chrome via *Load unpacked*.
- [ ] Side panel opens reliably upon clicking the extension toolbar icon.
- [ ] API keys can be saved, updated, and verified through Settings without hardcoded strings.
- [ ] Standard web articles (e.g. Wikipedia, blogs, news) summarize accurately into the 3 required sections.
- [ ] Public YouTube video links produce chapter summaries with functional timestamp references.
- [ ] Switching between English and Hinglish re-generates or renders output accurately.

---

## 4. Phase 2 (Week 2): Contextual Understanding & Multimodal QA ("The Brain")

### Objective
Turn Madadgar into a contextual browser intelligence layer that answers questions grounded strictly in the active page's content, provides right-click context menu actions, inspects visual charts/diagrams via visible tab screenshots, and gracefully handles free-tier rate limits.

---

### Task 2.1: Active Tab Context Extractor & Bi-directional Port
- **Deliverables:**
  - Setup persistent `chrome.runtime.Port` between `SidePanel` and `service_worker.ts` for bidirectional streaming.
  - Create `src/background/message_bus.ts` providing strongly typed messaging:
    - `GET_PAGE_CONTEXT` $\rightarrow$ retrieves current title, URL, selection, and readable text.
  - Track tab switches using `chrome.tabs.onActivated` so the Side Panel updates or offers to sync context when navigating between tabs.
- **Target Files:** `src/background/message_bus.ts`, `src/sidepanel/hooks/useTabContext.ts`.

---

### Task 2.2: Grounded Page Chat Engine with Streaming QA
- **Deliverables:**
  - Implement `ChatView.tsx` with chat history, user prompt input, and markdown message bubbles.
  - Design grounded system prompt in `src/ai/prompts/grounded_qa.ts`:
    - Strict instruction: *"Answer strictly from the provided page context. If the answer is not contained in the page, explicitly state: 'This information is not present on the current page.' Do not invent external facts."*
  - Connect Gemini streaming endpoint to pipe response tokens directly into the chat bubble.
  - Maintain active conversation history in React state with a "Clear Chat" action.
- **Target Files:** `src/sidepanel/components/ChatView.tsx`, `src/ai/prompts/grounded_qa.ts`.

---

### Task 2.3: Chrome Context Menu Integrations (Status: COMPLETED)
- **Deliverables:**
  - In `src/background/context_menus.ts`, register context menu items on install:
    1. `madadgar_explain`: *"Madadgar: Explain this"*
    2. `madadgar_translate`: *"Madadgar: Translate"*
    3. `madadgar_draft`: *"Madadgar: Draft a reply"*
  - Capture selected text and pass it to the Side Panel via runtime message.
  - If the Side Panel is closed, open it programmatically using `chrome.sidePanel.open()`.
  - Automatically populate and execute the requested prompt in the Side Panel.
- **Target Files:** `src/background/context_menus.ts`, `src/background/service_worker.ts`.

---

### Task 2.4: Multimodal Visual Inspection ("Screenshot-and-Ask") (Status: COMPLETED)
- **Deliverables:**
  - Implement `src/background/screen_capture.ts` invoking `chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 })`.
  - Add visual prompt modal in the Side Panel allowing the user to:
    - Capture the visible viewport.
    - Ask questions about visual elements (e.g., charts, graphics, UI diagrams, error codes).
  - Route visual requests to `gemini-2.5-flash` with the base64-encoded image attached.
  - Implement client-side image downscaling (max dimension 1280px) to prevent payload bloat.
- **Target Files:** `src/background/screen_capture.ts`, `src/sidepanel/components/ScreenshotModal.tsx`, `src/ai/gemini_client.ts`.

---

### Task 2.5: Free-Tier Resilience & Fallback Engine (Status: COMPLETED)
- **Deliverables:**
  - Build `src/ai/ai_gateway.ts` failover controller:
    - Intercept HTTP 429 ("Too Many Requests") and HTTP 503 from Gemini.
    - Implement exponential backoff retry (1.5s delay, max 2 retries).
    - If Gemini text quotas are exhausted, seamlessly redirect text tasks to `src/ai/groq_client.ts` using Groq's free-tier `llama-3.3-70b-versatile` endpoint.
  - If all providers fail or are rate-limited, display a non-blocking banner with a countdown timer rather than throwing uncaught errors.
- **Target Files:** `src/ai/ai_gateway.ts`, `src/ai/groq_client.ts`, `src/sidepanel/components/RateLimitBanner.tsx`.

---

### Phase 2 Acceptance Criteria & Verification
- [x] User can chat freely with the current page; answers cite page text and admit when information is missing. (Task 2.2)
- [x] Right-clicking highlighted text offers *Explain*, *Translate*, and *Draft a reply*, routing directly into the Side Panel. (Task 2.3)
- [x] Taking a screenshot sends an optimized image to Gemini Flash and correctly interprets charts, tables, or diagrams. (Task 2.4)
- [x] Rate limits (simulated via 429 mock or quota limit) cleanly trigger retry and failover to Groq without crashing the UI. (Task 2.5)

---

## 5. Phase 3 (Week 3): Human-in-the-Loop Browser Actions ("The Hands")

### Objective
Provide safe, controlled computer-use capabilities by scanning interactive page elements, generating numbered action maps, proposing single actions in strict JSON, requiring explicit user approval at every step, and supporting progress persistence across worker sleep.

---

### Task 3.1: Interactive DOM Scanner & Unique Indexer
- **Deliverables:**
  - Create `src/content/scanner.ts`:
    - Query target selectors: `button`, `a[href]`, `input`, `textarea`, `select`, `[role="button"]`, `[role="link"]`, `[tabindex="0"]`.
    - Filter non-visible elements (`offsetParent === null`, `display === 'none'`, zero bounding rectangle).
    - Assign sequential IDs (`1`, `2`, `3`...).
    - Extract semantic properties: tag, type, name, placeholder, label, accessible name, current value.
  - Handle SPAs by attaching a debounced `MutationObserver` to re-index when significant DOM updates occur.
- **Target Files:** `src/content/scanner.ts`.

---

### Task 3.2: Zero-Interference Numbered Badge & Highlighter Overlay
- **Deliverables:**
  - Create `src/content/overlay.ts`:
    - Inject a single root container `#madadgar-overlay-root` inside a closed Shadow DOM to avoid styling conflicts with host sites.
    - Render compact badges (e.g. `[1]`, `[2]`) anchored to element bounding rect coordinates (`getBoundingClientRect()`).
    - Render a prominent visual highlight box (green for proposed actions, orange for dry-run inspection) around the active target.
  - Implement `CLEAR_BADGES` and `UPDATE_BADGE_COORDINATES` on window resize or scroll.
- **Target Files:** `src/content/overlay.ts`.

---

### Task 3.3: Token-Optimized Action Map Serializer
- **Deliverables:**
  - Build `src/ai/token_optimizer.ts` to convert the scanned DOM into a compact representation for LLM prompts:
    ```
    #1 [input:text] "Full Name" (value: "")
    #2 [input:email] "Email Address" (value: "")
    #3 [button] "Submit Application"
    ```
  - Strip redundant tags, inline styles, and unlabelled divs to conserve prompt tokens.
- **Target Files:** `src/ai/token_optimizer.ts`.

---

### Task 3.4: "Find It For Me" Natural Language Element Locator
- **Deliverables:**
  - Allow users to ask queries like: *"Where do I upload my resume?"* or *"Where is the pricing table?"*.
  - Prompt Gemini Flash-Lite with the Action Map and structured output schema:
    `{ "target_id": 4, "reason": "The file input with label 'Upload Resume'" }`
  - Content script scrolls target element into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) and pulses the badge without clicking it.
- **Target Files:** `src/ai/prompts/agent_planner.ts`, `src/content/overlay.ts`.

---

### Task 3.5: Safe Synthetic Event Action Executor
- **Deliverables:**
  - Implement `src/content/executor.ts` supporting action types:
    - `click`: Focus element $\rightarrow$ dispatch `mousedown`, `mouseup`, `click`.
    - `type`: Focus element $\rightarrow$ clear existing value if needed $\rightarrow$ dispatch `input`, `change`, `blur` (updating native value setters for React/Vue inputs).
    - `select`: Update dropdown value $\rightarrow$ dispatch `change` event.
    - `scroll`: Scroll element or viewport up/down.
    - `done`: Mark task as successfully achieved.
  - Return execution status (`success: boolean, error?: string`) back to the service worker.
- **Target Files:** `src/content/executor.ts`.

---

### Task 3.6: HITL Agent Orchestrator Finite State Machine (FSM)
- **Deliverables:**
  - Implement `src/background/agent_orchestrator.ts` managing the step loop:
    1. Scan page $\rightarrow$ 2. Build action map $\rightarrow$ 3. Request LLM proposal $\rightarrow$ 4. Validate safety $\rightarrow$ 5. Prompt user $\rightarrow$ 6. Wait for approval $\rightarrow$ 7. Execute $\rightarrow$ 8. Verify.
  - Strict JSON enforcement: Validate LLM output against the schema defined in `architecture.md` (Section 5.2). If malformed, retry with error correction prompt.
  - Maximum Step Cap: Hard-coded limit (default: 15 steps per task) preventing endless loops.
- **Target Files:** `src/background/agent_orchestrator.ts`.

---

### Task 3.7: Step Approval UI Card & Agent Pilot
- **Deliverables:**
  - Build `ActionCard.tsx` in the Side Panel:
    - Display current Step number (e.g., *Step 3 of 15*).
    - Show target element badge number and human-readable action description.
    - Show AI's reasoning: *"Typing college name from your profile into field #4."*
    - Three primary buttons:
      - **Approve (Green)**: Executes the proposed action.
      - **Skip (Yellow)**: Advances to next step without performing this action.
      - **Stop (Red)**: Immediately cancels the errand.
    - **Dry-Run Mode Toggle**: When enabled, outlines the element on the page without performing the real click/type.
- **Target Files:** `src/sidepanel/components/ActionCard.tsx`, `src/sidepanel/components/AgentPilot.tsx`.

---

### Task 3.8: MV3 Worker Dormancy Persistence & State Rehydration
- **Deliverables:**
  - In `src/common/storage_adapter.ts`, maintain an `active_task_session` key.
  - Before waiting for user approval or executing an asynchronous LLM request, write the entire serialized FSM state (task ID, step index, history, pending proposal) to `chrome.storage.local`.
  - Upon user action or worker wake-up, inspect storage and rehydrate the FSM seamlessly.
- **Target Files:** `src/background/agent_orchestrator.ts`, `src/common/storage_adapter.ts`.

---

### Task 3.9: Action Audit Log & Practice Errand Validation
- **Deliverables:**
  - Build `AuditLog.tsx` displaying the chronologically ordered list of actions proposed, reasons, and whether the user chose Approved, Skipped, or Stopped.
  - Provide a test fixture / practice environment:
    - Multi-step form filling practice page.
    - Practice ecommerce search and filter page.
  - Verify two complete end-to-end multi-step errands.
- **Target Files:** `src/sidepanel/components/AuditLog.tsx`, `src/common/types.ts`.

---

### Phase 3 Acceptance Criteria & Verification
- [ ] Numbered badges overlay accurately on visible interactive buttons, links, and inputs.
- [ ] Natural language element finding ("Where do I...") identifies and highlights the right element.
- [ ] LLM proposes actions one step at a time in strict structured JSON.
- [ ] Zero browser actions occur without the user clicking **Approve**.
- [ ] Dry-run toggle highlights without clicking or typing.
- [ ] The agent loop survives background worker sleep/wake cycles without losing state.
- [ ] Complete at least 2 practice errands with approval at every step.

---

## 6. Phase 4 (Week 4): Memory, Deterministic Safety & Shipping

### Objective
Add local profile memory, reusable saved skills with import/export, enforce deterministic code-level safety guardrails, and prepare clean public release packages for installation.

---

### Task 4.1: Local Profile Memory Subsystem
- **Deliverables:**
  - Create profile data schema in `src/common/types.ts`:
    - Personal: Full Name, Email, Phone, Location.
    - Academic: College / University, Degree, Major, Graduation Year.
    - Professional: Key Skills, LinkedIn, GitHub, Portfolio URLs.
    - Preferences: Tone (formal/casual), Language (en/hinglish).
  - Build `ProfileManager.tsx` in Side Panel allowing full CRUD operations.
  - Store profile strictly in `chrome.storage.local` with zero outbound synchronization.
- **Target Files:** `src/common/types.ts`, `src/sidepanel/components/ProfileManager.tsx`.

---

### Task 4.2: Automated Profile Form-Filling Engine
- **Deliverables:**
  - Implement form-filling skill: when triggered, the agent inspects page input fields and correlates them with the user's stored profile fields.
  - Model proposes values mapped from the local profile.
  - Each field fill proposal is displayed individually in the HITL approval card for user sign-off.
- **Target Files:** `src/ai/prompts/agent_planner.ts`, `src/background/agent_orchestrator.ts`.

---

### Task 4.3: Saved Skills Catalog & Prompt Recipe Import/Export
- **Deliverables:**
  - Create `SkillsDrawer.tsx` with default curated one-click skills:
    1. *Exam Notes* (structured revision notes with key formulas/concepts).
    2. *Explain in Hinglish* (simple conversational translation).
    3. *Reply to this email politely* (professional draft).
    4. *Fill form from my profile* (pre-populates form fields).
  - Add "Create Custom Skill" modal allowing users to save custom prompt templates.
  - Implement **Export Skills** (downloads `madadgar-skills.json`) and **Import Skills** (file picker upload & schema validator).
- **Target Files:** `src/sidepanel/components/SkillsDrawer.tsx`, `src/common/types.ts`.

---

### Task 4.4: Deterministic Code-Level Safety Guardrails
Enforce non-negotiable safety guardrails directly in TypeScript code:

#### 4.4.1: Banking / UPI / Financial Domain Blacklist
- In `src/safety/domain_rules.ts`, maintain a pattern matcher for banking and payment domains (`*.onlinesbi.com`, `*.hdfcbank.com`, `*paytm.com`, `*razorpay.com`, `*paypal.com`, `*stripe.com`, etc.).
- When an active tab matches a blacklisted domain, completely disable agent scanning, remove badges, and display a prominent alert: *"Madadgar is disabled on financial and banking pages for your security."*

#### 4.4.2: Sensitive Field & Credential Shield
- In `src/safety/field_sanitizer.ts`, check target element before any action:
  - If `element.type === 'password'`, block immediately.
  - If `autocomplete` or `name` attributes match `cc-number`, `cvv`, `pin`, `otp`, `one-time-code`, block immediately.
  - Never allow typing or reading protected fields.

#### 4.4.3: Consequential Action Interceptor Gate
- In `src/safety/action_validator.ts`, inspect element text and role.
- If the action targets a button containing `Submit`, `Pay`, `Transfer`, `Delete`, `Send`, or `Confirm Order`, trigger an elevated confirmation dialog in the Side Panel requiring explicit double-confirmation before execution.

#### 4.4.4: Immediate Emergency Kill Switch
- Persistent red Stop icon in the top header of the Side Panel.
- Clicking the kill switch immediately aborts active LLM requests, clears content script overlays, resets the FSM to `IDLE`, and deletes `active_task_session`.
- **Target Files:** `src/safety/domain_rules.ts`, `src/safety/field_sanitizer.ts`, `src/safety/action_validator.ts`, `src/content/guardrails.ts`.

---

### Task 4.5: Release Packaging, Distribution ZIP & Documentation
- **Deliverables:**
  - Verify build outputs an optimized `dist/` directory ready for Chrome *Load unpacked*.
  - Add build script `npm run zip` to generate `madadgar-v1.0.0.zip` for GitHub Releases.
  - Create project `README.md`:
    - Project Overview & Core Features.
    - Quickstart: How to load the unpacked extension in Chrome.
    - Step-by-step setup for free Gemini and Groq API keys.
    - Privacy & Safety Guarantee documentation.
    - Screenshot walkthrough of key features.
  - Create a one-page GitHub Pages landing site (`landing/index.html`) linking to the repository and release ZIP.
- **Target Files:** `package.json`, `README.md`, `landing/index.html`.

---

### Phase 4 Acceptance Criteria & Verification
- [ ] User profile data saves and populates form fields accurately.
- [ ] Saved skills can be triggered with one click, exported to JSON, and imported back.
- [ ] Financial/banking URLs are blocked by deterministic code checks.
- [ ] Password and OTP fields cannot be read or typed into by the agent.
- [ ] Consequential buttons require explicit double confirmation.
- [ ] Kill switch instantly halts all active tasks.
- [ ] Clean ZIP archive can be downloaded and installed via *Load unpacked* by a new user.

---

## 7. Testing, Verification & Quality Matrix

| Week / Phase | Test Harness / Verification Target | Success Criteria |
| :--- | :--- | :--- |
| **Week 1** | News articles (BBC, Medium, Substack) & Public YouTube videos | TL;DR + 5 points + next steps render in < 3s; En/Hinglish toggle works. |
| **Week 2** | Long technical articles & visual dashboard pages | Grounded QA accurately rejects questions outside the page; screenshot captures visual charts without error. |
| **Week 3** | Multi-step internship application practice forms | Agent detects all inputs, displays numbered badges, proposes valid steps in JSON, and waits for user approval. |
| **Week 4** | Mock banking page, password forms, and cold installation | Sensitive pages are blocked instantly; release package loads smoothly on a clean Chrome profile. |

---

## 8. Definition of Done (Final Project Sign-Off)

The project is fully complete and ready for public submission when:
1. A fresh user installs the extension via Chrome's *Load unpacked* flow.
2. The user inputs their own Gemini API key in the settings panel.
3. The user successfully summarizes an article and a public YouTube video in English and Hinglish.
4. Grounded page chat, context-menu actions (*Explain/Translate/Draft*), and screenshot-and-ask operate smoothly.
5. The agent successfully navigates and assists in filling a multi-step practice form with explicit user approval at each step.
6. The audit log accurately records all proposed steps and decisions.
7. Local profile memory and saved skill import/export function properly.
8. Safety rules deterministically block banking sites and password/OTP inputs.
9. Documentation, README, release ZIP, and landing page are fully completed.

