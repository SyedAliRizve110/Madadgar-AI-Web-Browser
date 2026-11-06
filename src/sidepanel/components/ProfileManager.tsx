import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  MapPin,
  GraduationCap,
  Award,
  BookOpen,
  Calendar,
  Briefcase,
  Globe,
  Linkedin,
  Github,
  MessageSquare,
  Save,
  CheckCircle2,
  Trash2,
  Download,
  Upload,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';
import {
  getUserProfile,
  saveUserProfile,
  clearUserProfile,
  exportUserProfileJson,
  importUserProfileJson,
  DEFAULT_USER_PROFILE,
  DEMO_USER_PROFILE,
} from '@/common/storage_adapter';
import type { UserProfileMemory, ProfileSectionKey } from '@/common/types';

export interface ProfileManagerProps {
  onProfileUpdated?: (profile: UserProfileMemory) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const ProfileManager: React.FC<ProfileManagerProps> = ({
  onProfileUpdated,
  onClose,
  isModal = false,
}) => {
  const [profile, setProfile] = useState<UserProfileMemory>({ ...DEFAULT_USER_PROFILE });
  const [activeSection, setActiveSection] = useState<ProfileSectionKey>('personal');
  const [newSkillInput, setNewSkillInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load profile from chrome.storage.local on mount
  useEffect(() => {
    loadSavedProfile();
  }, []);

  const loadSavedProfile = async () => {
    try {
      const loaded = await getUserProfile();
      setProfile(loaded);
      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.warn('[ProfileManager] Failed to load user profile:', err);
      setStatusMessage('Failed to load profile from storage');
    }
  };

  // Field change handler
  const handleFieldChange = (
    section: ProfileSectionKey,
    field: string,
    value: any
  ) => {
    setProfile((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
    setHasUnsavedChanges(true);
    setSaveStatus('idle');
  };

  // Skill tag handlers
  const handleAddSkill = () => {
    const trimmed = newSkillInput.trim();
    if (!trimmed) return;
    if (profile.professional.skills.includes(trimmed)) {
      setNewSkillInput('');
      return;
    }
    const updatedSkills = [...profile.professional.skills, trimmed];
    handleFieldChange('professional', 'skills', updatedSkills);
    setNewSkillInput('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    const updatedSkills = profile.professional.skills.filter((s) => s !== skillToRemove);
    handleFieldChange('professional', 'skills', updatedSkills);
  };

  const handleKeyDownSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddSkill();
    }
  };

  // Save handler
  const handleSave = async () => {
    setSaveStatus('saving');
    setStatusMessage(null);
    try {
      await saveUserProfile(profile);
      setSaveStatus('saved');
      setHasUnsavedChanges(false);
      setStatusMessage('Profile saved to local storage!');
      if (onProfileUpdated) {
        onProfileUpdated(profile);
      }
      setTimeout(() => {
        setSaveStatus('idle');
        setStatusMessage(null);
      }, 3000);
    } catch (err: any) {
      setSaveStatus('error');
      setStatusMessage(err?.message || 'Failed to save profile');
    }
  };

  // Clear / Reset profile
  const handleClear = async () => {
    try {
      await clearUserProfile();
      setProfile({
        personal: { ...DEFAULT_USER_PROFILE.personal },
        academic: { ...DEFAULT_USER_PROFILE.academic },
        professional: {
          ...DEFAULT_USER_PROFILE.professional,
          skills: [...DEFAULT_USER_PROFILE.professional.skills],
        },
        preferences: { ...DEFAULT_USER_PROFILE.preferences },
      });
      setShowClearConfirm(false);
      setHasUnsavedChanges(false);
      setStatusMessage('Profile reset to blank defaults.');
      if (onProfileUpdated) {
        onProfileUpdated(DEFAULT_USER_PROFILE);
      }
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage('Failed to reset profile');
    }
  };

  // Load Demo Profile
  const handleLoadDemo = () => {
    setProfile(JSON.parse(JSON.stringify(DEMO_USER_PROFILE)));
    setHasUnsavedChanges(true);
    setStatusMessage('Loaded sample student profile (Aarav Sharma). Click Save to commit.');
  };

  // Export JSON
  const handleExport = async () => {
    try {
      const json = await exportUserProfileJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `madadgar-profile-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage('Profile exported successfully!');
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      setStatusMessage('Export failed: ' + err.message);
    }
  };

  // Import JSON
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const imported = await importUserProfileJson(text);
        setProfile(imported);
        setHasUnsavedChanges(false);
        setStatusMessage('Profile imported and saved successfully!');
        if (onProfileUpdated) {
          onProfileUpdated(imported);
        }
        setTimeout(() => setStatusMessage(null), 3000);
      } catch (err: any) {
        setStatusMessage(err?.message || 'Failed to parse profile JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Calculate completeness percentage (12 key fields)
  const calculateCompleteness = (): number => {
    let filled = 0;
    const total = 12;
    if (profile.personal.fullName.trim()) filled++;
    if (profile.personal.email.trim()) filled++;
    if (profile.personal.phone.trim()) filled++;
    if (profile.personal.location.trim()) filled++;
    if (profile.academic.institution.trim()) filled++;
    if (profile.academic.degree.trim()) filled++;
    if (profile.academic.major.trim()) filled++;
    if (profile.academic.graduationYear.trim()) filled++;
    if (profile.professional.skills.length > 0) filled++;
    if (profile.professional.linkedInUrl.trim()) filled++;
    if (profile.professional.githubUrl.trim()) filled++;
    if (profile.professional.portfolioUrl.trim()) filled++;
    return Math.round((filled / total) * 100);
  };

  const completeness = calculateCompleteness();

  return (
    <div className={`flex flex-col h-full bg-slate-50 text-slate-800 ${isModal ? 'max-w-lg mx-auto' : ''}`}>
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <span>Profile Memory</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Local-Only
                </span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Powers one-click autofill for job & internship forms
              </p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close Profile"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Profile Completion Meter */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-600 font-medium text-[11px]">Profile Completeness</span>
            <span className="font-semibold text-indigo-600 text-[11px]">{completeness}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                completeness >= 80
                  ? 'bg-emerald-500'
                  : completeness >= 40
                  ? 'bg-indigo-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between gap-1.5 mt-3 pt-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleLoadDemo}
              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded border border-indigo-200/60 inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Preload sample college student profile"
            >
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Sample Profile</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded border border-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Export profile JSON"
            >
              <Download className="w-3 h-3 text-slate-500" />
              <span>Export</span>
            </button>

            <label
              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded border border-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Import profile JSON"
            >
              <Upload className="w-3 h-3 text-slate-500" />
              <span>Import</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
            title="Reset profile to blank"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Clear Confirmation Dialog */}
        {showClearConfirm && (
          <div className="mt-2.5 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2 animate-in fade-in">
            <p className="text-red-800 font-medium text-[11px]">
              Reset all saved profile fields to blank?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Yes, Reset
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded text-[11px] font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mt-2 p-2 rounded text-xs flex items-center gap-1.5 ${
              statusMessage.includes('Failed') || statusMessage.includes('error')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {statusMessage.includes('Failed') ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="text-[11px]">{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Section Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-100/80 px-2 py-1 gap-1 text-xs shrink-0 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSection('personal')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeSection === 'personal'
              ? 'bg-white text-indigo-600 shadow-2xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Personal</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('academic')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeSection === 'academic'
              ? 'bg-white text-indigo-600 shadow-2xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Academic</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('professional')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeSection === 'professional'
              ? 'bg-white text-indigo-600 shadow-2xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Professional</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('preferences')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeSection === 'preferences'
              ? 'bg-white text-indigo-600 shadow-2xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Preferences</span>
        </button>
      </div>

      {/* Main Form Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* 1. PERSONAL INFORMATION */}
        {activeSection === 'personal' && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={profile.personal.fullName}
                  onChange={(e) => handleFieldChange('personal', 'fullName', e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="email"
                  value={profile.personal.email}
                  onChange={(e) => handleFieldChange('personal', 'email', e.target.value)}
                  placeholder="e.g. aarav.sharma@example.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="tel"
                  value={profile.personal.phone}
                  onChange={(e) => handleFieldChange('personal', 'phone', e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Current Location / City
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={profile.personal.location}
                  onChange={(e) => handleFieldChange('personal', 'location', e.target.value)}
                  placeholder="e.g. Bengaluru, Karnataka, India"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. ACADEMIC DETAILS */}
        {activeSection === 'academic' && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                College / University
              </label>
              <div className="relative">
                <GraduationCap className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={profile.academic.institution}
                  onChange={(e) => handleFieldChange('academic', 'institution', e.target.value)}
                  placeholder="e.g. National Institute of Technology"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Degree / Qualification
              </label>
              <div className="relative">
                <Award className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={profile.academic.degree}
                  onChange={(e) => handleFieldChange('academic', 'degree', e.target.value)}
                  placeholder="e.g. Bachelor of Technology (B.Tech)"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Major / Field of Study
              </label>
              <div className="relative">
                <BookOpen className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={profile.academic.major}
                  onChange={(e) => handleFieldChange('academic', 'major', e.target.value)}
                  placeholder="e.g. Computer Science & Engineering"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Graduation Year
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={profile.academic.graduationYear}
                  onChange={(e) => handleFieldChange('academic', 'graduationYear', e.target.value)}
                  placeholder="e.g. 2025"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. PROFESSIONAL EXPERIENCE */}
        {activeSection === 'professional' && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Key Skills & Technologies
              </label>
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newSkillInput}
                    onChange={(e) => setNewSkillInput(e.target.value)}
                    onKeyDown={handleKeyDownSkill}
                    placeholder="Type skill & press Enter (e.g. React)"
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddSkill}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Skill Chips */}
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-white border border-slate-200 rounded-lg">
                  {profile.professional.skills.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">
                      No skills added yet. Add skills like React, TypeScript, Python...
                    </span>
                  ) : (
                    profile.professional.skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-medium"
                      >
                        <span>{skill}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill)}
                          className="text-indigo-400 hover:text-indigo-700 rounded transition-colors cursor-pointer"
                          title={`Remove ${skill}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                LinkedIn Profile URL
              </label>
              <div className="relative">
                <Linkedin className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="url"
                  value={profile.professional.linkedInUrl}
                  onChange={(e) => handleFieldChange('professional', 'linkedInUrl', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                GitHub Profile URL
              </label>
              <div className="relative">
                <Github className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="url"
                  value={profile.professional.githubUrl}
                  onChange={(e) => handleFieldChange('professional', 'githubUrl', e.target.value)}
                  placeholder="https://github.com/username"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Portfolio / Personal Website URL
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="url"
                  value={profile.professional.portfolioUrl}
                  onChange={(e) => handleFieldChange('professional', 'portfolioUrl', e.target.value)}
                  placeholder="https://yourportfolio.dev"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. PREFERENCES */}
        {activeSection === 'preferences' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Writing Tone for Application Answers
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['formal', 'casual', 'academic'] as const).map((toneOption) => (
                  <button
                    key={toneOption}
                    type="button"
                    onClick={() => handleFieldChange('preferences', 'tone', toneOption)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-colors cursor-pointer ${
                      profile.preferences.tone === toneOption
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-2xs font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {toneOption}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Guides how Madadgar drafts personal statements and responses.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Default Assistance Language
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleFieldChange('preferences', 'defaultLanguage', 'en')}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    profile.preferences.defaultLanguage === 'en'
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-2xs font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => handleFieldChange('preferences', 'defaultLanguage', 'hinglish')}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    profile.preferences.defaultLanguage === 'hinglish'
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-2xs font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Hinglish
                </button>
              </div>
            </div>

            {/* Privacy Card */}
            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs text-indigo-950 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Deterministic Privacy Guarantee</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Your profile is stored exclusively in your browser's private local storage. It is never synchronized to cloud databases or remote analytics.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Save Bar */}
      <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
        <div className="text-[11px] text-slate-500 truncate">
          {hasUnsavedChanges ? (
            <span className="text-amber-600 font-medium">● Unsaved changes</span>
          ) : (
            <span className="text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 inline" />
              <span>Saved in local memory</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {saveStatus === 'saving' ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Saving...</span>
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save Profile</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ProfileManager;
