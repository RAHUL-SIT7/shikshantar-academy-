import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, 
    ShieldCheck, 
    Printer, 
    Download, 
    Clock, 
    UserCheck, 
    FileText, 
    AlertCircle, 
    CheckCircle2, 
    History, 
    Banknote, 
    Filter, 
    Eye, 
    X, 
    ArrowRight, 
    RotateCcw, 
    Trash2, 
    Edit3,
    Calendar,
    Layers
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatBSDate } from '../../lib/nepaliDate';
import { exportToExcel } from '../../lib/excelExport';

export interface AuditRecord {
    id: string;
    timestamp: any;
    timestampStr: string;
    date: string;
    dateBS: string;
    transactionId?: string;
    receipt: string;
    studentId?: string;
    studentName: string;
    studentClass: string;
    actionType: string;
    previousValue: string;
    newValue: string;
    reason: string;
    adminName: string;
    adminEmail?: string;
    adminUid?: string;
    source: 'firestore_logs' | 'transaction_stream';
}

export default function LedgerAuditLogTab({ transactions = [], students = [] }: { transactions: any[]; students: any[] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [selectedAdmin, setSelectedAdmin] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>('');
    const [firestoreLogs, setFirestoreLogs] = useState<AuditRecord[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditRecord | null>(null);

    // 1. Real-time listener for dedicated Firestore `ledger_audit_logs` collection
    useEffect(() => {
        const logsRef = collection(db, 'ledger_audit_logs');
        const q = query(logsRef, limit(300));

        const unsub = onSnapshot(q, (snapshot) => {
            const list: AuditRecord[] = snapshot.docs.map(docSnap => {
                const data = docSnap.data();
                const ts = data.timestamp;
                let formattedTime = data.timestampStr || '';
                if (!formattedTime && ts) {
                    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
                    formattedTime = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                }

                return {
                    id: docSnap.id,
                    timestamp: ts,
                    timestampStr: formattedTime || 'Recent',
                    date: data.date || '',
                    dateBS: data.dateBS || '',
                    transactionId: data.transactionId || '',
                    receipt: data.receipt || 'N/A',
                    studentId: data.studentId || '',
                    studentName: data.studentName || 'Student / Account',
                    studentClass: data.studentClass || '-',
                    actionType: data.actionType || 'AMOUNT_MODIFIED',
                    previousValue: data.previousValue || 'N/A',
                    newValue: data.newValue || 'N/A',
                    reason: data.reason || 'Administrative Ledger Modification',
                    adminName: data.adminName || 'Administrator',
                    adminEmail: data.adminEmail || '',
                    adminUid: data.adminUid || '',
                    source: 'firestore_logs'
                };
            });
            setFirestoreLogs(list);
            setLoadingLogs(false);
        }, (err) => {
            console.warn("Could not stream ledger_audit_logs:", err);
            setLoadingLogs(false);
        });

        return () => unsub();
    }, []);

    // 2. Synthesize additional logs from transactions (e.g. historical manual overrides, refunds, edits)
    const combinedAuditLogs = useMemo(() => {
        const recordedLogIds = new Set(firestoreLogs.map(l => l.transactionId || l.id));
        const syntheticLogs: AuditRecord[] = [];

        (transactions || []).forEach((tx, idx) => {
            if (!tx) return;
            const isLogged = recordedLogIds.has(tx.id) || recordedLogIds.has(tx.receipt);
            if (isLogged) return;

            const isOverride = tx.status === 'OVERRIDE_SUCCESS' || tx.method === 'Manual Override';
            const isRefunded = tx.status === 'REFUNDED';
            const isCancelled = tx.status === 'CANCELLED';
            const isEdited = (tx.remarks && tx.remarks.includes('Edited:'));

            // Include all modifications and entries
            let actionType = 'PAYMENT_ENTRY';
            let prevVal = 'Initial Ledger Entry';
            let newVal = `Amount: NRs. ${Number(tx.amount || 0).toLocaleString()} (Method: ${tx.method || 'Cash'})`;
            let reason = tx.remarks || 'Standard student fee collection entry';

            if (isOverride) {
                actionType = 'MANUAL_OVERRIDE';
                prevVal = 'Standard System Calculation';
                newVal = `Forced Status: ${tx.status || 'OVERRIDE_SUCCESS'} | Amount: NRs. ${Number(tx.amount || 0).toLocaleString()}`;
                reason = tx.remarks || 'Manual ledger balance override';
            } else if (isRefunded) {
                actionType = 'STATUS_REFUNDED';
                prevVal = `Paid Amount: NRs. ${Number(tx.amount || 0).toLocaleString()}`;
                newVal = 'STATUS: REFUNDED | Dues restored';
                reason = tx.remarks || 'Administrative fee refund';
            } else if (isCancelled) {
                actionType = 'PAYMENT_UNDONE';
                prevVal = `Paid Amount: NRs. ${Number(tx.amount || 0).toLocaleString()}`;
                newVal = 'STATUS: CANCELLED (Undone within 3h)';
                reason = tx.remarks || 'Instant undo cancellation';
            } else if (isEdited) {
                actionType = 'AMOUNT_MODIFIED';
                prevVal = 'Previous recorded transaction amount';
                newVal = `Updated Amount: NRs. ${Number(tx.amount || 0).toLocaleString()}`;
                reason = tx.remarks || 'Transaction edit';
            }

            const ts = tx.timestamp;
            let formattedTime = '';
            if (ts) {
                const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
                formattedTime = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else {
                formattedTime = tx.date || 'Recent';
            }

            syntheticLogs.push({
                id: tx.id || `syn_${idx}`,
                timestamp: ts,
                timestampStr: formattedTime,
                date: tx.date || '',
                dateBS: tx.dateBS || tx.date || '',
                transactionId: tx.id || '',
                receipt: tx.receipt || `RCP-${idx}`,
                studentId: tx.studentId || '',
                studentName: tx.studentName || 'Student',
                studentClass: tx.class || '-',
                actionType,
                previousValue: prevVal,
                newValue: newVal,
                reason,
                adminName: tx.createdBy || tx.collectedBy || 'Administrator',
                adminEmail: '',
                adminUid: tx.creatorUid || '',
                source: 'transaction_stream'
            });
        });

        // Merge both and sort newest first
        const allLogs = [...firestoreLogs, ...syntheticLogs];
        allLogs.sort((a, b) => {
            const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
            const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
            if (timeA && timeB && timeA !== timeB) return timeB - timeA;
            return String(b?.id || '').localeCompare(String(a?.id || ''));
        });

        return allLogs;
    }, [firestoreLogs, transactions]);

    // Extract unique administrators for filtering
    const administrators = useMemo(() => {
        const set = new Set<string>();
        combinedAuditLogs.forEach(log => {
            if (log.adminName && log.adminName.trim()) set.add(log.adminName.trim());
        });
        return Array.from(set);
    }, [combinedAuditLogs]);

    // Search and filter logic
    const filteredLogs = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return combinedAuditLogs.filter(log => {
            const matchesSearch = term === '' || 
                (log.studentName && log.studentName.toLowerCase().includes(term)) ||
                (log.receipt && log.receipt.toLowerCase().includes(term)) ||
                (log.adminName && log.adminName.toLowerCase().includes(term)) ||
                (log.adminEmail && log.adminEmail.toLowerCase().includes(term)) ||
                (log.reason && log.reason.toLowerCase().includes(term)) ||
                (log.previousValue && log.previousValue.toLowerCase().includes(term)) ||
                (log.newValue && log.newValue.toLowerCase().includes(term)) ||
                (log.actionType && log.actionType.toLowerCase().includes(term)) ||
                (log.studentClass && log.studentClass.toLowerCase().includes(term)) ||
                (log.timestampStr && log.timestampStr.toLowerCase().includes(term)) ||
                (log.dateBS && log.dateBS.toLowerCase().includes(term));

            const matchesAction = actionFilter === 'all' || log.actionType === actionFilter;
            const matchesAdmin = selectedAdmin === 'all' || log.adminName === selectedAdmin;
            const matchesDate = !dateFilter || log.date.includes(dateFilter) || log.dateBS.includes(dateFilter);

            return matchesSearch && matchesAction && matchesAdmin && matchesDate;
        });
    }, [combinedAuditLogs, searchTerm, actionFilter, selectedAdmin, dateFilter]);

    // Summary counts
    const modificationsCount = useMemo(() => {
        return combinedAuditLogs.filter(l => l.actionType !== 'PAYMENT_ENTRY').length;
    }, [combinedAuditLogs]);

    const refundsCount = useMemo(() => {
        return combinedAuditLogs.filter(l => l.actionType === 'STATUS_REFUNDED' || l.actionType === 'PAYMENT_UNDONE').length;
    }, [combinedAuditLogs]);

    const overridesCount = useMemo(() => {
        return combinedAuditLogs.filter(l => l.actionType === 'MANUAL_OVERRIDE').length;
    }, [combinedAuditLogs]);

    // Export to Excel
    const handleExportExcel = () => {
        const columns = [
            { header: 'SN', key: 'sn', width: 8 },
            { header: 'Timestamp', key: 'timestamp', width: 22 },
            { header: 'Date (B.S.)', key: 'dateBS', width: 14 },
            { header: 'Receipt / Ref No', key: 'receipt', width: 18 },
            { header: 'Student / Particulars', key: 'studentName', width: 22 },
            { header: 'Class', key: 'studentClass', width: 12 },
            { header: 'Action Type', key: 'actionType', width: 20 },
            { header: 'Previous Value', key: 'previousValue', width: 25 },
            { header: 'New Value', key: 'newValue', width: 25 },
            { header: 'Reason for Change', key: 'reason', width: 30 },
            { header: 'Administrator', key: 'adminName', width: 20 },
            { header: 'Admin Email', key: 'adminEmail', width: 25 }
        ];

        const data = filteredLogs.map((l, index) => ({
            sn: index + 1,
            timestamp: l.timestampStr,
            dateBS: l.dateBS || 'N/A',
            receipt: l.receipt,
            studentName: l.studentName,
            studentClass: l.studentClass,
            actionType: l.actionType.replace('_', ' '),
            previousValue: l.previousValue,
            newValue: l.newValue,
            reason: l.reason,
            adminName: l.adminName,
            adminEmail: l.adminEmail || 'N/A'
        }));

        exportToExcel(
            `Ledger_Audit_Log_${new Date().toISOString().slice(0, 10)}`,
            'LEDGER AUDIT TRAIL & TRANSACTION MODIFICATION LOG',
            columns,
            data
        );
    };

    // Print Official Audit Trail Report
    const handlePrintReport = () => {
        let rowsHtml = '';
        filteredLogs.forEach((log, idx) => {
            rowsHtml += `
                <tr>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; text-align: center;">${idx + 1}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; font-family: monospace;">${log.timestampStr}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; font-weight: bold;">${log.receipt}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px;">${log.studentName} (${log.studentClass})</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; font-weight: bold; color: ${
                        log.actionType.includes('DELETE') || log.actionType.includes('REFUND') ? '#b91c1c' :
                        log.actionType.includes('OVERRIDE') ? '#b45309' :
                        log.actionType.includes('MODIFIED') ? '#1d4ed8' : '#047857'
                    };">${log.actionType.replace('_', ' ')}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; color: #4b5563;">${log.previousValue}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; font-weight: bold; color: #111827;">${log.newValue}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; font-style: italic; color: #374151;">${log.reason}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px; font-weight: bold; color: #1e3a8a;">${log.adminName}</td>
                </tr>
            `;
        });

        const printHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ledger Audit Log & Modification Report - Shikshantar Academy</title>
                <style>
                    @page { size: landscape; margin: 15mm; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 0; padding: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th { background-color: #f3f4f6; border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px; font-weight: bold; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <div style="text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 15px;">
                    <h2 style="margin: 0; color: #1e3a8a; font-size: 20px; font-weight: 900; letter-spacing: 0.5px;">SHIKSHANTAR ACADEMY</h2>
                    <p style="margin: 3px 0; font-size: 11px; color: #4b5563;">Bastipur, Karjanha-05, Siraha, Nepal &bull; Phone: +977 9800000000</p>
                    <h3 style="margin: 6px 0 0; color: #047857; font-size: 15px; font-weight: 800; text-transform: uppercase;">Official Ledger Modification Audit Trail</h3>
                    <p style="margin: 2px 0 0; font-size: 11px; color: #6b7280;">Printed on: ${new Date().toLocaleString()} &bull; Total Filtered Log Records: ${filteredLogs.length}</p>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 30px; text-align: center;">SN</th>
                            <th>Timestamp</th>
                            <th>Receipt / Ref</th>
                            <th>Student / Account</th>
                            <th>Action Type</th>
                            <th>Previous Value</th>
                            <th>New Value</th>
                            <th>Reason for Change</th>
                            <th>Administrator</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || '<tr><td colspan="9" style="text-align: center; padding: 20px; font-size: 12px; color: #6b7280;">No modification records match filter criteria.</td></tr>'}
                    </tbody>
                </table>

                <div style="display: flex; justify-content: space-between; margin-top: 50px; font-size: 11px;">
                    <div>
                        <div style="border-top: 1px solid #000; width: 220px; text-align: center; padding-top: 4px; font-weight: bold;">Verified By (Accountant)</div>
                    </div>
                    <div>
                        <div style="border-top: 1px solid #000; width: 220px; text-align: center; padding-top: 4px; font-weight: bold;">Authorized Administrator Signature</div>
                    </div>
                </div>
            </body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
            doc.write(printHtml);
            doc.close();
            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                document.body.removeChild(iframe);
            }, 300);
        }
    };

    const getActionBadge = (type: string) => {
        switch (type) {
            case 'AMOUNT_MODIFIED':
                return {
                    label: 'Amount Modified',
                    icon: <Edit3 className="w-3 h-3" />,
                    classes: 'bg-blue-50 text-blue-700 border-blue-200'
                };
            case 'STATUS_REFUNDED':
                return {
                    label: 'Refunded',
                    icon: <RotateCcw className="w-3 h-3" />,
                    classes: 'bg-rose-50 text-rose-700 border-rose-200'
                };
            case 'PAYMENT_UNDONE':
                return {
                    label: 'Payment Undone',
                    icon: <RotateCcw className="w-3 h-3" />,
                    classes: 'bg-amber-50 text-amber-700 border-amber-200'
                };
            case 'TRANSACTION_DELETED':
                return {
                    label: 'Record Deleted',
                    icon: <Trash2 className="w-3 h-3" />,
                    classes: 'bg-red-100 text-red-800 border-red-300'
                };
            case 'MANUAL_OVERRIDE':
                return {
                    label: 'Manual Override',
                    icon: <AlertCircle className="w-3 h-3" />,
                    classes: 'bg-purple-50 text-purple-700 border-purple-200'
                };
            case 'PAYMENT_ENTRY':
                return {
                    label: 'Payment Entry',
                    icon: <CheckCircle2 className="w-3 h-3" />,
                    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                };
            default:
                return {
                    label: type.replace('_', ' '),
                    icon: <Layers className="w-3 h-3" />,
                    classes: 'bg-gray-100 text-gray-700 border-gray-200'
                };
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300 pb-20">
            {/* Header banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-slate-800">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-400/30 flex items-center gap-1.5 backdrop-blur-md">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Immutable Financial Audit Trail
                        </span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        <History className="w-7 h-7 text-indigo-400" /> Ledger Audit Log
                    </h2>
                    <p className="text-xs text-slate-300 mt-1.5 max-w-2xl font-medium leading-relaxed">
                        Complete searchable record of every transaction modification, amount edit, refund, payment undo, manual override, and deletion. Each entry captures timestamp, previous value, new value, reason for change, and administrator name.
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap shrink-0">
                    <button 
                        onClick={handleExportExcel}
                        className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-xl border border-white/20 text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95"
                    >
                        <Download className="w-4 h-4 text-emerald-400" /> Export Excel
                    </button>
                    <button 
                        onClick={handlePrintReport}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
                    >
                        <Printer className="w-4 h-4" /> Print Audit Report
                    </button>
                </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Audit Records</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{combinedAuditLogs.length}</p>
                        <span className="text-[10px] font-bold text-gray-400">{filteredLogs.length} matching search</span>
                    </div>
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                        <FileText className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Modifications & Edits</p>
                        <p className="text-2xl font-black text-blue-600 mt-1">{modificationsCount}</p>
                        <span className="text-[10px] font-bold text-blue-500">Tracked changes</span>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                        <Edit3 className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Refunds & Reversals</p>
                        <p className="text-2xl font-black text-rose-600 mt-1">{refundsCount}</p>
                        <span className="text-[10px] font-bold text-rose-500">Reverted payments</span>
                    </div>
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                        <RotateCcw className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Manual Overrides</p>
                        <p className="text-2xl font-black text-purple-600 mt-1">{overridesCount}</p>
                        <span className="text-[10px] font-bold text-purple-500">Forced status balances</span>
                    </div>
                    <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Search & Filter Controls */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search by student name, receipt #, reason, previous value, new value, or admin name..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                        <select
                            value={actionFilter}
                            onChange={e => setActionFilter(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Action Types</option>
                            <option value="AMOUNT_MODIFIED">Amount Modified</option>
                            <option value="STATUS_REFUNDED">Status Refunded</option>
                            <option value="PAYMENT_UNDONE">Payment Undone</option>
                            <option value="TRANSACTION_DELETED">Transaction Deleted</option>
                            <option value="MANUAL_OVERRIDE">Manual Override</option>
                            <option value="PAYMENT_ENTRY">Payment Entry</option>
                        </select>

                        <select
                            value={selectedAdmin}
                            onChange={e => setSelectedAdmin(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Administrators</option>
                            {administrators.map((adm, i) => (
                                <option key={i} value={adm}>{adm}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Quick Action Filter Chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 shrink-0">Filter by:</span>
                    <button 
                        onClick={() => setActionFilter('all')}
                        className={`px-3 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${actionFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        All ({combinedAuditLogs.length})
                    </button>
                    <button 
                        onClick={() => setActionFilter('AMOUNT_MODIFIED')}
                        className={`px-3 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${actionFilter === 'AMOUNT_MODIFIED' ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                    >
                        Amount Modified ({combinedAuditLogs.filter(l => l.actionType === 'AMOUNT_MODIFIED').length})
                    </button>
                    <button 
                        onClick={() => setActionFilter('STATUS_REFUNDED')}
                        className={`px-3 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${actionFilter === 'STATUS_REFUNDED' ? 'bg-rose-600 text-white shadow-sm' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                    >
                        Refunds ({combinedAuditLogs.filter(l => l.actionType === 'STATUS_REFUNDED').length})
                    </button>
                    <button 
                        onClick={() => setActionFilter('PAYMENT_UNDONE')}
                        className={`px-3 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${actionFilter === 'PAYMENT_UNDONE' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                    >
                        Instant Undos ({combinedAuditLogs.filter(l => l.actionType === 'PAYMENT_UNDONE').length})
                    </button>
                    <button 
                        onClick={() => setActionFilter('TRANSACTION_DELETED')}
                        className={`px-3 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${actionFilter === 'TRANSACTION_DELETED' ? 'bg-red-700 text-white shadow-sm' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                    >
                        Deleted ({combinedAuditLogs.filter(l => l.actionType === 'TRANSACTION_DELETED').length})
                    </button>
                    <button 
                        onClick={() => setActionFilter('MANUAL_OVERRIDE')}
                        className={`px-3 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${actionFilter === 'MANUAL_OVERRIDE' ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                    >
                        Overrides ({combinedAuditLogs.filter(l => l.actionType === 'MANUAL_OVERRIDE').length})
                    </button>
                </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50/50">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-600" /> Ledger Modification History ({filteredLogs.length} Records)
                    </span>
                    <span className="text-[11px] text-gray-400 font-medium">Click any row to inspect complete previous/new value audit details</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                <th className="p-4">Timestamp & Date</th>
                                <th className="p-4">Receipt / Ref</th>
                                <th className="p-4">Student & Class</th>
                                <th className="p-4">Action Type</th>
                                <th className="p-4 min-w-[200px]">Previous Value</th>
                                <th className="p-4 min-w-[200px]">New Value</th>
                                <th className="p-4 min-w-[180px]">Reason for Change</th>
                                <th className="p-4">Administrator</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                            {filteredLogs.length > 0 ? (
                                filteredLogs.map((log) => {
                                    const badge = getActionBadge(log.actionType);
                                    return (
                                        <tr 
                                            key={log.id} 
                                            onClick={() => setSelectedLogForDetails(log)}
                                            className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                                        >
                                            {/* Timestamp */}
                                            <td className="p-4 whitespace-nowrap">
                                                <div className="font-mono font-bold text-gray-900 text-xs flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                    {log.timestampStr}
                                                </div>
                                                {log.dateBS && (
                                                    <div className="text-[10px] font-bold text-indigo-600 mt-0.5">
                                                        B.S. {log.dateBS}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Receipt / Ref */}
                                            <td className="p-4 whitespace-nowrap font-mono font-bold text-gray-800">
                                                <span className="bg-gray-100 px-2 py-1 rounded text-[11px] border border-gray-200">
                                                    {log.receipt}
                                                </span>
                                            </td>

                                            {/* Student & Class */}
                                            <td className="p-4">
                                                <div className="font-bold text-gray-900">{log.studentName}</div>
                                                <div className="text-[11px] text-gray-500 font-medium">Class {log.studentClass}</div>
                                            </td>

                                            {/* Action Type */}
                                            <td className="p-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${badge.classes}`}>
                                                    {badge.icon}
                                                    {badge.label}
                                                </span>
                                            </td>

                                            {/* Previous Value */}
                                            <td className="p-4 text-gray-600 max-w-xs text-[11px] leading-relaxed">
                                                <div className="bg-rose-50/60 border border-rose-100 text-rose-900 p-2 rounded-lg font-mono">
                                                    {log.previousValue}
                                                </div>
                                            </td>

                                            {/* New Value */}
                                            <td className="p-4 text-gray-900 max-w-xs text-[11px] leading-relaxed">
                                                <div className="bg-emerald-50/60 border border-emerald-100 text-emerald-900 p-2 rounded-lg font-mono font-bold">
                                                    {log.newValue}
                                                </div>
                                            </td>

                                            {/* Reason for Change */}
                                            <td className="p-4 text-gray-700 max-w-xs text-[11px] leading-relaxed">
                                                <div className="font-medium text-slate-800 bg-amber-50/50 border border-amber-100/70 p-2 rounded-lg">
                                                    "{log.reason}"
                                                </div>
                                            </td>

                                            {/* Administrator */}
                                            <td className="p-4 whitespace-nowrap">
                                                <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                                                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" /> {log.adminName}
                                                </div>
                                                {log.adminEmail && (
                                                    <div className="text-[10px] text-gray-400 font-mono">{log.adminEmail}</div>
                                                )}
                                            </td>

                                            {/* Action Buttons */}
                                            <td className="p-4 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setSelectedLogForDetails(log); }}
                                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-100/50 rounded-xl transition-colors"
                                                        title="View Full Details"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <span 
                                                        className="p-2 text-emerald-600/70"
                                                        title="Permanent Immutable Audit Log (Physical Deletion Strictly Prohibited)"
                                                    >
                                                        <ShieldCheck className="w-4 h-4" />
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={9} className="p-16 text-center text-gray-400">
                                        <div className="max-w-sm mx-auto space-y-2">
                                            <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto" />
                                            <p className="font-bold text-gray-700 text-sm">No ledger audit records found</p>
                                            <p className="text-xs text-gray-400">
                                                {searchTerm ? `No records match "${searchTerm}". Try resetting search or filters.` : 'All ledger transactions and modifications will appear here in real-time.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detailed Inspection Modal */}
            {selectedLogForDetails && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white max-w-2xl w-full rounded-3xl p-6 md:p-8 shadow-2xl animate-in zoom-in duration-150 space-y-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                            <div>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getActionBadge(selectedLogForDetails.actionType).classes}`}>
                                    {getActionBadge(selectedLogForDetails.actionType).icon}
                                    {getActionBadge(selectedLogForDetails.actionType).label}
                                </span>
                                <h3 className="text-xl font-black text-gray-900 mt-2">Audit Log Entry Details</h3>
                                <p className="text-xs text-gray-400 font-mono">Reference ID: {selectedLogForDetails.id}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedLogForDetails(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-xl"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Top Meta Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Student / Particulars</span>
                                <span className="font-bold text-gray-900 text-sm">{selectedLogForDetails.studentName}</span>
                                <span className="text-gray-500 block text-[11px]">Class {selectedLogForDetails.studentClass}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Receipt / Ref #</span>
                                <span className="font-mono font-bold text-gray-900 text-sm">{selectedLogForDetails.receipt}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Timestamp</span>
                                <span className="font-mono font-bold text-gray-900">{selectedLogForDetails.timestampStr}</span>
                                {selectedLogForDetails.dateBS && <span className="text-indigo-600 text-[10px] block font-bold">B.S. {selectedLogForDetails.dateBS}</span>}
                            </div>
                        </div>

                        {/* Side-by-Side Diff Comparison */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <ArrowRight className="w-4 h-4 text-indigo-600" /> Value Modification Diff
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-rose-700">Previous State / Value</span>
                                        <span className="text-[10px] font-mono text-rose-500 font-bold">BEFORE</span>
                                    </div>
                                    <div className="text-xs font-mono text-rose-950 font-medium whitespace-pre-wrap leading-relaxed">
                                        {selectedLogForDetails.previousValue}
                                    </div>
                                </div>

                                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">New State / Value</span>
                                        <span className="text-[10px] font-mono text-emerald-600 font-bold">AFTER</span>
                                    </div>
                                    <div className="text-xs font-mono text-emerald-950 font-bold whitespace-pre-wrap leading-relaxed">
                                        {selectedLogForDetails.newValue}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Reason for change */}
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 block mb-1">Reason for Change / Justification</span>
                            <p className="text-sm font-bold text-amber-950 italic leading-relaxed">
                                "{selectedLogForDetails.reason}"
                            </p>
                        </div>

                        {/* Administrator signature */}
                        <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white">
                                    {selectedLogForDetails.adminName.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Modified & Authorized By</span>
                                    <span className="font-bold text-sm text-white">{selectedLogForDetails.adminName}</span>
                                    {selectedLogForDetails.adminEmail && <span className="text-xs text-slate-400 font-mono block">{selectedLogForDetails.adminEmail}</span>}
                                </div>
                            </div>
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                                Verified Operator
                            </span>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">
                                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Permanent Tamper-Evident Record (Non-Deletable)
                            </div>
                            <button 
                                onClick={() => setSelectedLogForDetails(null)}
                                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
                            >
                                Close Inspection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
