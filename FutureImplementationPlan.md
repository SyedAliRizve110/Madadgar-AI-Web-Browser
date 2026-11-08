# Madadgar: Phase-Wise Future Implementation Plan (`FutureImplementationPlan.md`)

**Document Version:** 1.0  
**Status:** Approved for Implementation  
**Architecture Reference:** `FuturePlanArchitecture.md`  
**Parent Roadmap:** `FuturePlan.md`  
**Master Edge-Case Reference:** `docs/edge-cases.md`  
**Execution Strategy:** Incremental Vertical Slices with Strict Backward Compatibility  
**Target Completion:** 9 Weeks (Phases 5, 6, 7)  

---

## 1. Execution Strategy & Technical Stack Evolution

Building on the production baseline of Madadgar v1.0 (Manifest V3, Chrome Side Panel, Gemini/Groq Gateway, deterministic safety shields), this implementation plan expands the system into a **cross-browser, voice-directed, autonomous browser agent**.

### Modernized Stack Additions:
* **Cross-Browser Standard:** Mozilla `webextension-polyfill` (`browser.*` namespace).
* **Firefox Target:** Gecko Manifest V3 with `sidebar_action` and event-driven background scripts.
* **Voice Speech Pipeline:** Web Speech API (`SpeechRecognition` & `SpeechSynthesis`) + Groq Whisper (`whisper-large-v3`) cloud fallback.
* **On-Device Local AI:** Chrome Built-in Prompt API (`window.ai` Gemini Nano) + WebGPU / Transformers.js.
* **Local Semantic Memory:** IndexedDB with vectorized cosine similarity embeddings.
* **Rich Text DOM Injection:** Selection & Range caret APIs + synthetic `InputEvent` for `contenteditable`.

---

## 2. Master Phase-Wise Roadmap Overview

```
├── Phase 5 (Weeks 1–3): Cross-Browser Engine & Voice Foundations ("The Voice & Ears")
│   ├── Task 5.1: webextension-polyfill & Unified Storage Adapter
│   ├── Task 5.2: Universal Sidebar Adapter (chrome.sidePanel <=> browser.sidebarAction)
│   ├── Task 5.3: Dual-Target Build System (npm run build:chrome & build:firefox)
│   ├── Task 5.4: Web Speech STT Engine & Global Push-to-Talk (Alt+V)
│   ├── Task 5.5: Cloud Audio Whisper STT Fallback & Microphone Permission Controller
│   ├── Task 5.6: Bilingual Text-to-Speech (TTS) Voice Engine (en-IN / hi-IN)
│   └── Task 5.7: Voice-Driven Summarizer & Spoken Audio Briefings
│
├── Phase 6 (Weeks 4–6): Tiered Autonomy & Universal Content Composer ("Hands-Free Autopilot")
│   ├── Task 6.1: Deterministic Risk Assessment Classifier & Scoring Matrix
│   ├── Task 6.2: Tiered Autonomy FSM (Co-Pilot <=> Supervised Auto-Pilot)
│   ├── Task 6.3: Continuous Voice Navigation Directives (Scroll, Click, Search, Navigate)
│   ├── Task 6.4: Universal contenteditable Rich Text Injector (Gmail, LinkedIn, Notion)
│   ├── Task 6.5: Context-Aware Email Replier & Social Media Post Drafter
│   ├── Task 6.6: Inline Ghostwriter Autocomplete Widget (Floating pill & Tab-to-Accept)
│   └── Task 6.7: Action Audit Trail Undo Stack & Rollback Dispatcher
│
└── Phase 7 (Weeks 7–9): Multi-Tab Intelligence, Local Edge AI & Semantic Memory ("The Super-Brain")
    ├── Task 7.1: Multi-Tab Errand Coordinator & Tab State Pool Machine
    ├── Task 7.2: Cross-Tab Map-Reduce Synthesizer & Comparison Errand Engine
    ├── Task 7.3: Built-in Chrome Prompt API (window.ai Gemini Nano) On-Device Client
    ├── Task 7.4: Client-Side Embeddings Generator via Transformers.js & WebGPU
    ├── Task 7.5: IndexedDB Local Vector Store & Semantic Browsing History QA
    └── Task 7.6: Set-of-Mark (SoM) Coordinate Grounding for Canvas & SVG Web Apps
```

---

