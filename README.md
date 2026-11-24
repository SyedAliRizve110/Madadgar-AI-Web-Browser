# 🛡️ Madadgar (مددگار / मददगार)
### Autonomous & Human-in-the-Loop Browser Assistant for Chrome & Firefox (Manifest V3)

[![Manifest V3](https://img.shields.io/badge/Extension-Manifest_V3-4285F4?logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Cross-Browser Dual Engine](https://img.shields.io/badge/Browsers-Chrome_|_Firefox_|_Edge_|_Brave-orange)](#-cross-browser-architecture-engine-cbae)
[![Live Landing Page](https://img.shields.io/badge/Website-madadgar--ai--web--browser.vercel.app-000?logo=vercel)](https://madadgar-ai-web-browser.vercel.app/)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict_Mode-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 5](https://img.shields.io/badge/Bundler-Vite_5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Tests-49_suites_|_368_passed-brightgreen?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Zero External Telemetry](https://img.shields.io/badge/Privacy-100%25_Local_Storage-success)](#-privacy--deterministic-safety-charter)

> **Madadgar** (*"The Helper"*) is an open-source, privacy-preserving browser assistant built for Chrome's native Side Panel and Firefox's Sidebar. It combines fast AI reasoning (**Google Gemini 2.5 Flash-Lite** with **Groq Llama 3.3 & Whisper** failover) with **deterministic code-level safety guardrails**, **hands-free voice control**, and a **tiered autonomy** architecture: from manual step-by-step Co-Pilot approvals to supervised auto-pilot execution with automatic consequential risk gating and full undo rollbacks.

---

## 🌟 Core Architecture & Pillars

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               MADADGAR v2.0 ARCHITECTURE                               │
├───────────────────┬───────────────────┬───────────────────┬────────────────────────────┤
│  👁️ The Eyes      │  🎙️ The Voice     │  🧠 The Brain     │  🤝 The Hands & Autonomy   │
│  (Read & Purify)  │  (STT, TTS, Nav)  │  (QA, Draft, Tab) │  (Tiered HITL, Ghostwrite) │
├───────────────────┼───────────────────┼───────────────────┼────────────────────────────┤
│ • Readability DOM │ • Push-to-Talk    │ • Grounded Page   │ • Tiered Autonomy FSM      │
│   Article Cleaner │   (Alt+V Hotkey)  │   Streaming QA    │   (Co-Pilot vs Auto-Pilot) │
│ • YouTube Caption │ • Local Speech STT│ • Universal Writer│ • Risk Classifier Gate     │
│   Timestamp Parser│   + Groq Whisper  │   (Gmail/LinkedIn)│   (Submit/Pay/Delete Lock) │
│ • LaTeX Math / $  │ • Bilingual TTS   │ • Context Harvest │ • Shadow DOM Ghostwriter   │
│   Cleaner (No $)  │   (Hindi & English) (Subject/Thread)  │   (Tab to Accept Pill)     │
│ • Cross-Browser   │ • Continuous Voice│ • Cross-Tab Map-  │ • Action Audit Trail &     │
│   (Chrome/Firefox)│   Navigation      │   Reduce Synthesize│   Undo Rollback Stack      │
└───────────────────┴───────────────────┴───────────────────┴────────────────────────────┘
```

1. **The Eyes (Reading, Purification & Cross-Browser):** Cleans article text via `@mozilla/readability`, parses timestamped YouTube captions, automatically sanitizes raw LaTeX and distracting `$` symbols into clean inline code badges, and runs natively across both Chromium (`sidePanel`) and Gecko (`sidebarAction`).
2. **The Voice (Speech-to-Text, Bilingual TTS & Navigation):** Instant push-to-talk via <kbd>Alt</kbd> + <kbd>V</kbd> using Web Speech API with seamless Groq Whisper fallback. Speaks aloud in Indian English or natural Hindi (`hi-IN`) with hardware mute feedback protection. Supports continuous hands-free navigation (*"Scroll down"*, *"Click badge 2"*, *"Madadgar, undo that"*).
3. **The Brain (Grounded QA, Composer & Multi-Tab Synthesizer):** Delivers zero-hallucination streaming answers grounded in active page contents, multimodal screenshot vision inspection, and the **Multi-Tab Coordinator** which map-reduces content across $N$ open tabs into a unified side-by-side comparison matrix with recommendations.
4. **The Hands (Universal Writer, Ghostwriter & Tiered Autonomy):** Injects rich-text drafts directly into Gmail, LinkedIn, Twitter, and custom forms; provides predictive inline autocomplete pills via an isolated Shadow DOM (<kbd>Tab</kbd> to accept); and manages execution autonomy via an adjustable slider (Manual HITL vs. Supervised Auto-Pilot) with pre-action snapshots and one-click rollback.

---

## 🚀 Quickstart: Installation in 2 Minutes

You can load Madadgar into Google Chrome, Brave, Edge, or Mozilla Firefox using either pre-built ZIP packages or from source.

### Option A: Install Pre-Built Release ZIPs
1. **Google Chrome / Brave / Edge:**
   - Download [`madadgar-chrome-v1.0.0.zip`](https://madadgar-ai-web-browser.vercel.app/madadgar-chrome-v1.0.0.zip).
   - Extract the ZIP folder.
   - Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.
   - Select the extracted `dist/chrome` folder.
2. **Mozilla Firefox:**
   - Download [`madadgar-firefox-v1.0.0.zip`](https://madadgar-ai-web-browser.vercel.app/madadgar-firefox-v1.0.0.zip).
   - Open `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on...** and select `manifest.json` from the extracted folder.

### Option B: Build from Source
```bash
# 1. Clone repository
git clone https://github.com/SyedAliRizve110/Madadgar-AI-Web-Browser.git
cd Madadgar-AI-Web-Browser

# 2. Install dependencies
npm install

# 3. Run automated test suite (49 suites, 368 tests)
npm test

# 4. Build extension bundles
npm run build:chrome    # Outputs native Chrome MV3 bundle to dist/chrome
npm run build:firefox   # Transforms manifest and outputs to dist/firefox

# 5. (Optional) Generate distribution release ZIPs
npm run zip:chrome      # Generates madadgar-chrome-v1.0.0.zip
npm run zip:firefox     # Generates madadgar-firefox-v1.0.0.zip
```

---

## 🔑 Free API Key Setup

Madadgar uses direct REST calls without external client library bloat and operates entirely within free-tier quotas:

1. **Google Gemini (Primary Engine):**
   - Get a free API key at [Google AI Studio](https://aistudio.google.com/).
   - Open the Madadgar Side Panel, click **Settings (gear icon)**, enter your key, and click **Save**.
2. **Groq (Whisper STT & Failover Engine):**
   - Get a free key at [Groq Console](https://console.groq.com/keys).
   - Enter it in Madadgar **Settings** under **Groq API Key**.
   - Powers automatic cloud Whisper fallback and instant failover to `llama-3.3-70b-versatile` if Gemini experiences rate limits.

---

## 🎙️ Push-to-Talk Voice & Continuous Navigation

* **Global Push-to-Talk:** Press <kbd>Alt</kbd> + <kbd>V</kbd> anywhere (on any webpage or within the side panel) or click the microphone icon.
* **One-Click Microphone Permissions:** Chrome side panels run in an isolated frame without an address bar. Madadgar includes a dedicated one-click permission prompt tab (`?request_mic=true`) that grants permanent microphone permissions to the extension origin with zero configuration.
* **Continuous Voice Commands:**
  * *"Scroll down"* / *"Scroll up"* / *"Half page down"*
  * *"Show badges"* (overlays sequential numeric badges over all clickable targets)
  * *"Click badge 2"* (executes native synthetic click on the referenced element)
  * *"Madadgar, undo that"* (reverts the last form fill or action)
* **Bilingual Indian English & Hindi TTS:** Click the speaker icon on any summary to listen aloud with speed controls (`1x`, `1.25x`, `1.5x`). An integrated hardware mute latch prevents acoustic feedback loops.

---

## ✍️ Universal Content Writer & Inline Ghostwriter

* **Universal Rich-Text Injector:** Automatically detects and writes structured rich text into `contenteditable` editors including Gmail, LinkedIn, Twitter/X, ProseMirror, Lexical, and Quill.
* **Context Harvester:** When opening an email thread or article, Madadgar automatically scrapes the sender name, subject line, and previous thread messages to produce tone-adjusted responses.
* **Shadow DOM Ghostwriter Autocomplete:** Pausing for 350ms in any input field displays a floating autocomplete pill anchored directly next to your cursor rendered in an isolated Shadow DOM:
  * Press <kbd>Tab</kbd> to accept the suggestion.
  * Press <kbd>Esc</kbd> or continue typing to dismiss.
  * Automatically suppressed on password and credit card fields.

---

## 📊 Cross-Tab Comparison Engine (Multi-Tab Coordinator)

* **Errand Coordinator & State Pool:** Tracks all managed tabs concurrently, maintaining isolated messaging channels without tab collisions.
* **Map-Reduce Synthesizer:** Select 2 or more open tabs in the **Compare** tab, input comparison criteria (e.g. *"Compare specifications, pros & cons, and value for money"*), and run synthesis:
  * **Map:** Extracts readability and structured content from all selected tabs in parallel.
  * **Reduce:** Compiles the data into a clean, side-by-side comparison matrix with feature rows, pros/cons, and an explicit recommendation card.
  * **Jump to Tab:** One-click button on each column instantly focuses and switches to that tab in your browser.

---

## 🎛️ Tiered Autonomy & Deterministic Safety Charter

AI prompts alone can be bypassed; Madadgar enforces strict physical boundaries in TypeScript code:

```
                      [User Input / Goal]
                               │
                               ▼
                    [Deterministic Classifier]
                     ├── Low Risk (Read/Scroll)  ────────┐
                     └── High Risk (Submit/Pay/Delete)   │
                               │                         │
                               ▼                         ▼
                    [Autonomy FSM Controller]    [Automatic Gated HITL]
                     ├── Co-Pilot: Always Ask            │
                     └── Auto-Pilot: Auto Low-Risk ──────┤
                               │                         │
                               ▼                         ▼
                     [Pre-Action Snapshot]       [Step Approval Card]
                               │                         │
                               ▼                         ▼
                      [Execute Synthetic Action]
                               │
                     [Stagnation Check (3x Repeat Abort)]
                               │
                     [Action Audit Log & Undo Stack]
```

| Layer | Safety Mechanism | Deterministic Implementation |
| :--- | :--- | :--- |
| **Domain Blacklist** | Banking & Financial Portals | Hardcoded domain matcher (`*.onlinesbi.com`, `*.hdfcbank.com`, `*paytm.com`, `*razorpay.com`, `*paypal.com`, `*stripe.com`). Scanning and actions are physically disabled on banking URLs. |
| **Field Sanitizer** | Credential Shield | Elements with `type="password"`, or autocomplete tokens matching `cc-number`, `cvv`, `pin`, `otp`, `one-time-code` are blocked from being read or modified. |
| **Deterministic Risk Gate** | Consequential Action Gate | Actions targeting buttons or forms containing `Submit`, `Pay`, `Transfer`, `Delete`, `Send`, or `Confirm Order` automatically require manual approval regardless of autonomy mode. |
| **Stagnation Detector** | Loop Prevention | Aborts execution if the agent attempts the exact same action 3 consecutive times on the same target. |
| **Undo Stack & Rollback** | DOM Snapshots | Captures scroll coordinates and input values prior to execution, allowing instant rollback via *"Madadgar, undo that"* or the UI Undo button. |
| **Emergency Kill Switch** | Instant Abort | Persistent red stop button in the header immediately aborts in-flight LLM calls, resets orchestrator state, and removes badges. |

---

## 🧪 Testing & Verification Suite

Madadgar includes **49 test suites with 368 passing unit and integration tests**:

```bash
# Run the entire test suite
npm test

# Run tests in watch mode
npx vitest

# Run specific functional slices
npx vitest run src/__tests__/voice_pipeline.test.ts
npx vitest run src/__tests__/cross_tab_synthesizer.test.ts
npx vitest run src/__tests__/tiered_autonomy.test.ts
npx vitest run src/__tests__/universal_writer.test.ts
npx vitest run src/__tests__/text_formatter.test.ts
```

---

## 📦 Project Structure

```
AI-BROWSER/
├── landing/                   # Marketing & showcase landing site (Vercel)
│   ├── index.html             # Landing page with live v2.0 feature showcase & ZIP links
│   └── madadgar-*.zip         # Release packages for Chrome & Firefox
├── scripts/                   # Build and packaging pipeline
│   ├── manifest-transformer.js# Manifest V3 transformer for Firefox Gecko
│   └── package-zip.js         # Zero-dependency ZIP distribution packager
├── src/
│   ├── ai/                    # Gemini & Groq LLM gateways & prompts
│   │   ├── ai_gateway.ts      # Multi-model gateway with rate limit backoff
│   │   ├── gemini_client.ts   # Google Gemini 2.5 Flash-Lite client
│   │   └── prompts/           # Grounded QA, Summarizer, Planner, Element Locator
│   ├── background/            # Background Service Worker & Orchestration
│   │   ├── service_worker.ts  # Central event listener & hotkey handler
│   │   ├── agent_orchestrator.ts # Tiered autonomy FSM & stagnation detector
│   │   ├── tab_coordinator.ts # Multi-tab errand coordinator & state pool
│   │   └── synthesizer.ts     # Map-Reduce cross-tab comparison synthesizer
│   ├── common/                # Shared utilities & Adapters
│   │   ├── sidebar_adapter.ts # Universal Sidebar Adapter (Chrome & Firefox)
│   │   ├── text_formatter.tsx # LaTeX math & Big-O delimiter cleaner
│   │   └── storage_adapter.ts # Type-safe chrome.storage.local adapter
│   ├── content/               # Content scripts injected into web tabs
│   │   ├── extractor.ts       # Article extraction & YouTube caption scraper
│   │   ├── dom_scanner.ts     # Interactive element discovery & indexer
│   │   ├── badge_overlay.ts   # Numbered badges & focus highlighter
│   │   ├── universal_writer.ts# Rich-text writer (Gmail, LinkedIn, Twitter, Lexical)
│   │   ├── context_harvester.ts# Page/Email context harvester
│   │   └── ghostwriter_overlay.ts# Inline autocomplete Shadow DOM pill
│   ├── safety/                # Code-level deterministic guardrails
│   │   ├── domain_rules.ts    # Banking/UPI blacklist
│   │   ├── field_sanitizer.ts # Password/OTP/CVV shield
│   │   └── risk_classifier.ts # Deterministic risk classifier
│   ├── voice/                 # Speech & Audio subsystems
│   │   ├── speech_recognizer.ts# Web Speech STT controller with silence timeout
│   │   ├── whisper_client.ts  # Groq Whisper cloud fallback
│   │   ├── voice_gateway.ts   # Audio coordinator & permission manager
│   │   └── speech_synthesizer.ts# Bilingual TTS with hardware mute latch
│   ├── sidepanel/             # React 18 Extension UI
│   │   ├── App.tsx            # Main shell & tab orchestrator
│   │   └── components/        # Chat, Summary, Pilot, Draft, Compare, AuditLog...
│   └── __tests__/             # 49 Vitest unit and integration test suites
├── manifest.json              # Source Manifest V3 specification
├── package.json               # Package configuration & scripts
└── vite.config.ts             # Vite build configuration
```

---

## 📄 License

Madadgar is licensed under the [MIT License](LICENSE). Built for privacy-first, human-in-the-loop web automation and productive browsing.
