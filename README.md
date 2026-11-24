# Madadgar

### Privacy-Preserving, Human-in-the-Loop Browser Automation & Intelligence Assistant
**Built on Manifest V3 for Chromium (Google Chrome, Brave, Edge) and Gecko (Mozilla Firefox)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Extension-Manifest_V3-3367D6.svg?style=flat)](https://developer.chrome.com/docs/extensions/mv3/)
[![Cross-Browser](https://img.shields.io/badge/Platforms-Chrome%20%7C%20Firefox%20%7C%20Edge%20%7C%20Brave-333333.svg?style=flat)](#cross-browser-support)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5_Strict-3178C6.svg?style=flat)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-49_Suites%20%7C%20368_Passing-28A745.svg?style=flat)](https://vitest.dev/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25_Local_Storage-green.svg?style=flat)](#privacy-and-security-architecture)

---

## Overview

**Madadgar** (*"The Helper"*) is an open-source, local-first browser extension designed for Chrome's native Side Panel and Firefox's Sidebar. It bridges browser intelligence and browser automation by uniting low-latency inference (**Google Gemini 2.5 Flash-Lite** and **Groq Llama 3.3 / Whisper**) with **deterministic code-level safety guardrails**, **voice navigation**, and **tiered execution autonomy**.

Unlike passive AI chat extensions, Madadgar actively interacts with the page: extracting clean readable content, locating interactive elements with on-screen visual badges, drafting contextual replies inside web editors, comparing content across multiple open tabs, and executing multi-step browser errands with human-in-the-loop oversight and transactional undo rollbacks.

---

## Architecture

The system is organized into four decoupled engineering subsystems:

```
+-----------------------------------------------------------------------------------------+
|                                MADADGAR SYSTEM ARCHITECTURE                             |
+--------------------+---------------------+----------------------+-----------------------+
|  Perception & DOM  |   Voice Interface   |   Inference Engine   |  Automation & Safety  |
+--------------------+---------------------+----------------------+-----------------------+
| - Readability DOM  | - Push-to-Talk      | - Grounded Page QA   | - Tiered Autonomy FSM |
|   Sanitization     |   (Alt+V Shortcut)  |   (Zero Hallucinate) |   (Co-Pilot / Auto)   |
| - YouTube Captions | - Web Speech STT +  | - LLM General Mode   | - Deterministic Risk  |
|   & Timestamp Sync |   Groq Whisper Fall | - Cross-Tab Synthes- |   Gate (Pay/Submit)   |
| - LaTeX Math to    | - Bilingual TTS     |   izer (Map-Reduce)  | - Shadow DOM Ghost-   |
|   Unicode Normalizer (Hindi & English)   | - Vision Inspection  |   writer Autocomplete |
| - Cross-Browser    | - Synthetic Voice   |   (Multimodal Capture| - Pre-Action Snapshot |
|   Sidebar Engine   |   DOM Navigation    |    & OCR Analysis)   |   & Undo Rollback     |
+--------------------+---------------------+----------------------+-----------------------+
```

### Core Subsystems

1. **Perception and DOM Normalization:** Uses `@mozilla/readability` to isolate core article bodies from layout noise, parses YouTube caption streams into clickable timestamp anchors, strips raw LaTeX syntax and math delimiters into clean typography, and abstracts Chromium and Gecko DOM APIs through a universal adapter.
2. **Voice Interface:** Integrates local Web Speech API speech recognition with cloud-based Groq Whisper fallback. Features a low-latency push-to-talk shortcut (<kbd>Alt</kbd> + <kbd>V</kbd>), bilingual text-to-speech synthesis (English and Hindi), and synthetic voice navigation (*"Scroll down"*, *"Click badge 2"*, *"Undo that"*).
3. **Inference Engine:** Employs streaming grounded question answering strictly bound to extracted DOM text, an open LLM toggle for unconstrained general reasoning, and a multi-tab map-reduce pipeline that aggregates structured parameters across multiple active tabs into a comparative matrix.
4. **Automation and Deterministic Safety:** Implements a finite state machine supporting two autonomy tiers (step-by-step Co-Pilot approval vs. supervised Auto-Pilot execution). All synthetic DOM actions are intercepted by a deterministic risk classifier that halts destructive or financial operations pending explicit human confirmation.

---

## Feature Matrix

| Subsystem | Feature | Technical Capability |
| :--- | :--- | :--- |
| **Summarizer** | Article Digest | Generates structured summaries (TL;DR, 5 Key Takeaways, Actionable Next Steps) in English and conversational Hinglish. |
| | YouTube Navigation | Scrapes full video transcripts and anchors key moments to interactive timestamp buttons that seek the video on click. |
| **Chat & Search** | Grounded Page QA | Streams answers verified against page context; explicitly declines out-of-context queries to eliminate hallucinations. |
| | Visual Element Locator | Identifies referenced buttons or fields (e.g., *"Where is the checkout button?"*) and renders glowing indicator badges over them. |
| | LLM Mode Switch | Allows instant transition from strict page grounding to open-ended reasoning, translation, and code generation. |
| **Pilot (Automation)** | Co-Pilot Mode | Step-by-step planner: parses goals into discrete actions (click, input, scroll) requiring manual approval before each step. |
| | Auto-Pilot Mode | Hands-free execution triggered via voice or text, automatically running non-consequential steps while preserving safety gates. |
| | Transactional Rollback | Records DOM value snapshots and scroll coordinates before every action, enabling full restoration on user undo. |
| **Draft (Ghostwriter)** | Universal Content Writer | Injects formatted text directly into complex `contenteditable` editors including Gmail, LinkedIn, Twitter/X, and Quill. |
| | Shadow DOM Ghostwriter | Debounced inline autocomplete pill anchored next to the active cursor (<kbd>Tab</kbd> to accept, <kbd>Esc</kbd> to dismiss). |
| **Compare** | Multi-Tab Synthesizer | Gathers text from $N$ selected tabs in parallel (Map) and outputs a normalized comparison matrix with pros, cons, and recommendations (Reduce). |
| **Voice & Speech** | Push-to-Talk (<kbd>Alt</kbd>+<kbd>V</kbd>) | Global shortcut for voice input across any page with automatic voice silence detection and Groq Whisper fallback. |
| | Read Aloud (TTS) | Bilingual playback in Indian English or natural Hindi (`hi-IN`) with hardware mute feedback prevention. |

---

## Installation

Madadgar supports Chromium-based browsers (Google Chrome, Brave, Microsoft Edge, Opera) and Mozilla Firefox through unified Manifest V3 builds.

### Pre-Built Packages

1. **Google Chrome / Brave / Edge:**
   - Download [`madadgar-chrome-v1.0.0.zip`](https://madadgar-ai-web-browser.vercel.app/madadgar-chrome-v1.0.0.zip).
   - Extract the archive to a local directory.
   - Navigate to `chrome://extensions` and enable **Developer mode** (top-right toggle).
   - Click **Load unpacked** and select the extracted folder.

2. **Mozilla Firefox:**
   - Download [`madadgar-firefox-v1.0.0.zip`](https://madadgar-ai-web-browser.vercel.app/madadgar-firefox-v1.0.0.zip).
   - Extract the archive.
   - Navigate to `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on...** and select `manifest.json` from the extracted folder.

---

### Building from Source

**Prerequisites:** Node.js 18.x or higher, npm 9.x or higher.

```bash
# 1. Clone the repository
git clone https://github.com/SyedAliRizve110/Madadgar-AI-Web-Browser.git
cd Madadgar-AI-Web-Browser

# 2. Install dependencies
npm install

# 3. Execute test suite (49 suites, 368 tests)
npm test

# 4. Compile distribution targets
npm run build:chrome     # Generates Chrome MV3 build in dist/chrome
npm run build:firefox    # Transforms manifest and outputs to dist/firefox

# 5. (Optional) Generate release ZIP packages
npm run zip:chrome       # Creates landing/madadgar-chrome-v1.0.0.zip
npm run zip:firefox      # Creates landing/madadgar-firefox-v1.0.0.zip
```

---

## Configuration and API Keys

Madadgar uses direct HTTPS REST calls with zero middleware or proxy servers. API keys are stored locally within the browser's protected extension storage (`chrome.storage.local`).

1. **Google Gemini (Primary Inference Engine):**
   - Obtain a free API key from [Google AI Studio](https://aistudio.google.com/).
   - Open the Madadgar Side Panel, select **Settings** (gear icon), paste your key, and click **Save**.
   - Model utilized: `gemini-2.5-flash-lite` (supports multimodal vision and text).

2. **Groq (Whisper STT & Failover Engine):**
   - Obtain a free API key from [Groq Console](https://console.groq.com/keys).
   - Enter the key in **Settings** under **Groq API Key**.
   - Models utilized: `whisper-large-v3` (audio transcription fallback) and `llama-3.3-70b-versatile` (automated inference failover).

---

## Privacy and Security Architecture

Madadgar is engineered with a strict, defense-in-depth security model. AI prompts alone are not relied upon for safety; all constraints are enforced deterministically in compiled TypeScript before any action reaches the browser engine.

```
                           [User Input / Goal]
                                    │
                                    ▼
                        [Deterministic Risk Classifier]
                        ├── Low Risk (Read/Scroll)  ───────┐
                        └── High Risk (Submit/Pay/Delete)  │
                                    │                      │
                                    ▼                      ▼
                        [Autonomy FSM Controller]   [Automatic Safety Gate]
                        ├── Co-Pilot: Always Prompt        │
                        └── Auto-Pilot: Auto Low-Risk ─────┤
                                    │                      │
                                    ▼                      ▼
                        [Pre-Action Snapshot]      [Human Approval Modal]
                                    │                      │
                                    ▼                      ▼
                        [Execute Synthetic Action]
                                    │
                        [Stagnation Check (3x Repeat Abort)]
                                    │
                        [Action Audit Log & Undo Stack]
```

### Deterministic Safety Specifications

* **Domain Blacklist:** Hardcoded domain matching against financial and banking portals (e.g., `*.onlinesbi.com`, `*.hdfcbank.com`, `*paytm.com`, `*razorpay.com`, `*paypal.com`, `*stripe.com`). All scanning, harvesting, and synthetic automation are physically disabled on matching URLs.
* **Credential Shielding:** Input elements with `type="password"` or autocomplete attributes containing `cc-number`, `cvv`, `pin`, `otp`, or `one-time-code` are excluded from DOM extraction and automated entry.
* **Consequential Risk Gate:** Actions directed at controls containing sensitive tokens (`Submit`, `Pay`, `Buy Now`, `Transfer`, `Delete`, `Confirm`) automatically freeze execution and demand physical human approval regardless of the active autonomy tier.
* **Loop and Stagnation Prevention:** The state machine detects repetitive non-productive operations and automatically aborts if an identical action is executed three consecutive times on the same target.
* **Local Storage Isolation:** No telemetry, browsing histories, page contexts, or user prompts are ever routed through intermediate servers. All data paths run directly from the browser client to the official AI provider endpoints.

---

## Verification and Testing

The codebase maintains rigorous automated test coverage across unit, integration, and security layers using Vitest.

```bash
# Run complete test suite
npm test

# Run tests in watch mode
npx vitest

# Targeted component test suites
npx vitest run src/__tests__/tiered_autonomy.test.ts
npx vitest run src/__tests__/risk_classifier.test.ts
npx vitest run src/__tests__/voice_pipeline.test.ts
npx vitest run src/__tests__/cross_tab_synthesizer.test.ts
npx vitest run src/__tests__/universal_writer.test.ts
npx vitest run src/__tests__/text_formatter.test.ts
```

---

## Project Structure

```
AI-BROWSER/
├── landing/                   # Public documentation & static assets
│   ├── index.html             # Showcase landing page
│   └── madadgar-*.zip         # Compiled distribution packages
├── scripts/                   # Build and transformation tooling
│   ├── manifest-transformer.js# MV3 manifest adapter for Firefox Gecko
│   └── package-zip.js         # Zero-dependency distribution packager
├── src/
│   ├── ai/                    # Multi-provider gateways & prompt templates
│   │   ├── ai_gateway.ts      # Failover engine with exponential backoff
│   │   ├── gemini_client.ts   # Google Gemini REST client
│   │   └── prompts/           # Grounded QA, Summarizer, Planner templates
│   ├── background/            # Background service worker & orchestration
│   │   ├── service_worker.ts  # Extension lifecycle & shortcut router
│   │   ├── agent_orchestrator.ts # Finite state machine & stagnation monitor
│   │   ├── tab_coordinator.ts # Multi-tab errand registry
│   │   └── synthesizer.ts     # Map-reduce cross-tab comparison engine
│   ├── common/                # Shared utilities & cross-browser adapters
│   │   ├── sidebar_adapter.ts # Chrome sidePanel / Firefox sidebarAction bridge
│   │   ├── text_formatter.tsx # LaTeX normalization & inline renderer
│   │   └── storage_adapter.ts # Type-safe local storage abstraction
│   ├── content/               # Content scripts injected into web tabs
│   │   ├── extractor.ts       # Readability DOM & YouTube transcript scraper
│   │   ├── dom_scanner.ts     # Interactive element discovery & indexer
│   │   ├── badge_overlay.ts   # Visual badge overlay & highlight controller
│   │   ├── universal_writer.ts# Rich-text editor injector (Gmail, LinkedIn, etc.)
│   │   ├── context_harvester.ts# Thread metadata & email context harvester
│   │   └── ghostwriter_overlay.ts# Inline autocomplete Shadow DOM pill
│   ├── safety/                # Deterministic security controls
│   │   ├── domain_rules.ts    # Banking domain blacklist
│   │   ├── field_sanitizer.ts # Credential and sensitive data mask
│   │   └── risk_classifier.ts # Consequential action detector
│   ├── voice/                 # Speech & audio subsystems
│   │   ├── speech_recognizer.ts# Web Speech STT controller
│   │   ├── whisper_client.ts  # Groq Whisper REST client
│   │   ├── voice_gateway.ts   # Audio coordinator & permission manager
│   │   └── speech_synthesizer.ts# Bilingual TTS with hardware mute lock
│   ├── sidepanel/             # React 18 user interface
│   │   ├── App.tsx            # Main shell & tab navigation
│   │   └── components/        # View components (Chat, Pilot, Draft, etc.)
│   └── __tests__/             # 49 unit and integration test suites
├── manifest.json              # Source Manifest V3 specification
├── package.json               # Dependencies and build scripts
└── vite.config.ts             # Vite bundler configuration
```

---

## License

Distributed under the [MIT License](LICENSE). Built for privacy-first, human-in-the-loop web automation and productive browsing.