## 3. Phase 5 (Weeks 1–3): Cross-Browser Engine & Voice Foundations

### Objective
Enable complete cross-browser portability across Chrome and Firefox, establish the bidirectional speech engine (STT and TTS), and introduce hands-free voice-driven summarization with bilingual audio briefings.

---

### Task 5.1: `webextension-polyfill` & Unified Storage Adapter
- **Deliverables:**
  - Install `webextension-polyfill` and `@types/webextension-polyfill`.
  - Refactor `src/common/storage_adapter.ts` to use `browser.storage.local`.
  - Provide fallback detection so Chromium extension instances run without overhead.
  - Implement storage quota monitoring and graceful cleanup for Firefox and Chrome.
- **Target Files:** `src/common/storage_adapter.ts`, `src/common/browser_adapter.ts`, `package.json`.

---

### Task 5.2: Universal Sidebar Adapter
- **Deliverables:**
  - Implement `UniversalSidebarAdapter` in `src/common/sidebar_adapter.ts`:
    - On Chromium: routes to `chrome.sidePanel.open({ windowId })` and `chrome.sidePanel.setOptions()`.
    - On Firefox: routes to `browser.sidebarAction.open()` and `browser.sidebarAction.setPanel()`.
  - Wire background port listeners to handle window-focus changes across both browsers without state dropping.
- **Target Files:** `src/common/sidebar_adapter.ts`, `src/background/service_worker.ts`, `src/sidepanel/App.tsx`.

---

### Task 5.3: Dual-Target Build Tooling & Manifest Transform Pipeline
- **Deliverables:**
  - Update `vite.config.ts` or add build scripts to generate browser-specific distributions:
    - `npm run build:chrome` $\rightarrow$ outputs Chrome MV3 to `dist/chrome`.
    - `npm run build:firefox` $\rightarrow$ transforms `manifest.json`:
      - Replaces `side_panel` with `sidebar_action`.
      - Injects `browser_specific_settings.gecko = { id: "madadgar@ai-assistant.com", strict_min_version: "109.0" }`.
      - Maps background service worker to background scripts.
  - Update `package.json` scripts: `build:all`, `build:chrome`, `build:firefox`, `zip:firefox`.
- **Target Files:** `scripts/manifest-transformer.js`, `vite.config.ts`, `package.json`.

---

### Task 5.4: Web Speech API STT Engine & Global Push-to-Talk Hotkey
- **Deliverables:**
  - Implement `SpeechRecognitionController` in `src/voice/speech_recognizer.ts` using `webkitSpeechRecognition` / `SpeechRecognition`.
  - Add global hotkey command `Alt+V` in `manifest.json` under `"commands"`:
    - Pressing `Alt+V` toggles voice listening state in the Side Panel with audio chime indicator.
  - Add visual pulsating microphone animation in Side Panel header.
  - Implement confidence threshold filter ($\ge 0.75$) and 5-second silence auto-timeout.
- **Target Files:** `src/voice/speech_recognizer.ts`, `src/sidepanel/components/VoiceMicButton.tsx`, `src/manifest.json`.

---

### Task 5.5: Cloud Audio Whisper STT Fallback & Permission Controller
- **Deliverables:**
  - Build `src/voice/whisper_client.ts` calling Groq Whisper API (`whisper-large-v3`) via multipart audio upload.
  - Implement `navigator.mediaDevices.getUserMedia` audio recorder buffer.
  - Automatically fail over to Whisper if local Web Speech fails, encounters noisy environments, or transcribes ambiguous Hinglish.
  - Handle permission denials gracefully with explanatory user guidance and deep link to browser settings.
- **Target Files:** `src/voice/whisper_client.ts`, `src/voice/voice_gateway.ts`.

---

### Task 5.6: Bilingual Text-to-Speech (TTS) Voice Engine
- **Deliverables:**
  - Implement `SpeechSynthesizer` in `src/voice/speech_synthesizer.ts` using `window.speechSynthesis`.
  - Add voice selector matching the user's language setting:
    - English mode $\rightarrow$ `en-US` or `en-GB` natural voices.
    - Hinglish mode $\rightarrow$ `en-IN` / `hi-IN` Indian English / Hindi voice persona.
  - Hardware Mute Latch: automatically mute the microphone when TTS is actively speaking to prevent acoustic feedback loops.
