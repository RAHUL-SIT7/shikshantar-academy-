import React, { useState, useEffect, useMemo } from 'react';
import {
  BookMarked,
  Plus,
  Search,
  Archive,
  RefreshCw,
  Trash2,
  Edit2,
  AlertCircle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Loader2,
  X,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  CustomSubject,
  SubjectUsageSummary,
  getCustomSubjects,
  checkSubjectUsage,
  createCustomSubject,
  updateCustomSubject,
  archiveCustomSubject,
  restoreCustomSubject,
  deleteCustomSubject
} from '../../lib/customSubjectEngine';
import { STANDARD_SUBJECTS, normalizeClass } from '../../lib/teacherAssignmentEngine';
import { formatBSDate } from '../../lib/nepaliDate';

interface CustomSubjectsTabProps {
  allClasses: string[];
  setStatus?: (status: { type: 'success' | 'error'; message: string } | null) => void;
  userRole?: string;
}

export function CustomSubjectsTab({ allClasses, setStatus, userRole }: CustomSubjectsTabProps) {
  const [subjects, setSubjects] = useState<CustomSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'active' | 'archived' | 'system'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('All');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<CustomSubject | null>(null);
  const [usageSubject, setUsageSubject] = useState<{ subject: CustomSubject; summary: SubjectUsageSummary } | null>(null);
  const [loadingUsageId, setLoadingUsageId] = useState<string | null>(null);

  // Destructive Delete State
  const [deleteModalSubject, setDeleteModalSubject] = useState<{ subject: CustomSubject; summary: SubjectUsageSummary } | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Archive / Restore State
  const [archiveModalSubject, setArchiveModalSubject] = useState<CustomSubject | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  // Form Inputs
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formClass, setFormClass] = useState('All');
  const [formDescription, setFormDescription] = useState('');
  const [formThFull, setFormThFull] = useState(75);
  const [formThPass, setFormThPass] = useState(30);
  const [formPrFull, setFormPrFull] = useState(25);
  const [formPrPass, setFormPrPass] = useState(10);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 1. Fetch Custom Subjects
  const loadSubjects = async () => {
    setLoading(true);
    try {
      const data = await getCustomSubjects();
      setSubjects(data);
    } catch (err: any) {
      console.error('Failed to load custom subjects:', err);
      setStatus?.({ type: 'error', message: 'Failed to load custom subjects: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  // System standard subjects list
  const systemSubjects = useMemo(() => {
    return STANDARD_SUBJECTS.map(name => ({
      id: `SYS-${name.toUpperCase().replace(/\s+/g, '_')}`,
      name,
      normalizedName: name.toLowerCase(),
      targetClass: 'All',
      type: 'SYSTEM' as const,
      isSystem: true,
      status: 'ACTIVE' as const,
      createdAt: 'Built-in Standard Curriculum',
      createdBy: 'System Default'
    }));
  }, []);

  // Filtered views
  const filteredActiveSubjects = useMemo(() => {
    return subjects.filter(s => {
      if (s.status !== 'ACTIVE') return false;
      if (filterClass !== 'All') {
        if (s.targetClass !== 'All' && normalizeClass(s.targetClass) !== normalizeClass(filterClass)) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = s.name.toLowerCase().includes(q);
        const codeMatch = s.code?.toLowerCase().includes(q);
        const classMatch = s.targetClass.toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !classMatch) return false;
      }
      return true;
    });
  }, [subjects, filterClass, searchQuery]);

  const filteredArchivedSubjects = useMemo(() => {
    return subjects.filter(s => {
      if (s.status !== 'ARCHIVED') return false;
      if (filterClass !== 'All') {
        if (s.targetClass !== 'All' && normalizeClass(s.targetClass) !== normalizeClass(filterClass)) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = s.name.toLowerCase().includes(q);
        const codeMatch = s.code?.toLowerCase().includes(q);
        if (!nameMatch && !codeMatch) return false;
      }
      return true;
    });
  }, [subjects, filterClass, searchQuery]);

  const filteredSystemSubjects = useMemo(() => {
    return systemSubjects.filter(s => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return s.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [systemSubjects, searchQuery]);

  // Open Create Form
  const openCreateModal = () => {
    setFormName('');
    setFormCode('');
    setFormClass(filterClass !== 'All' ? filterClass : 'All');
    setFormDescription('');
    setFormThFull(75);
    setFormThPass(30);
    setFormPrFull(25);
    setFormPrPass(10);
    setFormError(null);
    setShowCreateModal(true);
  };

  // Open Edit Form
  const openEditModal = (subject: CustomSubject) => {
    setEditingSubject(subject);
    setFormName(subject.name);
    setFormCode(subject.code || '');
    setFormClass(subject.targetClass || 'All');
    setFormDescription(subject.description || '');
    setFormThFull(subject.thFullMarks ?? 75);
    setFormThPass(subject.thPassMarks ?? 30);
    setFormPrFull(subject.prFullMarks ?? 25);
    setFormPrPass(subject.prPassMarks ?? 10);
    setFormError(null);
  };

  // Submit Create
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Subject Name is required.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      await createCustomSubject({
        name: formName.trim(),
        code: formCode.trim() || undefined,
        targetClass: formClass,
        description: formDescription.trim(),
        thFullMarks: Number(formThFull) || 75,
        thPassMarks: Number(formThPass) || 30,
        prFullMarks: Number(formPrFull) || 25,
        prPassMarks: Number(formPrPass) || 10,
        hasTh: Number(formThFull) > 0,
        hasPr: Number(formPrFull) > 0
      });
      setStatus?.({ type: 'success', message: `Custom subject "${formName}" created successfully.` });
      setShowCreateModal(false);
      await loadSubjects();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Edit
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    if (!formName.trim()) {
      setFormError('Subject Name is required.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      await updateCustomSubject(editingSubject.id, {
        name: formName.trim(),
        code: formCode.trim() || undefined,
        targetClass: formClass,
        description: formDescription.trim(),
        thFullMarks: Number(formThFull) || 75,
        thPassMarks: Number(formThPass) || 30,
        prFullMarks: Number(formPrFull) || 25,
        prPassMarks: Number(formPrPass) || 10,
        hasTh: Number(formThFull) > 0,
        hasPr: Number(formPrFull) > 0
      });
      setStatus?.({ type: 'success', message: `Subject "${formName}" updated successfully.` });
      setEditingSubject(null);
      await loadSubjects();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Inspect Usage
  const handleInspectUsage = async (subject: CustomSubject) => {
    setLoadingUsageId(subject.id);
    try {
      const summary = await checkSubjectUsage(subject.id, subject.name, subject.targetClass);
      setUsageSubject({ subject, summary });
    } catch (err: any) {
      setStatus?.({ type: 'error', message: 'Failed to inspect usage: ' + err.message });
    } finally {
      setLoadingUsageId(null);
    }
  };

  // Initiate Delete Check
  const handleInitiateDelete = async (subject: CustomSubject) => {
    setLoadingUsageId(subject.id);
    try {
      const summary = await checkSubjectUsage(subject.id, subject.name, subject.targetClass);
      if (!summary.canDelete) {
        // Automatically route to Usage details modal with block explanation
        setUsageSubject({ subject, summary });
        setStatus?.({
          type: 'error',
          message: summary.blockReason || 'Subject cannot be deleted because references exist.'
        });
      } else {
        setDeleteModalSubject({ subject, summary });
        setConfirmDeleteText('');
      }
    } catch (err: any) {
      setStatus?.({ type: 'error', message: 'Usage check failed: ' + err.message });
    } finally {
      setLoadingUsageId(null);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteModalSubject) return;
    if (confirmDeleteText.trim() !== deleteModalSubject.subject.name) {
      setStatus?.({ type: 'error', message: 'Subject name confirmation does not match.' });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteCustomSubject(deleteModalSubject.subject.id);
      setStatus?.({
        type: 'success',
        message: `Custom subject "${deleteModalSubject.subject.name}" has been permanently deleted.`
      });
      setDeleteModalSubject(null);
      await loadSubjects();
    } catch (err: any) {
      setStatus?.({ type: 'error', message: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm Archive
  const handleConfirmArchive = async () => {
    if (!archiveModalSubject) return;
    setIsArchiving(true);
    try {
      await archiveCustomSubject(archiveModalSubject.id, archiveReason.trim() || undefined);
      setStatus?.({
        type: 'success',
        message: `Subject "${archiveModalSubject.name}" has been archived. It is preserved for history but excluded from new curriculum.`
      });
      setArchiveModalSubject(null);
      setArchiveReason('');
      await loadSubjects();
    } catch (err: any) {
      setStatus?.({ type: 'error', message: err.message });
    } finally {
      setIsArchiving(false);
    }
  };

  // Confirm Restore
  const handleRestore = async (subject: CustomSubject) => {
    try {
      await restoreCustomSubject(subject.id);
      setStatus?.({
        type: 'success',
        message: `Subject "${subject.name}" has been restored to ACTIVE status.`
      });
      await loadSubjects();
    } catch (err: any) {
      setStatus?.({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BookMarked className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-black uppercase tracking-wider">Custom Subject Management</h2>
            </div>
            <p className="text-sm text-blue-200 mt-1 max-w-2xl">
              Configure curriculum subjects, class-specific electives, and safe lifecycles. Referenced subjects are preserved permanently for historical report cards.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-sm shadow-md flex items-center gap-2 transition-all shrink-0 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" /> Add Custom Subject
          </button>
        </div>
      </div>

      {/* Control Bar: SubTabs, Class Filter, Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSubTab('active')}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'active'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Active ({subjects.filter(s => s.status === 'ACTIVE').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('archived')}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'archived'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-amber-600" />
            Archived ({subjects.filter(s => s.status === 'ARCHIVED').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('system')}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'system'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            Built-in Curriculum ({systemSubjects.length})
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {activeSubTab !== 'system' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Class:</span>
              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All Classes</option>
                {allClasses.map(c => (
                  <option key={c} value={c}>Class {c}</option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>

          <button
            type="button"
            onClick={loadSubjects}
            title="Refresh subjects"
            className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:text-blue-900 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <p className="text-xs font-bold uppercase tracking-wider">Loading custom subjects...</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600 uppercase text-[10px] font-black tracking-widest border-b border-gray-200">
                <tr>
                  <th className="p-4">Subject</th>
                  <th className="p-4">Scope / Class</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Theory / Practical</th>
                  <th className="p-4">Created Date</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* 1. ACTIVE SUBTAB */}
                {activeSubTab === 'active' && filteredActiveSubjects.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-bold text-xs">
                      No active custom subjects found for this selection. Click "Add Custom Subject" above to create one.
                    </td>
                  </tr>
                )}
                {activeSubTab === 'active' && filteredActiveSubjects.map(sub => (
                  <tr key={sub.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="p-4">
                      <div className="font-black text-gray-900 flex items-center gap-2">
                        {sub.name}
                        {sub.code && (
                          <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                            {sub.code}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">ID: {sub.id}</div>
                    </td>
                    <td className="p-4 font-bold text-gray-700 text-xs">
                      {sub.targetClass === 'All' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                          All Classes
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                          Class {sub.targetClass}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-widest">
                        CUSTOM
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ACTIVE
                      </span>
                    </td>
                    <td className="p-4 text-xs font-bold text-gray-600">
                      TH: {sub.thFullMarks ?? 75} | PR: {sub.prFullMarks ?? 25}
                    </td>
                    <td className="p-4 text-xs font-semibold text-gray-500">
                      {sub.createdAt ? formatBSDate(sub.createdAt) : '-'}
                      <div className="text-[10px] text-gray-400 font-bold">By: {sub.createdByName || 'Admin'}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleInspectUsage(sub)}
                          disabled={loadingUsageId === sub.id}
                          className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                          title="View Usage & Academic References"
                        >
                          {loadingUsageId === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Info className="w-3 h-3" />}
                          Usage
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(sub)}
                          className="p-1.5 text-gray-600 hover:text-blue-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Subject"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setArchiveModalSubject(sub)}
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Archive Subject (Safe)"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInitiateDelete(sub)}
                          disabled={loadingUsageId === sub.id}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Permanently Delete (Unused Only)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* 2. ARCHIVED SUBTAB */}
                {activeSubTab === 'archived' && filteredArchivedSubjects.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-bold text-xs">
                      No archived subjects. Archived subjects remain permanently stored to preserve historical marks and report cards.
                    </td>
                  </tr>
                )}
                {activeSubTab === 'archived' && filteredArchivedSubjects.map(sub => (
                  <tr key={sub.id} className="hover:bg-amber-50/30 transition-colors bg-gray-50/50 opacity-90">
                    <td className="p-4">
                      <div className="font-bold text-gray-800 flex items-center gap-2">
                        {sub.name}
                        {sub.code && (
                          <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                            {sub.code}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">ID: {sub.id}</div>
                    </td>
                    <td className="p-4 font-bold text-gray-700 text-xs">
                      {sub.targetClass === 'All' ? 'All Classes' : `Class ${sub.targetClass}`}
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-widest">
                        CUSTOM
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                        <Archive className="w-3 h-3 text-amber-600" /> ARCHIVED
                      </span>
                    </td>
                    <td className="p-4 text-xs font-bold text-gray-500">
                      TH: {sub.thFullMarks ?? 75} | PR: {sub.prFullMarks ?? 25}
                    </td>
                    <td className="p-4 text-xs font-semibold text-gray-500">
                      {sub.archivedAt ? formatBSDate(sub.archivedAt) : '-'}
                      <div className="text-[10px] text-gray-400 font-bold">By: {sub.archivedByName || 'Admin'}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleInspectUsage(sub)}
                          className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Info className="w-3 h-3" /> Usage
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestore(sub)}
                          className="px-3 py-1 text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg flex items-center gap-1 cursor-pointer shadow-xs transition-all"
                        >
                          <RefreshCw className="w-3 h-3" /> Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* 3. SYSTEM SUBTAB */}
                {activeSubTab === 'system' && filteredSystemSubjects.map(sub => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-black text-gray-900">{sub.name}</td>
                    <td className="p-4 text-xs font-bold text-gray-600">Standard Curriculum (Per Class Mapping)</td>
                    <td className="p-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-widest">
                        SYSTEM
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ACTIVE
                      </span>
                    </td>
                    <td className="p-4 text-xs font-bold text-gray-500">Default 75 / 25 or Curriculum Split</td>
                    <td className="p-4 text-xs font-semibold text-gray-400">Core Curriculum</td>
                    <td className="p-4 text-center text-xs font-bold text-gray-400 italic">
                      Protected (Permanent System Subject)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {(showCreateModal || editingSubject) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-blue-900" />
                <h3 className="font-black text-base uppercase tracking-wider text-gray-900">
                  {editingSubject ? `Edit Subject • ${editingSubject.name}` : 'New Custom Subject'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingSubject(null);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={editingSubject ? handleEdit : handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">
                  Subject Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Applications"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">
                    Subject Code (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CS-101"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">
                    Target Class Scope <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formClass}
                    onChange={e => setFormClass(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="All">All Classes</option>
                    {allClasses.map(c => (
                      <option key={c} value={c}>Class {c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Theory / Practical configuration */}
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-700 block mb-2">
                  Default Mark Breakdown
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Theory Full / Pass</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formThFull}
                        onChange={e => setFormThFull(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-center bg-white"
                      />
                      <span className="text-gray-400">/</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formThPass}
                        onChange={e => setFormThPass(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-center bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Practical Full / Pass</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formPrFull}
                        onChange={e => setFormPrFull(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-center bg-white"
                      />
                      <span className="text-gray-400">/</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formPrPass}
                        onChange={e => setFormPrPass(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-center bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">
                  Description / Syllabus Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional curriculum notes..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingSubject(null);
                  }}
                  className="px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-900 text-white font-black rounded-xl text-xs hover:bg-blue-950 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {editingSubject ? 'Save Changes' : 'Create Custom Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW USAGE MODAL */}
      {usageSubject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-900" />
                <h3 className="font-black text-sm uppercase tracking-wider text-gray-900">
                  Usage References • {usageSubject.subject.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUsageSubject(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                  A custom subject is protected from permanent deletion whenever authoritative references exist in teacher assignments, examination configurations, or student marks.
                </p>
              </div>

              <div className="divide-y divide-gray-100 text-xs font-bold">
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-gray-600">Teacher Assignments:</span>
                  <span className="font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                    {usageSubject.summary.teacherAssignments}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-gray-600">Student Result Marks:</span>
                  <span className="font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                    {usageSubject.summary.results}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-gray-600">Class Result Summaries:</span>
                  <span className="font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                    {usageSubject.summary.resultSummaries}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-gray-600">Exam Preparation Configs:</span>
                  <span className="font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                    {usageSubject.summary.exams}
                  </span>
                </div>
                <div className="py-3 flex justify-between items-center border-t-2 border-gray-200">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-800">Total References:</span>
                  <span className={`text-sm font-black px-2.5 py-0.5 rounded ${
                    usageSubject.summary.totalReferences > 0
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}>
                    {usageSubject.summary.totalReferences}
                  </span>
                </div>
              </div>

              {usageSubject.summary.canDelete ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>This subject has zero references and is safe for permanent deletion.</span>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{usageSubject.summary.blockReason}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
              <button
                type="button"
                onClick={() => setUsageSubject(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-200"
              >
                Close
              </button>
              {!usageSubject.summary.canDelete && usageSubject.subject.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => {
                    const s = usageSubject.subject;
                    setUsageSubject(null);
                    setArchiveModalSubject(s);
                  }}
                  className="px-4 py-2 bg-amber-600 text-white font-black rounded-xl text-xs hover:bg-amber-700 flex items-center gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" /> Archive Instead
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM PERMANENT DELETE DIALOG (UNUSED SUBJECT ONLY) */}
      {deleteModalSubject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-red-600 mb-3">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-black text-base uppercase tracking-wider text-gray-900">
                Confirm Permanent Deletion
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed font-semibold mb-3">
              You are about to permanently delete custom subject <strong className="text-gray-900">{deleteModalSubject.subject.name}</strong>.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-bold text-red-800 mb-4 space-y-1">
              <p>• Verified: 0 teacher assignments, 0 exam marks, 0 report card records.</p>
              <p>• This action is completely irreversible.</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Type <span className="font-mono font-black text-red-600">{deleteModalSubject.subject.name}</span> to confirm:
              </label>
              <input
                type="text"
                placeholder={deleteModalSubject.subject.name}
                value={confirmDeleteText}
                onChange={e => setConfirmDeleteText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalSubject(null)}
                className="px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting || confirmDeleteText.trim() !== deleteModalSubject.subject.name}
                className="px-4 py-2 bg-red-600 text-white font-black rounded-xl text-xs hover:bg-red-700 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM ARCHIVE DIALOG */}
      {archiveModalSubject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-amber-600 mb-3">
              <Archive className="w-6 h-6" />
              <h3 className="font-black text-base uppercase tracking-wider text-gray-900">
                Archive Custom Subject
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed font-semibold mb-3">
              Archiving <strong className="text-gray-900">{archiveModalSubject.name}</strong> will deactivate it from new teacher assignments and future examination results.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-bold text-amber-900 mb-4 space-y-1">
              <p>• All historical marks and report cards will remain 100% intact and readable.</p>
              <p>• You can restore this subject anytime if needed.</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">Reason for Archiving (Optional):</label>
              <input
                type="text"
                placeholder="e.g. Discontinued elective for 2083"
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setArchiveModalSubject(null)}
                className="px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                disabled={isArchiving}
                className="px-4 py-2 bg-amber-600 text-white font-black rounded-xl text-xs hover:bg-amber-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isArchiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
