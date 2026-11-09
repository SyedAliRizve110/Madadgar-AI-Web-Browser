# 🚀 Madadgar: Proposed v2.0 Roadmap & Evolution Plan (`v2Plan.md`)

**Document Version:** 1.0  
**Status:** Proposed Strategy & Architectural Roadmap  
**Target Architecture:** Multi-Browser, Voice-First, Tiered-Autonomy AI Browser Agent  
**Technical Architecture Reference:** `v2Architecture.md`  

---

## 1. Executive Summary & Vision

Madadgar v1.0 established the foundation of a **Human-in-the-Loop (HITL)** AI browser assistant: read/purify pages, multimodal screen inspection, grounded chat, profile form-filling, and step-by-step verified errand execution.

The next evolutionary leap transforms Madadgar into an **omnipresent, voice-enabled, multi-browser autonomous agent**. Users can speak naturally to research topics, navigate multi-tab errands, draft communications, and let the agent perform mundane errands autonomously, while preserving critical security boundaries.

---

## 2. Evaluation & Refinement of Proposed Features

Below is a technical feasibility analysis and improved architecture for each proposed feature:

| Proposed Feature | Feasibility | Technical Approach | Safety & Architecture Recommendations |
| :--- | :---: | :--- | :--- |
| **1. Firefox Compatibility** | **High** (100% Doable) | `webextension-polyfill` + `sidebar_action` fallback | Abstract `chrome.sidePanel` into a unified `SidebarAdapter`. Add `gecko.id` and dual-build packaging (`npm run build:firefox`). |
| **2. Autonomous Execution (No Approval)** | **High** (With Tiered Guardrails) | Configurable Autonomy Slider: `Co-Pilot (Manual)` $\rightarrow$ `Auto-Pilot (Autonomous)` | **Risk-Tiered Autonomy:** High-risk actions (payment, delete, password submission) must retain a hard block or voice double-confirmation, while routine clicks/typing run hands-free. |
| **3. Full Voice Browser Pilot** | **High** (100% Doable) | Web Speech API / Gemini Live API + Intent Parser + Action Pipeline | Continuous voice listener maps spoken directives (*"Scroll down", "Click search", "Open first result"*) into DOM actions without keyboard/mouse input. |
| **4. AI Form-Filling, Emails & Posts** | **High** (100% Doable) | Contextual Generator + DOM Form Mapper + Floating Inline Ghostwriter | Read active conversation thread or form context; generate tone-adapted drafts; inject directly into `input`, `textarea`, and `contenteditable` (Gmail/LinkedIn). |
| **5. Voice Summarization & Chat** | **High** (100% Doable) | Speech-to-Text (STT) + Text-to-Speech (TTS) Pipeline | Real-time bilingual voice chat (English / Hinglish) with speech playback option for hands-free audio summaries. |

---

## 3. Deep Dive: Architectural Specifications

### 3.1. Cross-Browser Engine: Firefox & Multi-Engine Portability
* **The Challenge:** Firefox Manifest V3 does not support `chrome.sidePanel` (it uses `sidebar_action`) and uses different background service worker lifecycles.
* **The Solution:**
  1. **Unified Storage & Messaging Layer:** Adopt Mozilla's official `webextension-polyfill` (`browser.*`).
  2. **Sidebar Adapter:**
     ```typescript
     export class SidebarAdapter {
       static async open() {
         if (typeof chrome !== 'undefined' && chrome.sidePanel) {
           return chrome.sidePanel.open({ windowId: ... });
         } else if (typeof browser !== 'undefined' && browser.sidebarAction) {
           return browser.sidebarAction.open();
         }
       }
     }
     ```
  3. **Dual Build Targets:**
     - `npm run build:chrome` $\rightarrow$ outputs Chrome MV3 to `dist/chrome`.
     - `npm run build:firefox` $\rightarrow$ merges Firefox manifest overrides to `dist/firefox`.

---

### 3.2. Voice Command Pilot with Autonomous Execution
* **Voice Architecture:**
  - **Speech-to-Text (STT):** Primary local capture using the browser's native `webkitSpeechRecognition` (zero latency, zero cloud cost). Optional cloud transcription via Groq Whisper (`whisper-large-v3`) for accent resilience.
  - **Wake Word / Voice Hotkey:** Push-to-Talk shortcut (e.g., `Ctrl+Shift+Space` or `Alt+V`) or customizable wake word (*"Hey Madadgar"*).
* **Tiered Autonomy Engine:**
  Instead of all-or-nothing autonomy, implement a **3-tier autonomy slider**:
  1. **Tier 1: Co-Pilot (Strict HITL - Default):** Card appears for every step; requires click/voice approval.
  2. **Tier 2: Supervised Auto-Pilot (Hands-Free Browsing):** Automatically executes page navigation, searching, reading, filtering, and standard text typing. Pauses and speaks back only if stuck or encountering ambiguous choices.
  3. **Tier 3: Guardrail Invariants (Non-Negotiable):** Banking domains, passwords, OTPs, and financial checkout buttons are **never** executed autonomously, preventing accidental purchases or account lockouts.

---

### 3.3. Full Voice Browser Navigation (Search, Scroll, Click)
* **Voice-to-Action Mapping Pipeline:**
  ```
  User Voice: "Search for best laptops under 60k on Amazon and click the highest rated one"
       │
       ▼
  [Voice Transcription Engine] (STT)
       │
       ▼
  [Intent & Action Planner (Gemini Flash-Lite)]
       │
       ├── Plan Step 1: TYPE 'laptops under 60k' into search input [#3]
       ├── Plan Step 2: CLICK submit search button [#4]
       ├── Plan Step 3: SCROLL down 500px to inspect results
       └── Plan Step 4: LOCATE highest rated product badge & CLICK [#12]
       │
       ▼
  [Autonomous Execution Pipeline] (FSM runs sequential steps with visual badge highlight)
  ```