- **Target Files:** `src/voice/speech_synthesizer.ts`, `src/voice/voice_gateway.ts`.

---

### Task 5.7: Voice-Driven Summarization & Spoken Audio Briefings
- **Deliverables:**
  - Connect voice intent parser to summarizer: spoken command *"Madadgar, summarize this page"* extracts content and generates summary.
  - Add "Read Aloud" / "Audio Briefing" button on `SummaryCard.tsx` with Play, Pause, and Speed controls (`1x`, `1.25x`, `1.5x`).
  - Spoken Hinglish audio summaries reading TL;DR and key takeaways hands-free.
- **Target Files:** `src/sidepanel/components/SummaryCard.tsx`, `src/voice/intent_router.ts`.

---

### Phase 5 Acceptance Criteria & Verification
- [ ] Extension compiles cleanly for both Chrome (`dist/chrome`) and Firefox (`dist/firefox`).
- [ ] Side panel opens natively in Google Chrome, Microsoft Edge, and Mozilla Firefox.
- [ ] Pressing `Alt+V` opens microphone and captures speech with confidence $\ge 0.75$.
- [ ] Cloud Whisper activates seamlessly if local speech recognition encounters heavy dialect or error.
- [ ] TTS audio briefing plays clean speech in English and Hinglish without acoustic mic feedback.

---

## 4. Phase 6 (Weeks 4–6): Tiered Autonomy & Universal Content Composer

### Objective
Upgrade the agent from strictly manual step confirmations to a configurable, safe **Tiered Autonomy Engine** (Auto-Pilot) for routine web tasks, and implement universal generative writing with direct injection into `contenteditable` editors (Gmail, LinkedIn, Notion).

---

### Task 6.1: Deterministic Risk Assessment Classifier
- **Deliverables:**
  - Implement `RiskClassifier` in `src/safety/risk_classifier.ts`:
    - Assign scores: `0.0` (Scroll/Read), `0.1` (Search input), `0.3` (Profile field fill), `0.9` (Irreversible delete), `1.0` (Financial commit or Credentials).
  - Multi-signal detector: scan element text, aria-labels, parent form actions, and nearby currency symbols (`$`, `₹`, `€`).
  - Strict invariant check: classify any action on banking domains, password inputs, or OTP fields as `HARD_BLOCKED`.
- **Target Files:** `src/safety/risk_classifier.ts`, `src/__tests__/risk_classifier.test.ts`.

---

### Task 6.2: Tiered Autonomy Finite State Machine (TA-FSM)
- **Deliverables:**
  - Add autonomy mode selector in Side Panel:
    - `Co-Pilot (Manual HITL)`: Approves every step individually (v1.0 behavior).
    - `Supervised Auto-Pilot`: Automatically executes steps with risk score $< 0.5$. Pauses and prompts for approval on steps $\ge 0.5$.
  - Enforce Dynamic Mutation Quiescence: wait 250ms for DOM settling between autonomous steps.
  - Implement Stagnation Detector: automatically abort if the agent attempts the same state $\ge 3$ times.
- **Target Files:** `src/background/agent_orchestrator.ts`, `src/sidepanel/components/AutonomySlider.tsx`.

---

### Task 6.3: Continuous Voice Navigation Directives
- **Deliverables:**
  - Build fast-path voice grammar parser for direct navigation:
    - Scroll commands: *"Scroll down"*, *"Scroll up"*, *"Scroll to bottom"*, *"Half page down"*.
    - Badge clicks: *"Click number 4"*, *"Click badge 7"*, *"Click on Submit"*.
    - Tab control: *"Go back"*, *"Reload page"*, *"Next page"*.
    - Control directives: *"Pause"*, *"Resume"*, *"Cancel task"*, *"Stop"*.
  - Map directives directly to `action_executor.ts` bypassing slow LLM planning loops for known verbs (< 150ms execution latency).
- **Target Files:** `src/voice/intent_router.ts`, `src/content/action_executor.ts`.

---

### Task 6.4: Universal `contenteditable` Rich Text Injector
- **Deliverables:**
  - Extend `action_executor.ts` with `UniversalContentWriter`:
    - Support modern rich-text editors: Gmail draft body, LinkedIn post creator, X tweet composer, Notion pages.
    - Set caret via `window.getSelection()` and `document.createRange()`.
    - Dispatch synthetic `InputEvent('beforeinput', { inputType: 'insertText' })` and `document.execCommand('insertText')`.
  - Maintain framework state synchronization (ProseMirror, Lexical, Draft.js).
