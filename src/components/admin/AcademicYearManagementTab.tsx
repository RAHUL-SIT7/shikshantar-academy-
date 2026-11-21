import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  Archive,
  Star,
  RefreshCw,
  Shield,
  Clock,
  Save,
  X,
  FileCheck
} from 'lucide-react';
import { auth } from '../../firebase';
import {
  AcademicYearConfig,
  AcademicYearStatus,
  subscribeAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  setAcademicYearAsCurrent,
  archiveAcademicYear,
  auditAndMigrateLegacyResultYears,
  seedDefaultAcademicYearsIfEmpty
} from '../../lib/academicYearEngine';

interface AcademicYearManagementTabProps {
  setStatus?: (status: { type: 'success' | 'error' | 'info'; message: string } | null) => void;
  userRole?: string;
}

export function AcademicYearManagementTab({
  setStatus,
  userRole
}: AcademicYearManagementTabProps) {
  const [years, setYears] = useState<AcademicYearConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states for Create
  const [newBsYear, setNewBsYear] = useState<string>('');
  const [newDisplayTitle, setNewDisplayTitle] = useState<string>('');
  const [newStartDate, setNewStartDate] = useState<string>('');
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [newStatus, setNewStatus] = useState<AcademicYearStatus>('ACTIVE');
  const [newIsCurrent, setNewIsCurrent] = useState<boolean>(false);

  // Edit Modal states
  const [editingYear, setEditingYear] = useState<AcademicYearConfig | null>(null);
  const [editDisplayTitle, setEditDisplayTitle] = useState<string>('');
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const [editStatus, setEditStatus] = useState<AcademicYearStatus>('ACTIVE');
  const [editIsCurrent, setEditIsCurrent] = useState<boolean>(false);

  // Legacy Migration Audit stats
  const [migrationStats, setMigrationStats] = useState<{
    totalAudited: number;
    migratedCount: number;
    unknownCount: number;
    skippedCount: number;
  } | null>(null);
  const [runningMigration, setRunningMigration] = useState(false);

  const isAdmin = userRole === 'admin';
  const currentUserEmail = auth.currentUser?.email || 'admin@shikshantar.edu.np';

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAcademicYears(
      async (loadedYears) => {
        if (loadedYears.length === 0 && isAdmin) {
          try {
            const seeded = await seedDefaultAcademicYearsIfEmpty();
            setYears(seeded);
          } catch (e) {
            setYears(loadedYears);
          }
        } else {
          setYears(loadedYears);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error subscribing academic years:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  const currentYearObj = years.find(y => y.isCurrent) || years[0];

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      if (setStatus) setStatus({ type: 'error', message: 'Unauthorized: Only Administrators can manage academic years.' });
      return;
    }

    const yrNum = parseInt(newBsYear, 10);
    if (isNaN(yrNum) || yrNum < 2000 || yrNum > 2200) {
      if (setStatus) setStatus({ type: 'error', message: 'Please enter a valid 4-digit Bikram Sambat (B.S.) year (e.g. 2084).' });
      return;
    }

    setSubmitting(true);
    try {
      await createAcademicYear(
        {
          bsYear: yrNum,
          displayTitle: newDisplayTitle || `${yrNum} BS`,
          startDate: newStartDate || `${yrNum}-01-01`,
          endDate: newEndDate || `${yrNum}-12-30`,
          status: newStatus,
          isCurrent: newIsCurrent
        },
        currentUserEmail
      );

      if (setStatus) {
        setStatus({
          type: 'success',
          message: `Academic Year "${newDisplayTitle || `${yrNum} BS`}" successfully created and saved in Firestore.`
        });
      }

      // Reset form
      setNewBsYear('');
      setNewDisplayTitle('');
      setNewStartDate('');
      setNewEndDate('');
      setNewStatus('ACTIVE');
      setNewIsCurrent(false);
    } catch (err: any) {
      console.error('Error creating academic year:', err);
      if (setStatus) setStatus({ type: 'error', message: err.message || 'Failed to create academic year.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetCurrent = async (year: AcademicYearConfig) => {
    if (!isAdmin) return;
    setSubmitting(true);
    try {
      await setAcademicYearAsCurrent(year.academicYearId, currentUserEmail);
      if (setStatus) {
        setStatus({
          type: 'success',
          message: `Academic Year "${year.displayTitle}" marked as CURRENT.`
        });
      }
    } catch (err: any) {
      if (setStatus) setStatus({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (year: AcademicYearConfig, nextStatus: AcademicYearStatus) => {
    if (!isAdmin) return;
    setSubmitting(true);
    try {
      await updateAcademicYear(
        year.academicYearId,
        { status: nextStatus, isCurrent: nextStatus === 'INACTIVE' || nextStatus === 'ARCHIVED' ? false : year.isCurrent },
        currentUserEmail
      );
      if (setStatus) {
        setStatus({
          type: 'success',
          message: `Academic Year "${year.displayTitle}" status updated to ${nextStatus}.`
        });
      }
    } catch (err: any) {
      if (setStatus) setStatus({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (year: AcademicYearConfig) => {
    setEditingYear(year);
    setEditDisplayTitle(year.displayTitle);
    setEditStartDate(year.startDate || '');
    setEditEndDate(year.endDate || '');
    setEditStatus(year.status);
    setEditIsCurrent(year.isCurrent);
  };

  const handleSaveEdit = async () => {
    if (!editingYear || !isAdmin) return;
    setSubmitting(true);
    try {
      await updateAcademicYear(
        editingYear.academicYearId,
        {
          displayTitle: editDisplayTitle,
          startDate: editStartDate,
          endDate: editEndDate,
          status: editStatus,
          isCurrent: editIsCurrent
        },
        currentUserEmail
      );

      if (setStatus) {
        setStatus({
          type: 'success',
          message: `Academic Year "${editingYear.academicYearId} BS" updated successfully.`
        });
      }
      setEditingYear(null);
    } catch (err: any) {
      if (setStatus) setStatus({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunAuditMigration = async () => {
    if (!isAdmin) return;
    setRunningMigration(true);
    try {
      const stats = await auditAndMigrateLegacyResultYears();
      setMigrationStats(stats);
      if (setStatus) {
        setStatus({
          type: 'success',
          message: `Audit complete: ${stats.migratedCount} legacy records migrated cleanly. ${stats.skippedCount} records already valid.`
        });
      }
    } catch (err: any) {
      if (setStatus) setStatus({ type: 'error', message: 'Legacy audit failed: ' + err.message });
    } finally {
      setRunningMigration(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Highlight Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm border border-blue-800/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-500/20 text-blue-200 border border-blue-400/30">
            <Calendar className="w-7 h-7 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-500/30 text-blue-200 border border-blue-400/30">
                Admin Settings &bull; Firestore System
              </span>
              <span className="text-xs font-semibold text-blue-200/80">Authoritative Academic Session</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>CURRENT ACADEMIC YEAR:</span>
              <span className="text-amber-300 font-mono font-black tracking-wide underline decoration-amber-400/60 decoration-2 underline-offset-4">
                {currentYearObj ? currentYearObj.displayTitle : '2083 BS'}
              </span>
            </h1>
          </div>
        </div>

        {/* Audit / Legacy Migration Action */}
        {isAdmin && (
          <button
            onClick={handleRunAuditMigration}
            disabled={runningMigration}
            className="px-4 py-2.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-2 border border-blue-400/40 shadow-sm transition-all disabled:opacity-50"
          >
            {runningMigration ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4 text-blue-200" />}
            Audit Legacy Result Records
          </button>
        )}
      </div>

      {/* Migration Stats Banner if available */}
      {migrationStats && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs font-medium text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Legacy Audit Results:</strong> Audited <strong>{migrationStats.totalAudited}</strong> summary documents.
              Successfully migrated <strong>{migrationStats.migratedCount}</strong>.
              Valid/Skipped: <strong>{migrationStats.skippedCount}</strong>.
              Unknown/Requires Review: <strong>{migrationStats.unknownCount}</strong>.
            </span>
          </div>
          <button onClick={() => setMigrationStats(null)} className="text-emerald-700 hover:text-emerald-950 underline font-bold">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Left Column: Add New Academic Year Form */}
        {isAdmin ? (
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="pb-3 border-b border-gray-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-black text-gray-900">Create Academic Year</h2>
            </div>

            <form onSubmit={handleCreateYear} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  B.S. Year (4-Digit Number) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 2084"
                  value={newBsYear}
                  onChange={e => {
                    setNewBsYear(e.target.value);
                    if (e.target.value && !newDisplayTitle) {
                      setNewDisplayTitle(`${e.target.value} BS`);
                    }
                  }}
                  required
                  min="2000"
                  max="2200"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl font-mono font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Display Title (User Facing) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2084 BS"
                  value={newDisplayTitle}
                  onChange={e => setNewDisplayTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">Official display title shown across all portals (e.g., 2084 BS).</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="text"
                    placeholder="2084-01-01"
                    value={newStartDate}
                    onChange={e => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="text"
                    placeholder="2084-12-30"
                    value={newEndDate}
                    onChange={e => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Initial Status</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value as AcademicYearStatus)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ACTIVE">ACTIVE (Selectable in portal)</option>
                  <option value="INACTIVE">INACTIVE (Hidden / Draft)</option>
                  <option value="ARCHIVED">ARCHIVED (Historical Read-Only)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="newIsCurrentCheck"
                  checked={newIsCurrent}
                  onChange={e => setNewIsCurrent(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="newIsCurrentCheck" className="text-xs font-bold text-gray-800 cursor-pointer">
                  Set as Current Active Academic Year
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || !newBsYear}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Save Academic Year to Firestore
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl text-amber-900 text-xs">
            <Shield className="w-6 h-6 text-amber-600 mb-2" />
            <p className="font-bold mb-1">Administrator Access Restricted</p>
            <p>Only authorized administrators can configure, create, or update academic years.</p>
          </div>
        )}

        {/* 3. Right Columns: Managed Academic Years List */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="pb-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Managed Academic Years Registry
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Persistent Firestore collection (`academic_years`). Stored canonical ID and display title.
              </p>
            </div>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              Total: {years.length}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12 text-gray-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span className="font-bold text-xs">Loading Academic Years...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Canonical ID</th>
                    <th className="py-3 px-3">Display Title</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Current</th>
                    {isAdmin && <th className="py-3 px-3 text-right">Admin Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {years.map(y => (
                    <tr key={y.academicYearId} className={`hover:bg-gray-50/50 ${y.isCurrent ? 'bg-amber-50/40 font-bold' : ''}`}>
                      <td className="py-3 px-3 font-mono font-bold text-gray-900">
                        {y.academicYearId}
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-bold text-gray-900">{y.displayTitle}</span>
                        {y.startDate && <span className="block text-[10px] text-gray-400">{y.startDate} &rarr; {y.endDate}</span>}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          y.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : y.status === 'ARCHIVED'
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {y.status}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {y.isCurrent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                            <Star className="w-3 h-3 text-amber-600 fill-amber-500" /> Current
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">&mdash;</span>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!y.isCurrent && (
                              <button
                                onClick={() => handleSetCurrent(y)}
                                title="Mark as Current Active Year"
                                disabled={submitting}
                                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-all"
                              >
                                Set Current
                              </button>
                            )}

                            {y.status !== 'ACTIVE' && (
                              <button
                                onClick={() => handleToggleStatus(y, 'ACTIVE')}
                                title="Activate Academic Year"
                                disabled={submitting}
                                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all"
                              >
                                Activate
                              </button>
                            )}

                            {y.status === 'ACTIVE' && !y.isCurrent && (
                              <button
                                onClick={() => handleToggleStatus(y, 'INACTIVE')}
                                title="Deactivate Academic Year"
                                disabled={submitting}
                                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 transition-all"
                              >
                                Deactivate
                              </button>
                            )}

                            {y.status !== 'ARCHIVED' && (
                              <button
                                onClick={() => handleToggleStatus(y, 'ARCHIVED')}
                                title="Archive Academic Year"
                                disabled={submitting}
                                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 transition-all"
                              >
                                Archive
                              </button>
                            )}

                            <button
                              onClick={() => openEditModal(y)}
                              title="Edit Details"
                              className="p-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingYear && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                Edit Academic Year ({editingYear.academicYearId} BS)
              </h3>
              <button onClick={() => setEditingYear(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Display Title (User Facing)
                </label>
                <input
                  type="text"
                  value={editDisplayTitle}
                  onChange={e => setEditDisplayTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="text"
                    value={editStartDate}
                    onChange={e => setEditStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="text"
                    value={editEndDate}
                    onChange={e => setEditEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as AcademicYearStatus)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsCurrentCheck"
                  checked={editIsCurrent}
                  onChange={e => setEditIsCurrent(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
                <label htmlFor="editIsCurrentCheck" className="text-xs font-bold text-gray-800 cursor-pointer">
                  Set as Current Active Academic Year
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setEditingYear(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5"
              >
                {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
