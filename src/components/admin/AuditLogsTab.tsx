import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ShieldCheck,
  Calendar,
  Filter,
  Download,
  Printer,
  Eye,
  X,
  Clock,
  User,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileText,
  DollarSign,
  Shield,
  Layers,
  ChevronDown
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { AuditLogEntry } from '../../lib/auditLogger';
import { formatBSDate, formatBSDateTime } from '../../lib/nepaliDate';

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all'); // 'all', 'today', '7days', '30days', 'custom'
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  // Subscribe to audit_logs and ledger_audit_logs in real time
  useEffect(() => {
    setLoading(true);
    let auditList: AuditLogEntry[] = [];
    let ledgerList: AuditLogEntry[] = [];

    const mergeAndSortLogs = () => {
      const logMap = new Map<string, AuditLogEntry>();
      
      // Add ledger audit logs
      ledgerList.forEach((item) => {
        logMap.set(item.id || `${item.timestampStr}_${item.transactionId}`, item);
      });

      // Add audit logs (overriding or supplementing)
      auditList.forEach((item) => {
        const key = item.id || `${item.timestampStr}_${item.transactionId || item.actionType}`;
        logMap.set(key, item);
      });

      // Sort descending by timestamp / date
      const merged = Array.from(logMap.values()).sort((a, b) => {
        const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });

      setLogs(merged);
      setLoading(false);
    };

    // 1. Primary listener on 'audit_logs' collection
    const auditLogsQuery = query(collection(db, 'audit_logs'), limit(300));
    const unsubAudit = onSnapshot(
      auditLogsQuery,
      (snapshot) => {
        auditList = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const prevVal = data.previousValue || (data.beforeState !== undefined ? (typeof data.beforeState === 'object' ? JSON.stringify(data.beforeState) : String(data.beforeState)) : 'N/A');
          const newVal = data.newValue || (data.afterState !== undefined ? (typeof data.afterState === 'object' ? JSON.stringify(data.afterState) : String(data.afterState)) : 'N/A');
          return {
            id: docSnap.id,
            auditLogId: data.auditLogId || docSnap.id,
            timestamp: data.timestamp,
            timestampStr: data.timestampStr || '',
            createdAt: data.createdAt,
            date: data.date || '',
            dateBS: data.dateBS || '',
            category: data.category || (data.transactionId || (data.receipt && data.receipt !== 'N/A') ? 'financial' : 'system'),
            action: data.action || data.actionType || 'SYSTEM_ACTION',
            actionType: data.actionType || data.action || 'SYSTEM_ACTION',
            targetType: data.targetType || '',
            targetId: data.targetId || '',
            transactionId: data.transactionId || '',
            receipt: data.receipt || data.receiptNo || 'N/A',
            receiptNo: data.receiptNo || data.receipt || 'N/A',
            paymentGroupId: data.paymentGroupId || '',
            studentId: data.studentId || data.studentUid || '',
            studentUid: data.studentUid || data.studentId || '',
            studentEmis: data.studentEmis || '',
            studentName: data.studentName || 'System Target',
            studentClass: data.studentClass || '-',
            academicYear: data.academicYear || '',
            enrollmentId: data.enrollmentId || '',
            beforeState: data.beforeState,
            afterState: data.afterState,
            previousValue: prevVal,
            newValue: newVal,
            reason: data.reason || 'Administrative Action',
            result: data.result || 'SUCCESS',
            operationId: data.operationId || data.correlationId || '',
            correlationId: data.correlationId || data.operationId || '',
            actorUid: data.actorUid || data.adminUid || '',
            adminUid: data.adminUid || data.actorUid || '',
            actorName: data.actorName || data.adminName || 'Administrator',
            adminName: data.adminName || data.actorName || 'Administrator',
            actorRole: data.actorRole || 'admin',
            adminEmail: data.adminEmail || '',
            adminTier: data.adminTier || 'primary',
            meta: data.meta || {}
          } as AuditLogEntry;
        });
        mergeAndSortLogs();
      },
      (err) => {
        console.warn('Could not stream audit_logs:', err);
        setLoading(false);
      }
    );

    // 2. Secondary listener on 'ledger_audit_logs' for existing financial records
    const ledgerLogsQuery = query(collection(db, 'ledger_audit_logs'), limit(300));
    const unsubLedger = onSnapshot(
      ledgerLogsQuery,
      (snapshot) => {
        ledgerList = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const prevVal = data.previousValue || (data.beforeState !== undefined ? (typeof data.beforeState === 'object' ? JSON.stringify(data.beforeState) : String(data.beforeState)) : 'N/A');
          const newVal = data.newValue || (data.afterState !== undefined ? (typeof data.afterState === 'object' ? JSON.stringify(data.afterState) : String(data.afterState)) : 'N/A');
          return {
            id: docSnap.id,
            auditLogId: data.auditLogId || docSnap.id,
            timestamp: data.timestamp,
            timestampStr: data.timestampStr || '',
            createdAt: data.createdAt,
            date: data.date || '',
            dateBS: data.dateBS || '',
            category: 'financial',
            action: data.action || data.actionType || 'AMOUNT_MODIFIED',
            actionType: data.actionType || data.action || 'AMOUNT_MODIFIED',
            targetType: data.targetType || 'transaction',
            targetId: data.targetId || data.transactionId || '',
            transactionId: data.transactionId || '',
            receipt: data.receipt || data.receiptNo || 'N/A',
            receiptNo: data.receiptNo || data.receipt || 'N/A',
            paymentGroupId: data.paymentGroupId || '',
            studentId: data.studentId || data.studentUid || '',
            studentUid: data.studentUid || data.studentId || '',
            studentEmis: data.studentEmis || '',
            studentName: data.studentName || 'General / Non-Student Ledger',
            studentClass: data.studentClass || '-',
            academicYear: data.academicYear || '',
            enrollmentId: data.enrollmentId || '',
            beforeState: data.beforeState,
            afterState: data.afterState,
            previousValue: prevVal,
            newValue: newVal,
            reason: data.reason || 'Administrative Ledger Modification',
            result: data.result || 'SUCCESS',
            operationId: data.operationId || data.correlationId || '',
            correlationId: data.correlationId || data.operationId || '',
            actorUid: data.actorUid || data.adminUid || '',
            adminUid: data.adminUid || data.actorUid || '',
            actorName: data.actorName || data.adminName || 'Administrator',
            adminName: data.adminName || data.actorName || 'Administrator',
            actorRole: data.actorRole || 'admin',
            adminEmail: data.adminEmail || '',
            adminTier: data.adminTier || 'primary',
            meta: data.meta || {}
          } as AuditLogEntry;
        });
        mergeAndSortLogs();
      },
      (err) => {
        console.warn('Could not stream ledger_audit_logs:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubAudit();
      unsubLedger();
    };
  }, []);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Search Query
      if (searchTerm.trim()) {
        const queryLower = searchTerm.toLowerCase();
        const matchesSearch =
          (log.adminName && log.adminName.toLowerCase().includes(queryLower)) ||
          (log.adminEmail && log.adminEmail.toLowerCase().includes(queryLower)) ||
          (log.actionType && log.actionType.toLowerCase().includes(queryLower)) ||
          (log.reason && log.reason.toLowerCase().includes(queryLower)) ||
          (log.studentName && log.studentName.toLowerCase().includes(queryLower)) ||
          (log.studentId && log.studentId.toLowerCase().includes(queryLower)) ||
          (log.receipt && log.receipt.toLowerCase().includes(queryLower)) ||
          (log.previousValue && log.previousValue.toLowerCase().includes(queryLower)) ||
          (log.newValue && log.newValue.toLowerCase().includes(queryLower));

        if (!matchesSearch) return false;
      }

      // 2. Category Filter
      if (categoryFilter !== 'all') {
        const cat = (log.category || 'system').toLowerCase();
        if (categoryFilter === 'financial' && cat !== 'financial') return false;
        if (categoryFilter === 'security' && cat !== 'security') return false;
        if (categoryFilter === 'system' && cat !== 'system' && cat !== 'academic') return false;
      }

      // 3. Admin Tier Filter (1° Admin vs 2° Admin)
      if (tierFilter !== 'all') {
        const tier = (log.adminTier || 'primary').toLowerCase();
        if (tierFilter === 'primary' && tier !== 'primary') return false;
        if (tierFilter === 'secondary' && tier !== 'secondary') return false;
      }

      // 4. Action Type Filter
      if (actionTypeFilter !== 'all') {
        if (log.actionType !== actionTypeFilter) return false;
      }

      // 5. Date Range Filter
      if (dateRange !== 'all') {
        const logDateStr = log.date;
        if (!logDateStr) return true;
        const logTime = new Date(logDateStr).getTime();
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (dateRange === 'today') {
          if (logDateStr !== todayStr) return false;
        } else if (dateRange === '7days') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          if (logTime < sevenDaysAgo.getTime()) return false;
        } else if (dateRange === '30days') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          if (logTime < thirtyDaysAgo.getTime()) return false;
        } else if (dateRange === 'custom') {
          if (startDate && logDateStr < startDate) return false;
          if (endDate && logDateStr > endDate) return false;
        }
      }

      return true;
    });
  }, [logs, searchTerm, categoryFilter, tierFilter, actionTypeFilter, dateRange, startDate, endDate]);

  // Distinct Action Types for dropdown
  const uniqueActionTypes = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.actionType) set.add(l.actionType);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const total = logs.length;
    const financialCount = logs.filter((l) => (l.category || '').toLowerCase() === 'financial').length;
    const securityCount = logs.filter(
      (l) =>
        (l.category || '').toLowerCase() === 'security' ||
        l.actionType.includes('ROLE') ||
        l.actionType.includes('USER') ||
        l.actionType.includes('ADMIN')
    ).length;
    const todayCount = logs.filter((l) => l.date === todayStr).length;

    return { total, financialCount, securityCount, todayCount };
  }, [logs]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = [
      'Timestamp',
      'Date (AD)',
      'Date (BS)',
      'Admin Name',
      'Admin Email',
      'Admin Tier',
      'Category',
      'Action Type',
      'Target / Student',
      'Receipt/Txn',
      'Previous Value',
      'New Value',
      'Reason'
    ];

    const rows = filteredLogs.map((l) => [
      `"${l.timestampStr || ''}"`,
      `"${l.date || ''}"`,
      `"${l.dateBS || ''}"`,
      `"${l.adminName || ''}"`,
      `"${l.adminEmail || ''}"`,
      `"${(l.adminTier || 'primary') === 'primary' ? '1° Admin' : '2° Admin'}"`,
      `"${l.category || 'system'}"`,
      `"${l.actionType || ''}"`,
      `"${l.studentName || ''} (${l.studentId || ''})"`,
      `"${l.receipt || l.transactionId || ''}"`,
      `"${(l.previousValue || '').replace(/"/g, '""')}"`,
      `"${(l.newValue || '').replace(/"/g, '""')}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `system_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryBadge = (cat?: string, action?: string) => {
    const isFin = cat === 'financial' || action?.includes('AMOUNT') || action?.includes('PAYMENT') || action?.includes('FEE');
    const isSec = cat === 'security' || action?.includes('ROLE') || action?.includes('USER') || action?.includes('ADMIN');

    if (isFin) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <DollarSign className="w-3 h-3" /> Financial
        </span>
      );
    }
    if (isSec) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <Shield className="w-3 h-3" /> Governance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
        <Layers className="w-3 h-3" /> System
      </span>
    );
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('DELETED') || action.includes('REFUND') || action.includes('CANCEL')) {
      return 'bg-red-50 text-red-700 border-red-200';
    }
    if (action.includes('MODIFIED') || action.includes('OVERRIDE') || action.includes('CHANGED')) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    if (action.includes('APPROVED') || action.includes('ENTRY') || action.includes('CREATED')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Explanation */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Immutable Ledger
              </span>
              <span className="text-xs text-slate-400 font-medium">Real-Time Audit Trail</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">System & Financial Audit Logs</h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Cryptographically backed, append-only chronological record of all administrative operations, financial ledger modifications, user governance events, and system mutations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold border border-white/20 transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-md transition-all"
            >
              <Printer className="w-4 h-4" /> Print Report
            </button>
          </div>
        </div>

        {/* 4 Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/5">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Total Logs</p>
            <p className="text-2xl font-black text-white mt-1">{metrics.total}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/5">
            <p className="text-xs uppercase tracking-wider text-amber-400 font-bold">Financial Mods</p>
            <p className="text-2xl font-black text-amber-300 mt-1">{metrics.financialCount}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/5">
            <p className="text-xs uppercase tracking-wider text-purple-400 font-bold">Governance & Security</p>
            <p className="text-2xl font-black text-purple-300 mt-1">{metrics.securityCount}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/5">
            <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold">Today's Operations</p>
            <p className="text-2xl font-black text-emerald-300 mt-1">{metrics.todayCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar Controls */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Free text search */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by admin, student, receipt #, action, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="md:col-span-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full py-2.5 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Categories</option>
              <option value="financial">Financial Modifications</option>
              <option value="security">Governance & Security</option>
              <option value="system">System & Academic</option>
            </select>
          </div>

          {/* Admin Tier Filter (1° vs 2° Admin) */}
          <div className="md:col-span-2">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="w-full py-2.5 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Admin Tiers</option>
              <option value="primary">1° Admin (Primary)</option>
              <option value="secondary">2° Admin (Secondary)</option>
            </select>
          </div>

          {/* Date Range Selector */}
          <div className="md:col-span-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full py-2.5 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium focus:ring-2 focus:ring-primary"
            >
              <option value="all">Date: All Time</option>
              <option value="today">Date: Today</option>
              <option value="7days">Date: Last 7 Days</option>
              <option value="30days">Date: Last 30 Days</option>
              <option value="custom">Date: Custom Range...</option>
            </select>
          </div>
        </div>

        {/* Custom Date Pickers (visible if custom selected) */}
        {dateRange === 'custom' && (
          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4 bg-gray-50 p-3 rounded-lg">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date Filter Range:
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 font-medium">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs p-1.5 rounded border border-gray-300 bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 font-medium">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs p-1.5 rounded border border-gray-300 bg-white"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs text-red-600 hover:underline font-medium"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}

        {/* Action Type filter tag clouds */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-gray-400 font-bold uppercase tracking-wider text-[11px] mr-1">Filter Action:</span>
          <button
            onClick={() => setActionTypeFilter('all')}
            className={`px-2.5 py-1 rounded-full font-bold transition-all ${actionTypeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All ({filteredLogs.length})
          </button>
          {uniqueActionTypes.map((action) => (
            <button
              key={action}
              onClick={() => setActionTypeFilter(action)}
              className={`px-2.5 py-1 rounded-full font-bold transition-all ${actionTypeFilter === action ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {action.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="font-bold text-sm">Streaming authoritative audit logs from Firestore...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center p-6 text-gray-500">
            <ShieldCheck className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-bold text-base text-gray-700">No matching audit logs found</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              Adjust search filters or date range. System and financial mutations will automatically populate in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-bold uppercase text-xs tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3.5 px-4">Timestamp & Date</th>
                  <th className="py-3.5 px-4">Admin / Operator</th>
                  <th className="py-3.5 px-4">Category & Action</th>
                  <th className="py-3.5 px-4">Target Entity</th>
                  <th className="py-3.5 px-4">Audit Modification</th>
                  <th className="py-3.5 px-4">Reason / Notes</th>
                  <th className="py-3.5 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {filteredLogs.map((log) => {
                  const isPrimary = (log.adminTier || 'primary') === 'primary';
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {log.dateBS || formatBSDateTime(log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : (log.timestamp || log.date || new Date()))}
                        </div>
                        {log.date && (
                          <div className="text-[11px] text-gray-400 mt-0.5 font-normal">
                            BS Date: {formatBSDate(log.date)}
                          </div>
                        )}
                      </td>

                      {/* Admin info with 1° vs 2° Badge */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${isPrimary ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                            {log.adminName ? log.adminName.charAt(0).toUpperCase() : 'A'}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                              {log.adminName}
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-black uppercase ${
                                  isPrimary ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}
                              >
                                {isPrimary ? '1° Admin' : '2° Admin'}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-400 font-normal">{log.adminEmail || 'admin'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Category & Action */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getCategoryBadge(log.category, log.actionType)}
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${getActionBadgeColor(log.actionType)}`}>
                            {log.actionType}
                          </span>
                        </div>
                      </td>

                      {/* Target */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-bold text-gray-900">{log.studentName}</div>
                        <div className="text-[11px] text-gray-500 font-normal">
                          {log.studentId ? `ID: ${log.studentId}` : ''}
                          {log.studentClass && log.studentClass !== '-' ? ` • Class: ${log.studentClass}` : ''}
                          {log.receipt && log.receipt !== 'N/A' ? ` • Rcpt: ${log.receipt}` : ''}
                        </div>
                      </td>

                      {/* Modification / Diff */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs flex items-center gap-2">
                          <span className="text-gray-400 line-through text-[11px] max-w-[120px] truncate" title={log.previousValue}>
                            {log.previousValue}
                          </span>
                          <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="font-bold text-gray-900 text-xs max-w-[140px] truncate" title={log.newValue}>
                            {log.newValue}
                          </span>
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        <p className="text-xs text-gray-600 truncate" title={log.reason}>
                          {log.reason}
                        </p>
                      </td>

                      {/* Inspect */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                          title="View Full Audit Snapshot"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Audit Record Details</h3>
                  <p className="text-xs text-gray-400 font-mono">ID: {selectedLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Operator Card */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">Authoritative Operator</p>
                  <p className="font-bold text-gray-900 text-sm mt-0.5">{selectedLog.adminName}</p>
                  <p className="text-xs text-gray-500 font-mono">{selectedLog.adminEmail || selectedLog.adminUid}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      (selectedLog.adminTier || 'primary') === 'primary'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    {(selectedLog.adminTier || 'primary') === 'primary' ? '1° Admin (Primary)' : '2° Admin (Secondary)'}
                  </span>
                  <p className="text-[11px] text-gray-400 mt-1">{selectedLog.timestampStr || selectedLog.date}</p>
                </div>
              </div>

              {/* Action & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Action Type</p>
                  <p className="font-black text-gray-800 text-sm mt-0.5">{selectedLog.actionType}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Category</p>
                  <p className="font-black text-gray-800 text-sm mt-0.5 capitalize">{selectedLog.category || 'System'}</p>
                </div>
              </div>

              {/* Target Entity */}
              <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Target Entity & Audit Traceability</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-gray-500">Name:</span> <strong className="text-gray-800">{selectedLog.studentName}</strong></div>
                  {selectedLog.studentId && <div><span className="text-gray-500">Student ID:</span> <strong className="text-gray-800">{selectedLog.studentId}</strong></div>}
                  {selectedLog.receipt && selectedLog.receipt !== 'N/A' && <div><span className="text-gray-500">Receipt #:</span> <strong className="text-gray-800">{selectedLog.receipt}</strong></div>}
                  {selectedLog.transactionId && <div><span className="text-gray-500">Txn ID:</span> <strong className="text-gray-800 font-mono">{selectedLog.transactionId}</strong></div>}
                  {selectedLog.operationId && <div><span className="text-gray-500">Operation ID:</span> <strong className="text-indigo-700 font-mono">{selectedLog.operationId}</strong></div>}
                  {selectedLog.result && <div><span className="text-gray-500">Result:</span> <strong className="text-emerald-700 font-bold">{selectedLog.result}</strong></div>}
                </div>
              </div>

              {/* State Diff */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-100 px-3.5 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  State Mutation Diff
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-200 p-3.5 bg-white text-xs">
                  <div>
                    <span className="text-red-500 font-bold block mb-1">Previous State</span>
                    <div className="font-mono bg-red-50/50 p-2.5 rounded border border-red-100 text-gray-800 break-words whitespace-pre-wrap">
                      {selectedLog.previousValue}
                    </div>
                  </div>
                  <div className="pl-3.5">
                    <span className="text-emerald-600 font-bold block mb-1">New State</span>
                    <div className="font-mono bg-emerald-50/50 p-2.5 rounded border border-emerald-100 text-gray-800 break-words whitespace-pre-wrap">
                      {selectedLog.newValue}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Documented Reason</p>
                <p className="text-xs text-gray-800 font-medium mt-1">{selectedLog.reason}</p>
              </div>

              {/* Metadata JSON if present */}
              {selectedLog.meta && Object.keys(selectedLog.meta).length > 0 && (
                <div className="p-3.5 bg-gray-900 text-gray-200 rounded-lg font-mono text-[11px] overflow-x-auto">
                  <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Extended Metadata</p>
                  <pre>{JSON.stringify(selectedLog.meta, null, 2)}</pre>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