- **Target Files:** `src/content/universal_writer.ts`, `src/content/action_executor.ts`.

---

### Task 6.5: Context-Aware Email Replier & Social Post Drafter
- **Deliverables:**
  - Implement context harvester in `src/content/context_harvester.ts`:
    - Gmail extractor: scrapes sender, subject, and latest received message body.
    - Article-to-post synthesizer: extracts page title, summary, and generates engaging LinkedIn / X updates with hashtags.
  - Add "Draft Reply" and "Share Insights" cards in the Side Panel with tone selection (*Professional, Concise, Friendly*).
  - One-click or voice-directed injection into active composer.
- **Target Files:** `src/content/context_harvester.ts`, `src/sidepanel/components/DraftComposer.tsx`.

---

### Task 6.6: Inline Ghostwriter Autocomplete Widget
- **Deliverables:**
  - Injected ephemeral floating ghostwriter pill anchored to active input/textarea.
  - Generate brief sentence completions based on surrounding text context.
  - Keyboard controls: `Tab` to accept completion, `Escape` or continue typing to dismiss.
  - Zero interference with standard form tab navigation.
- **Target Files:** `src/content/ghostwriter_overlay.ts`, `src/sidepanel/components/SettingsModal.tsx`.

---

### Task 6.7: Action Audit Trail Undo Stack & Rollback Dispatcher
- **Deliverables:**
  - Implement reverse synthetic event logger: record element pre-action state (original text value, previous scroll offset).
  - Spoken command *"Madadgar, undo that"* or click `[Undo]` in Side Panel restores the previous input state.
  - Full audit logging maintained in `chrome.storage.local`.
- **Target Files:** `src/background/agent_orchestrator.ts`, `src/content/action_executor.ts`.

---

### Phase 6 Acceptance Criteria & Verification
- [ ] Auto-Pilot mode navigates standard search and read errands hands-free.
- [ ] Consequential buttons (`Pay`, `Place Order`, `Delete`) demand double-confirmation even in Auto-Pilot mode.
- [ ] Voice navigation directives (*"Scroll down"*, *"Click badge 3"*) execute in $< 200$ms.
- [ ] Rich text inserts flawlessly into Gmail and LinkedIn composers without formatting corruption.
- [ ] Ghostwriter suggestions appear cleanly and accept on `Tab`.
- [ ] Spoken *"Undo"* successfully reverts text input modifications.

---

## 5. Phase 7 (Weeks 7–9): Multi-Tab Intelligence, Local Edge AI & Semantic Memory

### Objective
Enable cross-tab parallel errand coordination, integrate on-device zero-API-key inference via Chrome Gemini Nano, and implement local semantic vector memory over browsing history.

---

### Task 7.1: Multi-Tab Errand Coordinator & State Pool
- **Deliverables:**
  - Implement `TabCoordinator` in `src/background/tab_coordinator.ts`:
    - Programmatically spawn, track, and monitor multiple target tabs via `chrome.tabs.create`.
    - Isolate content script messaging across concurrent tab IDs.
    - Listen for `chrome.tabs.onRemoved` to gracefully handle manual user tab closures without hanging the parent errand.
- **Target Files:** `src/background/tab_coordinator.ts`, `src/common/types.ts`.

---

### Task 7.2: Cross-Tab Map-Reduce Synthesizer & Comparison Engine
- **Deliverables:**
  - Implement Map-Reduce errand pipeline:
    - Map Phase: execute extraction script across $N$ open tabs in parallel (e.g. product specs, return policies, ticket prices).
    - Reduce Phase: LLM aggregates extracted datasets into a structured comparison table.
  - Render dynamic comparison card in Side Panel with side-by-side matrices and direct jump links to corresponding tabs.
- **Target Files:** `src/background/synthesizer.ts`, `src/sidepanel/components/ComparisonCard.tsx`.

---

### Task 7.3: Built-in Chrome Prompt API (`window.ai` Gemini Nano) On-Device Client
- **Deliverables:**
  - Implement `LocalNanoClient` in `src/ai/local_nano_client.ts`:
    - Detect `window.ai.languageModel` capabilities (`capabilities().available`).
    - Stream responses for summarization and drafting tasks completely on-device.
  - Zero API key required: new users can summarize and draft immediately without setting up Google AI Studio keys.
  - Seamless automatic failover to cloud Gemini 2.5 Flash-Lite if local hardware capabilities are unsupported or busy.
