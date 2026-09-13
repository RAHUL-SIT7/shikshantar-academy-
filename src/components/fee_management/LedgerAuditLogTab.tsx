import React, { useState, useMemo } from 'react';
import { Search, ShieldCheck, Printer, Download, Clock, UserCheck, FileText, AlertCircle, CheckCircle2, History, Banknote, Filter } from 'lucide-react';
import { formatBSDate } from '../../lib/nepaliDate';

export default function LedgerAuditLogTab({ transactions, students }: { transactions: any[]; students: any[] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'payment' | 'override'>('all');
    const [selectedOperator, setSelectedOperator] = useState<string>('all');

    // Extract unique operators from transactions
    const operators = useMemo(() => {
        const ops = new Set<string>();
        (transactions || []).forEach(tx => {
            if (tx.createdBy) ops.add(tx.createdBy);
            if (tx.collectedBy) ops.add(tx.collectedBy);
        });
        return Array.from(ops);
    }, [transactions]);

    // Filter audit logs from transactions
    const auditLogs = useMemo(() => {
        return (transactions || []).map((tx, idx) => {
            const isOverride = tx.status === 'OVERRIDE_SUCCESS' || tx.method === 'Manual Override';
            const timestampFormatted = tx.timestamp?.seconds 
                ? new Date(tx.timestamp.seconds * 1000).toLocaleString() 
                : (tx.timestamp ? new Date(tx.timestamp).toLocaleString() : (tx.date || 'Recent'));

            return {
                id: tx.id || `tx_${idx}`,
                receipt: tx.receipt || `RCP-${idx}`,
                studentName: tx.studentName || 'Unknown Student',
                studentClass: tx.class || 'N/A',
                amount: Number(tx.amount || 0),
                actionType: isOverride ? 'MANUAL_OVERRIDE' : 'PAYMENT_ENTRY',
                method: tx.method || 'Cash',
                collectedBy: tx.collectedBy || 'Admin',
                createdBy: tx.createdBy || tx.collectedBy || 'Admin Accountant',
                creatorUid: tx.creatorUid || 'system',
                date: tx.date || formatBSDate(new Date()),
                timestampStr: timestampFormatted,
                status: tx.status || 'SUCCESS',
                remarks: tx.remarks || 'Standard Fee Transaction',
                months: tx.months || []
            };
        }).sort((a, b) => {
            // Sort newest first
            return b.id.localeCompare(a.id);
        });
    }, [transactions]);

    const filteredLogs = useMemo(() => {
        return auditLogs.filter(log => {
            const matchesSearch = searchTerm === '' || 
                log.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.receipt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.createdBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.remarks.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesType = filterType === 'all' || 
                (filterType === 'payment' && log.actionType === 'PAYMENT_ENTRY') ||
                (filterType === 'override' && log.actionType === 'MANUAL_OVERRIDE');

            const matchesOperator = selectedOperator === 'all' || 
                log.createdBy === selectedOperator || log.collectedBy === selectedOperator;

            return matchesSearch && matchesType && matchesOperator;
        });
    }, [auditLogs, searchTerm, filterType, selectedOperator]);

    const totalAuditAmount = filteredLogs.reduce((sum, l) => sum + l.amount, 0);
    const totalOverridesCount = auditLogs.filter(l => l.actionType === 'MANUAL_OVERRIDE').length;
    const totalPaymentsCount = auditLogs.filter(l => l.actionType === 'PAYMENT_ENTRY').length;

    const printAuditReport = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        let rowsHtml = '';
        filteredLogs.forEach((log, idx) => {
            rowsHtml += `
                <tr>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px;">${idx + 1}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px; font-family: monospace;">${log.receipt}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px;">${log.studentName} (Class ${log.studentClass})</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px; font-weight: bold; color: ${log.actionType === 'MANUAL_OVERRIDE' ? '#b91c1c' : '#047857'};">${log.actionType}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px; text-align: right; font-family: monospace;">NRs. ${log.amount.toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px;">${log.createdBy}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px;">${log.timestampStr}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-size: 11px;">${log.remarks}</td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <html>
            <head><title>Financial Audit Trail Report - Shikshantar Academy</title></head>
            <body onload="window.print();" style="font-family: Arial, sans-serif; padding: 30px; color: #111827;">
                <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #1e3a8a;">SHIKSHANTAR ACADEMY</h2>
                    <p style="margin: 4px 0; font-size: 12px; color: #4b5563;">Bastipur, Karjanha-05, Siraha, Nepal</p>
                    <h3 style="margin: 8px 0 0; color: #059669; font-size: 16px;">OFFICIAL FINANCIAL LEDGER AUDIT LOG & TRANSPARENCY REPORT</h3>
                    <p style="margin: 2px 0 0; font-size: 11px; color: #6b7280;">Generated on: ${new Date().toLocaleString()} | Total Entries: ${filteredLogs.length}</p>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px;">SN</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px;">Receipt/Ref</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px;">Student</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px;">Action Type</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right; font-size: 10px;">Amount</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px;">Created By / Operator</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px;">Timestamp</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 10px;">Audit Remarks / Adjustments</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 20px;">No audit records found</td></tr>'}
                    </tbody>
                </table>

                <div style="display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px;">
                    <div>
                        <p style="border-top: 1px solid #000; padding-top: 5px; width: 200px; text-align: center;">Verified By (Accountant)</p>
                    </div>
                    <div>
                        <p style="border-top: 1px solid #000; padding-top: 5px; width: 200px; text-align: center;">Authorized Signature (Principal)</p>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header banner */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-400/30 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Complete Transparency Audit Trail
                        </span>
                    </div>
                    <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                        <History className="w-7 h-7 text-indigo-400" /> Ledger Audit & Activity Log
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 max-w-xl font-medium">
                        Tracks every payment entry, who recorded it, exact timestamp, and manual adjustments or ledger overrides to ensure uncompromised financial transparency.
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <button 
                        onClick={printAuditReport}
                        className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-xl border border-white/20 text-xs flex items-center gap-2 transition-all"
                    >
                        <Printer className="w-4 h-4" /> Print Audit Report
                    </button>
                </div>
            </div>

            {/* Quick KPI stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Audit Events</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{auditLogs.length}</p>
                    </div>
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                        <FileText className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Payment Entries</p>
                        <p className="text-2xl font-black text-emerald-600 mt-1">{totalPaymentsCount}</p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                        <Banknote className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Manual Adjustments / Overrides</p>
                        <p className="text-2xl font-black text-amber-600 mt-1">{totalOverridesCount}</p>
                    </div>
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Filtered Amount</p>
                        <p className="text-xl font-black text-blue-600 mt-1">NRs. {totalAuditAmount.toLocaleString()}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search by student name, receipt number, operator email, or remarks..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setFilterType('all')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            All Logs
                        </button>
                        <button
                            onClick={() => setFilterType('payment')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'payment' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Payments
                        </button>
                        <button
                            onClick={() => setFilterType('override')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'override' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Overrides
                        </button>
                    </div>

                    <select
                        value={selectedOperator}
                        onChange={e => setSelectedOperator(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="all">All Operators / Creators</option>
                        {operators.map((op, idx) => (
                            <option key={idx} value={op}>{op}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-600" /> Immutable Audit Entries ({filteredLogs.length})
                    </span>
                    <span className="text-[11px] text-gray-400 font-medium">Secured with Server Timestamp & Operator Signatures</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/80 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                <th className="p-4">Receipt / Ref</th>
                                <th className="p-4">Student & Class</th>
                                <th className="p-4">Action Type</th>
                                <th className="p-4 text-right">Amount (NRs.)</th>
                                <th className="p-4">Created By / Operator</th>
                                <th className="p-4">Timestamp</th>
                                <th className="p-4">Audit Remarks / Adjustment Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                            {filteredLogs.length > 0 ? (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="p-4 font-mono font-bold text-gray-900">{log.receipt}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900">{log.studentName}</div>
                                            <div className="text-[11px] text-gray-500">Class {log.studentClass}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                log.actionType === 'MANUAL_OVERRIDE'
                                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                            }`}>
                                                {log.actionType === 'MANUAL_OVERRIDE' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                                {log.actionType.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-mono font-bold text-gray-900">
                                            NRs. {log.amount.toLocaleString()}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-indigo-700 flex items-center gap-1">
                                                <UserCheck className="w-3.5 h-3.5" /> {log.createdBy}
                                            </div>
                                            <div className="text-[10px] font-mono text-gray-400">ID: {log.creatorUid.slice(0, 10)}...</div>
                                        </td>
                                        <td className="p-4 text-gray-600 font-mono text-[11px]">
                                            {log.timestampStr}
                                        </td>
                                        <td className="p-4 text-gray-600 max-w-xs truncate" title={log.remarks}>
                                            {log.remarks}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-gray-400 font-medium">
                                        No audit log entries found matching your search criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
