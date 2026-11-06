import React, { useState, useEffect } from 'react';
import {
  BookmarkCheck,
  Plus,
  Download,
  Upload,
  Play,
  RotateCcw,
  Sparkles,
  BookOpen,
  Mail,
  FileText,
  User,
  Search,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  SlidersHorizontal,
  Bot,
  MessageSquare,
} from 'lucide-react';
import {
  getSavedSkills,
  saveSkill,
  deleteSkill,
  resetDefaultSkills,
  exportSkillsJson,
  importSkillsJson,
} from '@/common/storage_adapter';
import type { SavedSkill, SkillCategory, UserProfileMemory } from '@/common/types';

export interface SkillsDrawerProps {
  onRunSkill?: (skill: SavedSkill) => void;
  onNavigateTab?: (tab: 'chat' | 'agent' | 'profile' | 'summarizer') => void;
  activeProfile?: UserProfileMemory;
}

export const SkillsDrawer: React.FC<SkillsDrawerProps> = ({
  onRunSkill,
  onNavigateTab,
  activeProfile,
}) => {
  const [skills, setSkills] = useState<SavedSkill[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'study' | 'writing' | 'forms' | 'custom'>('all');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formCategory, setFormCategory] = useState<SkillCategory>('custom');
  const [formTags, setFormTags] = useState('');
  const [formRequiresProfile, setFormRequiresProfile] = useState(false);
  const [formTargetTab, setFormTargetTab] = useState<'chat' | 'agent'>('chat');
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [skillToDelete, setSkillToDelete] = useState<SavedSkill | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const loaded = await getSavedSkills();
      setSkills(loaded);
    } catch (err: any) {
      console.warn('[SkillsDrawer] Failed to load saved skills:', err);
      showNotification('error', 'Failed to load skills from storage.');
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 3500);
  };

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setModalMode('create');
    setEditingSkillId(null);
    setFormName('');
    setFormDescription('');
    setFormPrompt('');
    setFormCategory('custom');
    setFormTags('');
    setFormRequiresProfile(false);
    setFormTargetTab('chat');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (skill: SavedSkill) => {
    setModalMode('edit');
    setEditingSkillId(skill.id);
    setFormName(skill.name);
    setFormDescription(skill.description);
    setFormPrompt(skill.promptTemplate);
    setFormCategory(skill.category);
    setFormTags(skill.tags.join(', '));
    setFormRequiresProfile(Boolean(skill.requiresProfile));
    setFormTargetTab(skill.targetTab === 'agent' ? 'agent' : 'chat');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Save / Update skill handler
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const promptTemplate = formPrompt.trim();

    if (!name) {
      setFormError('Please enter a skill title.');
      return;
    }
    if (!promptTemplate) {
      setFormError('Please enter a prompt template.');
      return;
    }

    const tags = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const saved = await saveSkill({
        id: editingSkillId || undefined,
        name,
        title: name,
        description: formDescription.trim(),
        promptTemplate,
        category: formCategory,
        tags,
        requiresProfile: formRequiresProfile,
        targetTab: formTargetTab,
        isBuiltIn: false,
      });

      setIsModalOpen(false);
      await loadSkills();
      showNotification('success', `Skill "${saved.name}" saved successfully!`);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save skill.');
    }
  };

  // Delete handler
  const handleConfirmDelete = async () => {
    if (!skillToDelete) return;
    try {
      await deleteSkill(skillToDelete.id);
      setSkillToDelete(null);
      await loadSkills();
      showNotification('success', `Skill "${skillToDelete.name}" deleted.`);
    } catch (err: any) {
      showNotification('error', 'Failed to delete skill.');
    }
  };

  // Restore defaults
  const handleRestoreDefaults = async () => {
    try {
      const restored = await resetDefaultSkills();
      setSkills(restored);
      showNotification('success', 'Restored 4 curated built-in skills.');
    } catch (err: any) {
      showNotification('error', 'Failed to restore default skills.');
    }
  };

  // Export JSON
  const handleExport = async () => {
    try {
      const json = await exportSkillsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `madadgar-skills-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('success', 'Skills catalog exported to JSON.');
    } catch (err: any) {
      showNotification('error', 'Export failed: ' + err.message);
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
        const imported = await importSkillsJson(text);
        setSkills(imported);
        showNotification('success', `Imported ${imported.length} skills successfully!`);
      } catch (err: any) {
        showNotification('error', err?.message || 'Failed to parse skills JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Trigger / Run skill
  const handleRun = (skill: SavedSkill) => {
    // Check if skill requires profile and whether profile exists
    if (skill.requiresProfile && activeProfile) {
      const hasPersonal = Boolean(activeProfile.personal?.fullName || activeProfile.personal?.email);
      if (!hasPersonal) {
        showNotification(
          'error',
          'This skill requires your profile details. Please complete your profile in the Profile tab.'
        );
      }
    }

    if (onRunSkill) {
      onRunSkill(skill);
    }
  };

  // Filter skills
  const filteredSkills = skills.filter((skill) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.tags.some((t) => t.toLowerCase().includes(q)) ||
      skill.category.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'study') return skill.category === 'study';
    if (selectedCategory === 'writing') return skill.category === 'writing' || skill.category === 'reply';
    if (selectedCategory === 'forms') return skill.category === 'forms' || skill.category === 'form';
    if (selectedCategory === 'custom') return skill.category === 'custom' || !skill.isBuiltIn;

    return true;
  });

  const getCategoryTheme = (category: string) => {
    switch (category) {
      case 'study':
        return {
          bg: 'bg-indigo-50',
          text: 'text-indigo-700',
          border: 'border-indigo-100',
          icon: <BookOpen className="w-3.5 h-3.5" />,
          label: 'Study & Revision',
        };
      case 'writing':
      case 'reply':
        return {
          bg: 'bg-purple-50',
          text: 'text-purple-700',
          border: 'border-purple-100',
          icon: <Mail className="w-3.5 h-3.5" />,
          label: 'Writing & Replies',
        };
      case 'forms':
      case 'form':
        return {
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-100',
          icon: <FileText className="w-3.5 h-3.5" />,
          label: 'Forms & Autofill',
        };
      default:
        return {
          bg: 'bg-amber-50',
          text: 'text-amber-800',
          border: 'border-amber-100',
          icon: <Sparkles className="w-3.5 h-3.5" />,
          label: 'Custom Skill',
        };
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <BookmarkCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <span>Skills Catalog</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {skills.length} Recipes
                </span>
              </h2>
              <p className="text-[11px] text-slate-500">
                One-click prompt recipes for studying, writing, and form filling
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Skill</span>
          </button>
        </div>

        {/* Action Toolbar: Export, Import, Restore */}
        <div className="flex items-center justify-between gap-1.5 pt-1 text-[11px] border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExport}
              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded border border-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Download madadgar-skills.json"
            >
              <Download className="w-3 h-3 text-slate-500" />
              <span>Export</span>
            </button>

            <label
              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded border border-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Import madadgar-skills.json"
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
            onClick={handleRestoreDefaults}
            className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded inline-flex items-center gap-1 transition-colors cursor-pointer"
            title="Reset to 4 default curated skills"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills by name, tags, or keyword..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>

        {/* Category Pills Filter */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 text-[11px]">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'study', label: 'Study' },
              { id: 'writing', label: 'Writing' },
              { id: 'forms', label: 'Forms' },
              { id: 'custom', label: 'Custom' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`p-2 rounded-lg text-xs flex items-center gap-1.5 animate-fadeIn ${
              statusMessage.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {statusMessage.type === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="text-[11px] font-medium">{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Main Skills List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {filteredSkills.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-2">
            <SlidersHorizontal className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-medium text-slate-600">No skills match your filter.</p>
            <p className="text-[11px] text-slate-400">
              Try searching a different keyword or create a custom skill recipe.
            </p>
          </div>
        ) : (
          filteredSkills.map((skill) => {
            const theme = getCategoryTheme(skill.category);
            return (
              <div
                key={skill.id}
                className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs hover:shadow-xs transition-shadow space-y-2.5 relative group"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${theme.bg} ${theme.text} ${theme.border}`}
                      >
                        {theme.icon}
                        <span>{theme.label}</span>
                      </span>

                      {skill.isBuiltIn ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600">
                          Built-in
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          Custom
                        </span>
                      )}

                      {skill.requiresProfile && (
                        <button
                          type="button"
                          onClick={() => onNavigateTab?.('profile')}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                          title="View / Edit Profile"
                        >
                          <User className="w-2.5 h-2.5" />
                          <span>Requires Profile</span>
                        </button>
                      )}
                    </div>

                    <h3 className="font-semibold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {skill.name}
                    </h3>
                  </div>

                  {/* Edit/Delete for custom skills */}
                  {!skill.isBuiltIn && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(skill)}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        title="Edit Skill"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkillToDelete(skill)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        title="Delete Skill"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 leading-relaxed">{skill.description}</p>

                {/* Tags */}
                {skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skill.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Bottom Action Footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    {skill.targetTab === 'agent' ? (
                      <>
                        <Bot className="w-3 h-3 text-indigo-500" />
                        <span>Runs in Agent Pilot</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-3 h-3 text-indigo-500" />
                        <span>Runs in Chat Assistant</span>
                      </>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleRun(skill)}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg font-semibold text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run Skill</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {skillToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 max-w-xs w-full shadow-xl border border-slate-200 space-y-3 animate-scaleIn">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h4 className="font-semibold text-xs text-slate-900">Delete Custom Skill?</h4>
            </div>
            <p className="text-xs text-slate-600 leading-normal">
              Are you sure you want to delete <span className="font-semibold">"{skillToDelete.name}"</span>? This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSkillToDelete(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Custom Skill Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>{modalMode === 'create' ? 'Create Custom Skill' : 'Edit Skill Recipe'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveModal} className="p-4 overflow-y-auto space-y-3 text-xs flex-1">
              {formError && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Skill Title *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Code Reviewer, Resume Critique"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief 1-line summary of what this skill does"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as SkillCategory)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="study">Study & Revision</option>
                    <option value="writing">Writing & Replies</option>
                    <option value="forms">Forms & Autofill</option>
                    <option value="custom">Custom Recipe</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Target Engine</label>
                  <select
                    value={formTargetTab}
                    onChange={(e) => setFormTargetTab(e.target.value as 'chat' | 'agent')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="chat">Chat Assistant</option>
                    <option value="agent">Agent Pilot (Actions)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Prompt Recipe *</label>
                <textarea
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder="Enter the prompt instructions to run when this skill is triggered..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="e.g. Coding, Python, Productivity"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formRequiresProfile}
                    onChange={(e) => setFormRequiresProfile(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-slate-700 text-xs">
                    Requires User Profile Memory (Injects name, college, skills...)
                  </span>
                </label>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {modalMode === 'create' ? 'Save Skill' : 'Update Skill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillsDrawer;