- **Target Files:** `src/ai/local_nano_client.ts`, `src/ai/ai_gateway.ts`.

---

### Task 7.4: Client-Side Embeddings Generator via Transformers.js & WebGPU
- **Deliverables:**
  - Integrate `@xenova/transformers` running a quantized lightweight embedding model (`all-MiniLM-L6-v2`) inside a dedicated Web Worker.
  - Compute 384-dimensional dense vector embeddings for extracted page articles.
  - Pre-flight hardware checks: bypass if device RAM $< 8$GB or WebGPU unsupported.
- **Target Files:** `src/ai/embedding_worker.ts`, `src/ai/vector_math.ts`.

---

### Task 7.5: IndexedDB Local Vector Store & Semantic History QA
- **Deliverables:**
  - Implement `SemanticHistoryStore` in `src/common/vector_store.ts` using IndexedDB:
    - Stores `{ id, url, title, timestamp, summary, embedding }`.
  - Natural Language Search: user asks *"What was that article about TypeScript performance?"* $\rightarrow$ cosine similarity search retrieves top-3 matching historical pages.
  - Enforce persistent storage via `navigator.storage.persist()`.
- **Target Files:** `src/common/vector_store.ts`, `src/sidepanel/components/HistorySearch.tsx`.

---

### Task 7.6: Set-of-Mark (SoM) Coordinate Grounding for Canvas & SVG Web Apps
- **Deliverables:**
  - Support non-DOM web interfaces (Canva, Figma, Google Sheets canvas, Miro):
    - Capture viewport via `captureVisibleTab`.
    - Generate visual coordinate grid / numbered markers over detected interactive bounding boxes.
    - Gemini Vision proposes `(x, y)` coordinate click targets.
    - Dispatch synthetic clicks at exact pixel coordinates using `chrome.debugger` or simulated viewport mouse events.
- **Target Files:** `src/content/coordinate_grounding.ts`, `src/background/screen_capture.ts`.

---

### Phase 7 Acceptance Criteria & Verification
- [ ] Multi-tab comparison errand extracts and compares data across 3 distinct e-commerce tabs in $< 10$s.
- [ ] On-device Gemini Nano summarizes web articles with zero external network requests on compatible Chrome versions.
- [ ] Semantic history search accurately retrieves past pages by concept rather than exact keyword matches.
- [ ] Set-of-Mark coordinate clicks accurately interact with canvas buttons.

---

## 6. Testing, Verification & Quality Matrix

| Phase | Test Suite & Harness | Target Verification Criteria |
| :--- | :--- | :--- |
| **Phase 5** | Firefox `web-ext` runner + Chrome Puppeteer | Dual build passes; sidebar mounts on both engines; Web Speech captures transcriptions; TTS speaks with correct dialect. |
| **Phase 6** | Mock multi-step checkout form & Gmail compose fixture | Auto-Pilot fills inputs without pausing; consequential buttons trigger mandatory approval modal; rich text injects cleanly. |
| **Phase 7** | Multi-tab price comparison fixture & local vector benchmark | Parallel tab extraction succeeds; local vector retrieval finishes in $< 100$ms; Gemini Nano handles offline summaries. |

---

## 7. Definition of Done (Master Project Sign-Off)

The Future Plan is considered fully realized when:
1. **Cross-Browser:** The extension installs and functions identically on Chrome, Edge, Brave, Opera, and Firefox.
2. **Hands-Free Voice:** A user can speak natural commands to navigate, click, scroll, and summarize without touch or keyboard.
3. **Safe Auto-Pilot:** Multi-step routine errands run autonomously, while financial, credential, and delete actions are deterministically blocked from unauthorized execution.
4. **Universal Writing:** The assistant drafts and injects context-rich content into standard inputs and modern rich-text editors (Gmail, LinkedIn).
5. **Zero-Key Local AI:** First-time users can summarize articles offline via Chrome's built-in Gemini Nano without entering an API key.
6. **Multi-Tab Intelligence:** Cross-tab comparison errands autonomously gather, synthesize, and display comparative findings.
7. **Semantic Memory:** Users can query past research journeys using natural conversational language.