* **Real-time Voice Directives:**
  - Navigation: *"Scroll down"*, *"Scroll to top"*, *"Go back"*, *"Next page"*.
  - Interaction: *"Click on number 5"*, *"Select second dropdown option"*, *"Clear input"*.
  - Errand Control: *"Pause"*, *"Resume"*, *"Cancel task"*, *"Undo last step"*.

---

### 3.4. AI Generative Writing: Forms, Emails & Social Media
* **Universal Content Injector (`contenteditable` Support):**
  - Modern web apps (Gmail, LinkedIn, X/Twitter, Notion) use `contenteditable` `<div>` elements rather than simple `<textarea>` tags.
  - Extend `action_executor.ts` with synthetic `InputEvent('insertText')` and `document.execCommand` fallbacks to inject rich text naturally into draft composers.
* **Smart Contextual Drafting:**
  - **Email Replier:** Automatically extracts previous email thread context via DOM parser; drafts reply with customizable tone (*Professional, Concise, Friendly, Persuasive*).
  - **Social Post Drafter:** Summarizes the active article or research page into an engaging LinkedIn post or X thread with relevant hashtags.
  - **Inline Ghostwriter (Tab-to-Accept):** Floating pill widget next to text inputs offering AI completions as the user types.

---

### 3.5. Voice Summarization & Conversational Voice QA
* **Bilingual Voice Engine:**
  - Speech synthesis via Web Speech `speechSynthesis` or high-quality audio streaming.
  - In **Hinglish mode**, the voice synthesis automatically selects an Indian English / Hindi voice persona (`en-IN` / `hi-IN`).
* **Hands-Free Audio Briefings:**
  - Spoken command: *"Madadgar, give me a 60-second summary of this page while I make coffee."*
  - The model generates a conversational spoken briefing and plays audio directly through the side panel.

---

## 4. Additional High-Value Engineer Recommendations

Beyond the initial suggestions, the following enhancements would elevate Madadgar into an industry-leading agent:

### 4.1. Local On-Device AI (Zero API Keys & 100% Offline Mode)
* Integrate Chrome's built-in **Gemini Nano** (`window.ai` Prompt API) and **WebGPU / Transformers.js**.
* **Benefit:** Instant summarization and text drafting without requiring users to get API keys from Google AI Studio or Groq, operating completely offline with zero server dependencies.

### 4.2. Multi-Tab Research & Comparison Errands
* Allow Madadgar to open, inspect, and synthesize information across multiple browser tabs:
  - *"Compare the return policies of these 3 shopping tabs in a table."*
  - *"Find the cheapest flight across tab 1 (Google Flights), tab 2 (Skyscanner), and tab 3 (MakeMyTrip)."*

### 4.3. Set-of-Mark (SoM) Visual Grounding
* For complex web apps (Canva, Figma, Google Sheets) where DOM text is obfuscated in canvas or nested iframes:
  - Capture visible tab screenshot, overlay coordinate marks, and let Gemini Vision propose `(x, y)` coordinate clicks.

### 4.4. Semantic Browsing History Memory
* Store vector embeddings of summarized articles locally using lightweight IndexedDB vector storage.
* Ask: *"What was that article I read last Tuesday about TypeScript performance?"* $\rightarrow$ Madadgar retrieves the exact URL and notes.

---

## 5. Phased Implementation Roadmap

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         MADADGAR v2.0 ROADMAP                              │
├────────────────────────┬─────────────────────────┬─────────────────────────┤
│ Phase 5 (Next 3 Weeks) │ Phase 6 (Weeks 4-6)     │ Phase 7 (Weeks 7-9)     │
│ Voice & Multi-Browser  │ Autonomous Pilot & Text │ Local AI & Multi-Tab    │
├────────────────────────┼─────────────────────────┼─────────────────────────┤
│ • Firefox MV3 Port     │ • Autonomous Execution  │ • Built-in Chrome Nano  │
│   (sidebar_action)     │   Mode (Auto-Pilot)     │   (window.ai zero-key)  │
│ • Web Speech STT & TTS │ • Universal Email/Post  │ • Multi-Tab Comparison  │
│   Voice Pipeline       │   Composer & Injector   │   Research Orchestrator │
│ • Voice Summarizer &   │ • Real-time Voice       │ • Semantic Browsing     │
│   Conversational Chat  │   Navigation Directives │   History Memory        │
│ • Push-to-Talk Hotkey  │ • Inline Ghostwriter    │ • Visual Coordinate     │
│   (Alt+V)              │   (contenteditable)     │   Grounding (Canvas/SVG)│
└────────────────────────┴─────────────────────────┴─────────────────────────┘
```

---

## 6. Safety & Ethical Charter for Autonomous Browsing

As autonomy increases from **Human-in-the-Loop** to **Supervised Auto-Pilot**, the following boundaries remain invariant:

1. **Deterministic Financial Lockout:** No autonomous interaction with payment gateways, UPI QR codes, or bank URLs.
2. **Auditable Voice Logs:** Every voice command and resulting DOM action is logged with an undo / rollback option.
3. **Hardware Kill Switch:** Pressing `Escape` or clicking the prominent red Stop button immediately kills active speech recognition and running DOM errands.
4. **Zero Telemetry Guarantee:** Voice audio is processed locally or sent directly to user-configured APIs—never stored on third-party analytical servers.

