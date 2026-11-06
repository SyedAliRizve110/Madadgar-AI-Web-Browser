# 🛡️ Madadgar (مددگار / मददगार)
### Human-in-the-Loop AI Browser Assistant for Google Chrome (Manifest V3)

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Live Landing Page](https://img.shields.io/badge/Website-madadgar--ai--web--browser.vercel.app-000?logo=vercel)](https://madadgar-ai-web-browser.vercel.app/)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict_Mode-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite_5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Tests-35_suites_|_230_passed-brightgreen?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Zero External Telemetry](https://img.shields.io/badge/Privacy-100%25_Local_Storage-success)](#-privacy--deterministic-safety-charter)

> **Madadgar** (*"The Helper"*) is an open-source, privacy-preserving browser assistant built for Chrome's native Side Panel. It combines fast AI reasoning (**Google Gemini 2.5 Flash-Lite** with **Groq Llama 3.3** failover) with **deterministic code-level safety guardrails** and a strict **Human-in-the-Loop (HITL)** architecture: the AI inspects and proposes actions, but you stay in full control of every step.

---

## 🌟 Core Pillars

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MADADGAR ARCHITECTURE                          │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│  👁️ The Eyes    │  🧠 The Brain   │  🤝 The Hands    │  🛡️ The Shield  │
│  (Read & Parse) │  (Grounded QA)  │  (HITL Actions)  │  (Guardrails)   │
├─────────────────┼─────────────────┼──────────────────┼─────────────────┤
│ • Readability   │ • Grounded Page │ • Interactive    │ • Hardcoded     │
│   DOM Purifier  │   Streaming QA  │   DOM Scanner    │   Banking Lock  │
│ • Public YouTube│ • Context Menus │ • Numbered Badge │ • Password/OTP  │
│   Captions      │   (Explain/     │   Highlighter    │   Sanitizer     │
│ • Bilingual En/ │    Translate)   │ • Step Approval  │ • Consequential │
│   Hinglish Mode │ • Multimodal    │   (Approve/Skip/ │   Action Gate   │
│ • TL;DR + Steps │   Screen Vision │    Dry-Run/Stop) │ • Kill Switch   │
└─────────────────┴─────────────────┴──────────────────┴─────────────────┘
```

1. **The Eyes (Reading & Purification):** Extracts clutter-free article text via `@mozilla/readability` and scrapes public YouTube video transcripts to produce structured TL;DR summaries, key points, and action items in English or conversational Hinglish.
2. **The Brain (Page Understanding & Vision):** Provides streaming conversational QA grounded strictly in the active page's context to eliminate hallucinations, right-click context menu shortcuts, and multimodal visible tab screenshot inspection.
3. **The Hands (Human-in-the-Loop Errand Pilot):** Scans page input fields and buttons, displays non-interfering numbered badges, and proposes sequential actions via an approval card (`Approve`, `Skip`, `Dry-Run`, `Stop`).
4. **The Memory & Safety Shield:** Stores personal and academic profiles exclusively in `chrome.storage.local` for 1-click form filling, provides saved skill recipes (import/export JSON), and physically enforces banking domain blacklists, sensitive credential shields, and emergency kill switches.

---

## 🚀 Quickstart: Loading in Chrome (2 Minutes)

You can load Madadgar either directly from source or using the pre-packaged distribution archive.

### Option A: Install Pre-Built Release ZIP
1. Download **`madadgar-v1.0.0.zip`** from the [Landing Site](https://madadgar-ai-web-browser.vercel.app/) ([Direct ZIP Download](https://madadgar-ai-web-browser.vercel.app/madadgar-v1.0.0.zip)) or [GitHub Releases](https://github.com/SyedAliRizve110/Madadgar-AI-Web-Browser/releases).
2. Extract the ZIP file into a local folder.
3. Open Google Chrome and enter `chrome://extensions` in the URL bar.
4. Enable **Developer mode** via the toggle switch in the top-right corner.
5. Click **Load unpacked** and select the extracted folder.
6. Click the extension puzzle icon in the Chrome toolbar and pin **Madadgar**.

### Option B: Build from Source
```bash
# 1. Clone repository
git clone https://github.com/SyedAliRizve110/Madadgar-AI-Web-Browser.git
cd Madadgar-AI-Web-Browser

# 2. Install dependencies
npm install

# 3. Run test suite
npm test

# 4. Build extension
npm run build

# 5. (Optional) Generate release package zip
npm run zip
```
The compiled, optimized extension is now located in the `dist/` directory, ready to be loaded via Chrome's **Load unpacked** button.

---

## 🔑 Free API Key Setup

Madadgar uses direct REST calls without heavy external SDK dependencies and runs entirely on free-tier API quotas.

### 1. Google Gemini (Primary Engine)
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google Account and click **Get API key** $\rightarrow$ **Create API key**.
3. Open the Madadgar Side Panel by clicking the extension icon.
4. Click the **Gear icon (Settings)** at the top right.
5. Paste your Gemini API key and click **Save & Test Connection**.

### 2. Groq (Optional Resilience Fallback)
1. Visit [Groq Console](https://console.groq.com/keys).
2. Sign in and create a free API key.
3. In Madadgar **Settings**, paste your key into the **Groq API Key (Optional Fallback)** field.
4. If Gemini encounters an HTTP 429 rate limit, Madadgar automatically fails over to `llama-3.3-70b-versatile` without interrupting your session.

---

## 🛡️ Privacy & Deterministic Safety Charter

AI prompts alone cannot guarantee security. Madadgar enforces non-negotiable safety guardrails directly in TypeScript code:

| Layer | Safety Mechanism | Deterministic Implementation |
| :--- | :--- | :--- |
| **Domain Blacklist** | Banking & Financial Portals | Hardcoded domain matcher (`*.onlinesbi.com`, `*.hdfcbank.com`, `*paytm.com`, `*razorpay.com`, `*paypal.com`, `*stripe.com`). Extension scanning and actions are disabled on banking URLs. |
| **Field Sanitizer** | Credential Shield | Elements with `type="password"`, or autocomplete tokens matching `cc-number`, `cvv`, `pin`, `otp`, `one-time-code` are blocked from being read or modified. |
| **Consequential Gate** | Elevated Approval | Buttons containing `Submit`, `Pay`, `Transfer`, `Delete`, `Send`, or `Confirm Order` require explicit double-confirmation. |
| **Emergency Kill Switch** | Instant Abort | Persistent red stop button in the header immediately cancels in-flight LLM calls, clears badge overlays, and resets agent state to `IDLE`. |
| **Local Memory** | Zero Outbound Sync | All profile details and custom skills are stored strictly in `chrome.storage.local`. No analytics, tracking, or external database calls. |

---

## 🖥️ Walkthrough of Key Features

### 1. Article & YouTube Summarizer
- Extracts core readable content from blogs, news, and documentation using `@mozilla/readability`.
- Automatically retrieves public captions on `youtube.com/watch` pages.
- Produces clean summaries with:
  - **TL;DR** callout box
  - **5 Key Highlights**
  - **Action Items Checklist**
- **Bilingual Toggle:** Switch seamlessly between English and colloquial **Hinglish** (Roman script Hindi mixed with English technical terms).

### 2. Grounded Chat & Multimodal QA
- Chat with any webpage via a persistent Side Panel interface.
- Strictly grounded prompts instruct the model to answer only using page evidence and explicitly flag missing information.
- Click **Capture Screenshot** to inspect visual diagrams, financial graphs, and layouts using Gemini Vision.
- Right-click any selected text on the web to trigger **Explain**, **Translate (Hinglish)**, or **Draft Reply** in the side panel.

### 3. Human-in-the-Loop Browser Errand Pilot
- **Interactive DOM Scanner:** Indexes inputs, buttons, select dropdowns, and textareas with stable sequential IDs (`#1`, `#2`, `#3`...).
- **Numbered Badge Highlighter:** Injects lightweight SVG badges above interactive elements.
- **Natural Language Element Finder:** Type *"find the resume upload button"* or *"locate the next page link"* to scroll to and highlight the element.
- **HITL Approval Cards:** Every proposed action shows the action type, target element selector, badge index, and proposed value with 4 options:
  - `Approve`: Execute synthetic event.
  - `Skip`: Advance to next step.
  - `Dry-Run`: Highlight element without firing events.
  - `Stop`: Terminate task.
- **Audit Log:** Complete timeline of approved, skipped, and executed actions with exportable records.

### 4. Profile Memory & Auto Form-Filling
- Store your standard profile fields in the Side Panel (**Personal**, **Academic**, **Professional**, **Preferences**).
- When applying to internships or filling practice errands, click **Fill Form from Profile**:
  - Automatically correlates form inputs with stored profile fields.
  - Presents proposed values in the HITL approval card for individual sign-off.

### 5. Saved Skills Catalog & Prompt Recipes
- Pre-built one-click recipes:
  - *Exam Revision Notes*
  - *Explain in Conversational Hinglish*
  - *Draft Professional Email Response*
  - *Fill Form from Profile*
- **Custom Skills Creator:** Save your own prompt workflows.
- **Export & Import:** Download your skills as `madadgar-skills.json` and import them on any machine.

---

## 🛠️ Project Structure

```
AI-BROWSER/
├── landing/                   # Marketing landing site (deployed to Vercel)
│   └── index.html             # Showcase, quickstart guide & direct ZIP link
├── scripts/                   # Build & packaging utilities
│   └── package-zip.js         # Zero-dependency cross-platform ZIP generator
├── src/
│   ├── ai/                    # AI Gateway & Clients
│   │   ├── ai_gateway.ts      # Multi-model gateway with 429 retry & Groq fallback
│   │   ├── gemini_client.ts   # Google Gemini 2.5 Flash-Lite SSE client
│   │   ├── groq_client.ts     # Groq Llama 3.3 REST client
│   │   └── prompts/           # Grounded QA, Summarizer, Planner, Element Locator
│   ├── background/            # Manifest V3 Service Worker
│   │   ├── service_worker.ts  # Background coordinator & side panel lifecycles
│   │   ├── agent_orchestrator.ts # HITL action state machine (FSM)
│   │   └── message_bus.ts     # Strongly typed extension communication
│   ├── common/                # Shared utilities & Storage
│   │   ├── storage_adapter.ts # Type-safe chrome.storage.local wrapper
│   │   └── types.ts           # Shared TypeScript schemas & contracts
│   ├── content/               # Content Scripts injected into Web Pages
│   │   ├── extractor.ts       # Readability.js article & YouTube caption scraper
│   │   ├── dom_scanner.ts     # Interactive element discovery & indexer
│   │   ├── badge_overlay.ts   # Numbered badges & focus highlighter
│   │   ├── action_executor.ts # Safe synthetic event dispatcher
│   │   └── guardrails.ts      # In-page safety intercepts
│   ├── safety/                # Deterministic Safety Rules
│   │   ├── domain_rules.ts    # Banking & UPI domain blacklist
│   │   ├── field_sanitizer.ts # Password, CVV, OTP, and sensitive field shield
│   │   └── action_validator.ts# Consequential button double-confirmation
│   ├── sidepanel/             # React 18 Side Panel UI
│   │   ├── App.tsx            # Main shell & tab navigation
│   │   └── components/        # ChatView, SummaryCard, ProfileManager, SkillsDrawer...
│   └── __tests__/             # Comprehensive Vitest test suite (35 suites)
├── public/                    # Extension icons & static assets
├── manifest.json              # Chrome Manifest V3 descriptor
├── package.json               # Scripts & dependencies
├── vite.config.ts             # Vite + CRXJS extension build configuration
└── README.md                  # Project documentation
```

---

## 🧪 Testing & Verification

Madadgar includes 35 test suites covering all vertical slices across Phases 1 through 4:

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode
npx vitest

# Run a specific test suite
npx vitest run src/__tests__/safety_guardrails.test.ts
npx vitest run src/__tests__/form_filling.test.ts
npx vitest run src/__tests__/package_zip.test.ts
```

---

## 📦 Distribution Scripts

- `npm run build`: Compiles TypeScript and runs Vite production bundling to `dist/`.
- `npm run zip`: Rebuilds the extension and packages `dist/` into `madadgar-v1.0.0.zip` ready for GitHub releases or distribution.
- `npm run lint`: Verifies strict TypeScript type conformance with `tsc --noEmit`.

---

## 📄 License

Madadgar is licensed under the [MIT License](LICENSE). Built for learning, personal productivity, and safe human-in-the-loop web automation.

