/**
 * Shared TypeScript definitions and schemas for Madadgar
 */

export type SupportedLanguage = 'en' | 'hinglish';

export interface AppSettings {
  geminiApiKey: string;
  groqApiKey?: string;
  defaultLanguage: SupportedLanguage;
  ghostwriterEnabled?: boolean;
}

export interface UserProfilePersonal {
  fullName: string;
  email: string;
  phone: string;
  location: string;
}

export interface UserProfileAcademic {
  institution: string; // College or University name
  college?: string; // Alias for institution
  degree: string;
  graduationYear: string;
  major: string;
}

export interface UserProfileProfessional {
  skills: string[];
  linkedInUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

export interface UserProfilePreferences {
  defaultLanguage: SupportedLanguage;
  tone: 'formal' | 'casual' | 'academic';
}

export interface UserProfileMemory {
  personal: UserProfilePersonal;
  academic: UserProfileAcademic;
  professional: UserProfileProfessional;
  preferences: UserProfilePreferences;
}

export type ProfileSectionKey = 'personal' | 'academic' | 'professional' | 'preferences';

export type SkillCategory = 'study' | 'writing' | 'forms' | 'custom' | 'summary' | 'reply' | 'form';

export interface SavedSkill {
  id: string;
  name: string;
  title?: string; // alias for name
  description: string;
  promptTemplate: string;
  category: SkillCategory;
  tags: string[];
  systemPromptAddendum?: string;
  userPromptTemplate?: string; // alias for promptTemplate
  requiresProfile?: boolean;
  targetTab?: 'chat' | 'agent' | 'summarizer';
  version?: string;
  isBuiltIn?: boolean;
  createdAt: number;
}

export interface ActionPreSnapshot {
  targetId?: number;
  action: AgentActionType;
  previousValue?: string;
  previousScroll?: { x: number; y: number };
  timestamp: number;
}

export type HarvestedPageType = 'email' | 'article' | 'general';

export interface HarvestedPageContext {
  type: HarvestedPageType;
  url: string;
  title?: string;
  sender?: string;
  subject?: string;
  bodySnippet?: string;
  fullBody?: string;
  summary?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  taskId: string;
  stepIndex: number;
  actionType: 'click' | 'type' | 'select' | 'scroll' | 'done' | 'fail';
  targetBadgeId?: number;
  description: string;
  reasoning: string;
  userDecision: 'approved' | 'skipped' | 'stopped';
  url?: string;
  tabTitle?: string;
  value?: string;
  executionSuccess?: boolean;
  error?: string;
  canUndo?: boolean;
  preSnapshot?: ActionPreSnapshot;
}

export interface StorageSchema {
  gemini_api_key?: string;
  groq_api_key?: string;
  preferred_language?: SupportedLanguage;
  settings?: AppSettings;
  profile_memory?: UserProfileMemory;
  saved_skills?: SavedSkill[];
  audit_logs?: AuditLogEntry[];
  active_task_session?: AgentTaskSession;
}

export interface ExtractedArticle {
  title: string;
  textContent: string;
  byline: string | null;
  length: number;
  excerpt?: string;
  siteName?: string | null;
}

export interface YouTubeTranscriptSegment {
  text: string;
  start: number; // In seconds
  duration: number; // In seconds
  timestamp: string; // [mm:ss] or [hh:mm:ss]
}

export interface YouTubeTranscriptResult {
  videoId: string;
  title: string;
  channelTitle?: string;
  hasTranscript: boolean;
  transcriptText: string;
  segments: YouTubeTranscriptSegment[];
  description?: string;
  fallbackReason?: string;
}

export interface ExtractedContentResult extends ExtractedArticle {
  isYouTube?: boolean;
  youTubeData?: YouTubeTranscriptResult;
  selection?: string;
}

export interface PageContext {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  selection?: string;
  textContent: string;
  byline?: string | null;
  length: number;
  isYouTube?: boolean;
  youTubeData?: YouTubeTranscriptResult;
  timestamp?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: boolean;
  contextTitle?: string;
  contextUrl?: string;
  imageThumbnail?: string;
}


export type ContextMenuActionId = 'madadgar_explain' | 'madadgar_translate' | 'madadgar_draft' | 'custom' | 'voice';

export interface ContextMenuActionPayload {
  actionId: ContextMenuActionId;
  selectedText: string;
  prompt: string;
  tabId?: number;
  tabTitle?: string;
  tabUrl?: string;
  timestamp: number;
}

export type PortMessageType =
  | 'GET_PAGE_CONTEXT'
  | 'PAGE_CONTEXT_RESULT'
  | 'TAB_CHANGED'
  | 'TAB_UPDATED'
  | 'WINDOW_FOCUS_CHANGED'
  | 'TOGGLE_VOICE_INPUT'
  | 'SYNC_PAGE_CONTEXT'
  | 'CONTEXT_MENU_ACTION'
  | 'CAPTURE_VISIBLE_TAB'
  | 'STREAM_START'
  | 'STREAM_CHUNK'
  | 'STREAM_END'
  | 'STREAM_ERROR'
  | 'PING'
  | 'PONG';

export interface BasePortMessage {
  type: PortMessageType;
  requestId?: string;
}

export interface GetPageContextMessage extends BasePortMessage {
  type: 'GET_PAGE_CONTEXT';
  tabId?: number;
  forceRefresh?: boolean;
}

export interface PageContextResultMessage extends BasePortMessage {
  type: 'PAGE_CONTEXT_RESULT';
  context: PageContext | null;
  error?: string;
}

export interface TabChangedMessage extends BasePortMessage {
  type: 'TAB_CHANGED';
  tabId: number;
  windowId: number;
}

export interface TabUpdatedMessage extends BasePortMessage {
  type: 'TAB_UPDATED';
  tabId: number;
  url?: string;
  title?: string;
  status?: string;
}

export interface WindowFocusChangedMessage extends BasePortMessage {
  type: 'WINDOW_FOCUS_CHANGED';
  windowId: number;
  tabId?: number;
}

export interface ToggleVoiceInputMessage extends BasePortMessage {
  type: 'TOGGLE_VOICE_INPUT';
}

export interface StreamChunkMessage extends BasePortMessage {
  type: 'STREAM_CHUNK';
  chunk: string;
  accumulated: string;
}

export interface ContextMenuActionMessage extends BasePortMessage {
  type: 'CONTEXT_MENU_ACTION';
  payload: ContextMenuActionPayload;
}

export interface CaptureScreenshotMessage extends BasePortMessage {
  type: 'CAPTURE_VISIBLE_TAB';
  windowId?: number;
  quality?: number;
}

export interface ScreenCaptureResult {
  success: boolean;
  dataUrl?: string;
  error?: string;
  timestamp: number;
}

export interface DownscaledImageResult {
  dataUrl: string;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}

export type PortMessage =
  | GetPageContextMessage
  | PageContextResultMessage
  | TabChangedMessage
  | TabUpdatedMessage
  | WindowFocusChangedMessage
  | ToggleVoiceInputMessage
  | StreamChunkMessage
  | ContextMenuActionMessage
  | CaptureScreenshotMessage
  | BasePortMessage;

export interface ExtractReadabilityMessage {
  type: 'EXTRACT_READABILITY_CONTENT';
}

export interface ExtractYouTubeTranscriptMessage {
  type: 'EXTRACT_YOUTUBE_TRANSCRIPT';
  videoId?: string;
}

export interface SeekYouTubeVideoMessage {
  type: 'SEEK_YOUTUBE_VIDEO';
  seconds: number;
}

export interface GetPageSelectionMessage {
  type: 'GET_PAGE_SELECTION';
}

export interface ExtractReadabilityResponse extends ExtractedContentResult {
  error?: string;
}

// ---------------------------------------------------------------------------
// Phase 3: Human-in-the-Loop Browser Actions ("The Hands") Types
// ---------------------------------------------------------------------------

export interface ScannedElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface ScannedElement {
  id: number;
  tag: string;
  type?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  currentValue?: string;
  text?: string;
  role?: string;
  href?: string;
  disabled?: boolean;
  isPassword?: boolean;
  isConsequential?: boolean;
  rect: ScannedElementRect;
}

export type OverlayHighlightMode = 'proposed' | 'dry-run' | 'pulse';

export interface ScanDOMResponse {
  success: boolean;
  count: number;
  elements: ScannedElement[];
  url: string;
  title: string;
  error?: string;
}

export interface ScanDOMMessage {
  type: 'SCAN_INTERACTIVE_DOM';
  renderBadges?: boolean;
}

export interface ClearBadgesMessage {
  type: 'CLEAR_BADGES';
}

export interface HighlightElementMessage {
  type: 'HIGHLIGHT_ELEMENT';
  targetId: number;
  mode?: OverlayHighlightMode;
}

export interface ClearHighlightsMessage {
  type: 'CLEAR_HIGHLIGHTS';
}

export interface ElementLocatorResult {
  targetId: number | null;
  reason: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface LocateElementMessage {
  type: 'LOCATE_ELEMENT';
  query: string;
  elements?: ScannedElement[];
}

export interface LocateElementResponse {
  success: boolean;
  result?: ElementLocatorResult;
  error?: string;
}

export type AgentActionType = 'click' | 'type' | 'select' | 'scroll' | 'done' | 'fail';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'HARD_BLOCKED';

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  isHardBlocked: boolean;
  requiresConfirmation: boolean;
  reasons: string[];
  signals: {
    financial: boolean;
    credentials: boolean;
    destructive: boolean;
    blacklistedDomain: boolean;
    currencyDetected?: string;
    formAction?: string;
  };
}

export type AutonomyMode = 'co-pilot' | 'auto-pilot';

export interface AgentActionProposal {
  action: AgentActionType;
  target_id?: number;
  value?: string;
  reason: string;
  is_consequential?: boolean;
  risk_score?: number;
  risk_level?: RiskLevel;
}

export interface ExecuteActionMessage {
  type: 'EXECUTE_ACTION';
  action: AgentActionProposal;
  dryRun?: boolean;
}

export interface ExecuteActionResponse {
  success: boolean;
  action: AgentActionType;
  targetId?: number;
  value?: string;
  error?: string;
  dryRun?: boolean;
  preSnapshot?: ActionPreSnapshot;
}

// ---------------------------------------------------------------------------
// Task 3.6: HITL Agent Orchestrator Finite State Machine (FSM) Types
// ---------------------------------------------------------------------------

export type AgentFSMStatus =
  | 'IDLE'
  | 'SCANNING_DOM'
  | 'DOM_MAPPED'
  | 'REASONING_AI'
  | 'SAFETY_VALIDATION'
  | 'BLOCKED_SAFETY'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING_ACTION'
  | 'VERIFYING_STATE'
  | 'SKIPPING_STEP'
  | 'TASK_COMPLETED'
  | 'TASK_ABORTED'
  | 'ERROR';

export interface AgentTaskStepHistory {
  step: number;
  action: AgentActionProposal;
  result?: ExecuteActionResponse;
  timestamp: number;
}

export interface AgentTaskSession {
  taskId: string;
  goal: string;
  tabId: number;
  url?: string;
  currentStep: number;
  maxSteps: number;
  status: AgentFSMStatus;
  pendingProposal?: AgentActionProposal | null;
  history: AgentTaskStepHistory[];
  error?: string | null;
  dryRun?: boolean;
  autonomyMode?: AutonomyMode;
  consecutiveIdenticalActions?: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Task 5.4 & 5.5: Voice Speech & Fallback Subsystem Types
// ---------------------------------------------------------------------------

export type VoiceInputState = 'idle' | 'listening' | 'recording' | 'processing' | 'error';
export type VoiceEngineType = 'local-speech' | 'cloud-whisper' | 'none';

export interface VoiceTranscriptResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  engine: 'local' | 'whisper';
  lowConfidence?: boolean;
}

export interface VoicePermissionStatus {
  state: 'granted' | 'denied' | 'prompt' | 'unsupported';
  canAsk: boolean;
  instructions?: string;
}

// ---------------------------------------------------------------------------
// Tasks 5.6 & 5.7: Bilingual TTS Voice Engine & Voice Intent Router
// ---------------------------------------------------------------------------

export type TTSPlaybackState = 'idle' | 'speaking' | 'paused';

export interface TTSOptions {
  lang?: SupportedLanguage | string;
  rate?: number; // 0.75, 1.0, 1.25, 1.5, 2.0
  pitch?: number;
  volume?: number;
  voiceName?: string;
}

export interface TTSVoiceInfo {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

export type VoiceIntentType =
  | 'SUMMARIZE_PAGE'
  | 'READ_ALOUD_SUMMARY'
  | 'STOP_SPEAKING'
  | 'PAUSE_SPEAKING'
  | 'RESUME_SPEAKING'
  | 'NAVIGATE_SCROLL'
  | 'CLICK_BADGE'
  | 'CLICK_ELEMENT_TEXT'
  | 'BROWSER_NAVIGATION'
  | 'TASK_CONTROL'
  | 'GENERAL_INPUT';

export interface VoiceIntent {
  type: VoiceIntentType;
  rawText: string;
  cleanedText: string;
  audioBriefingRequested?: boolean;
  language?: SupportedLanguage;
  confidence?: number;
  scrollDirection?: 'up' | 'down' | 'top' | 'bottom' | 'half_up' | 'half_down';
  badgeNumber?: number;
  targetText?: string;
  browserNav?: 'back' | 'forward' | 'reload';
  taskControl?: 'pause' | 'resume' | 'cancel' | 'approve' | 'skip' | 'undo';
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Phase 7: Multi-Tab Intelligence & Comparison Types (Tasks 7.1 & 7.2)
// ---------------------------------------------------------------------------

export type ManagedTabStatus = 'opening' | 'loading' | 'ready' | 'error' | 'closed';

export interface ManagedTab {
  tabId: number;
  url: string;
  title?: string;
  status: ManagedTabStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface ComparisonItem {
  tabId: number;
  title: string;
  url: string;
  attributes: Record<string, string>;
}

export interface ComparisonMatrix {
  topic: string;
  attributes: string[];
  items: ComparisonItem[];
  summary: string;
  recommendation?: string;
}

export interface TabExtractionResult {
  tabId: number;
  url: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
}



