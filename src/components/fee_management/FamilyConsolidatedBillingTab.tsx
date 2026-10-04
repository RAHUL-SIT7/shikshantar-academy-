import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Receipt,
  Printer,
  Download,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Banknote,
  Layers,
  ArrowRight,
  RefreshCw,
  FileText,
  DollarSign,
  UserCheck,
  X
} from 'lucide-react';
import { formatBSDate, getTodayBSDateYMD } from '../../lib/nepaliDate';
import {
  groupStudentsByFamily,
  calculateFamilyPaymentAllocation,
  executeFamilyCashFeePayment,
  FamilyGroup,
  FamilyChildSummary
} from '../../lib/familyBillingEngine';
import { NumericInput } from '../common/NumericInput';
import { parseIntegerAmount } from '../../lib/cashPaymentEngine';

interface FamilyConsolidatedBillingTabProps {
  students: any[];
  remitBills?: any[];
  academicYear?: string;
  onRefresh: () => void;
  onViewStudentLedger?: (studentId: string) => void;
}

export default function FamilyConsolidatedBillingTab({
  students,
  remitBills = [],
  academicYear = '2083',
  onRefresh,
  onViewStudentLedger
}: FamilyConsolidatedBillingTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<FamilyGroup | null>(null);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  // Payment States
  const [cashTendered, setCashTendered] = useState<string>('');
  const [excessDecision, setExcessDecision] = useState<'ADVANCE' | 'RETURN' | null>(null);
  const [advanceDesignatedChildId, setAdvanceDesignatedChildId] = useState<string>('');
  const [customAllocations, setCustomAllocations] = useState<Record<string, string>>({});
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derive family groups
  const allFamilyGroups = useMemo(() => {
    return groupStudentsByFamily(students, remitBills, academicYear);
  }, [students, remitBills, academicYear]);

  // Filtered family groups based on search
  const filteredFamilies = useMemo(() => {
    if (!searchTerm.trim()) return allFamilyGroups;
    const term = searchTerm.toLowerCase();
    return allFamilyGroups.filter(
      (f) =>
        f.guardianName.toLowerCase().includes(term) ||
        f.guardianPhone.includes(term) ||
        f.children.some(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.studentId.toLowerCase().includes(term) ||
            c.class.toLowerCase().includes(term)
        )
    );
  }, [allFamilyGroups, searchTerm]);

  // Dynamic payment calculation breakdown
  const paymentBreakdown = useMemo(() => {
    if (!selectedFamily) return null;
    const numAllocations: Record<string, number> = {};
    if (isCustomMode) {
      Object.entries(customAllocations).forEach(([k, v]) => {
        numAllocations[k] = parseIntegerAmount(v);
      });
    }

    return calculateFamilyPaymentAllocation(
      selectedFamily.children,
      cashTendered,
      isCustomMode ? numAllocations : undefined,
      excessDecision,
      advanceDesignatedChildId
    );
  }, [selectedFamily, cashTendered, isCustomMode, customAllocations, excessDecision, advanceDesignatedChildId]);

  const handleOpenPaymentModal = (family: FamilyGroup) => {
    setSelectedFamily(family);
    setCashTendered(family.totalFamilyPayable > 0 ? family.totalFamilyPayable.toString() : '');
    setExcessDecision(null);
    setAdvanceDesignatedChildId(family.children[0]?.id || '');
    setIsCustomMode(false);
    setCustomAllocations({});
    setRemarks('');
    setErrorMessage(null);
    setPaymentSuccessData(null);
    setShowPaymentModal(true);
  };

  const handleOpenStatementModal = (family: FamilyGroup) => {
    setSelectedFamily(family);
    setShowStatementModal(true);
  };

  const handleCustomChildAmountChange = (childId: string, val: string) => {
    setCustomAllocations((prev) => ({
      ...prev,
      [childId]: val
    }));
  };

  const handleConfirmPayment = async () => {
    if (!selectedFamily || !paymentBreakdown) return;
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      const res = await executeFamilyCashFeePayment({
        guardianName: selectedFamily.guardianName,
        guardianPhone: selectedFamily.guardianPhone,
        academicYear,
        children: selectedFamily.children,
        cashTendered: parseIntegerAmount(cashTendered),
        customAllocations: isCustomMode ? customAllocations : undefined,
        excessDecision,
        advanceDesignatedChildId,
        remarks
      });

      setPaymentSuccessData(res);
      onRefresh();
    } catch (err: any) {
      console.error('Family payment failed:', err);
      setErrorMessage(err.message || 'Payment processing failed. Please verify amounts and retry.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header & Metric Cards */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-blue-500/30 text-blue-200 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider border border-blue-400/30">
                Guardian Accounts
              </span>
              <span className="text-xs font-bold text-slate-300">Academic Year {academicYear} B.S.</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">Family Consolidated Billing</h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Consolidate fee statements and collect single cash payments for families with multiple enrolled siblings while maintaining 100% individual child ledger isolation.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/10 p-4 rounded-2xl border border-white/15 backdrop-blur-md">
            <Users className="w-8 h-8 text-blue-300" />
            <div>
              <p className="text-[11px] font-black uppercase text-blue-200 tracking-wider">Identified Families</p>
              <p className="text-2xl font-black text-white">{allFamilyGroups.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Guardian Name, Phone, Child Name, or Student ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium"
          />
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition flex items-center gap-2 shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Families List Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredFamilies.map((family) => (
          <div
            key={family.familyKey}
            className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between"
          >
            <div className="p-6 border-b border-slate-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">{family.guardianName}</h3>
                    <span className="text-[10px] font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                      {family.children.length} Children
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Contact: {family.guardianPhone || 'Not provided'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Total Family Payable</span>
                  <span className="text-xl font-black text-rose-600">
                    NRs. {family.totalFamilyPayable.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Children List */}
              <div className="space-y-2 mt-4">
                {family.children.map((child) => (
                  <div
                    key={child.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800">{child.name}</span>
                        <span className="font-bold text-slate-500">Class {child.class}</span>
                        {child.rollNumber && (
                          <span className="text-slate-400 font-medium">Roll #{child.rollNumber}</span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 font-semibold">{child.studentId}</span>
                    </div>

                    <div className="text-right">
                      {child.totalDue > 0 ? (
                        <span className="font-black text-rose-600">Due: NRs. {child.totalDue.toLocaleString()}</span>
                      ) : (
                        <span className="font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 bg-slate-50/50 flex gap-3">
              <button
                onClick={() => handleOpenStatementModal(family)}
                className="flex-1 py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                View Statement
              </button>
              <button
                onClick={() => handleOpenPaymentModal(family)}
                className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
              >
                <Banknote className="w-4 h-4" />
                Collect Cash
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredFamilies.length === 0 && (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500">
          <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="font-bold text-base text-slate-700">No Family Groups Found</p>
          <p className="text-xs text-slate-400 mt-1">
            Ensure students have guardian name or parent phone populated in their profile to group siblings.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: FAMILY CONSOLIDATED STATEMENT (PRINT / PDF)          */}
      {/* ------------------------------------------------------------- */}
      {showStatementModal && selectedFamily && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="font-black text-base uppercase tracking-wider">Family Fee Statement</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Statement
                </button>
                <button
                  onClick={() => setShowStatementModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Statement Document */}
            <div className="p-8 space-y-6 print:p-0" id="family-statement-doc">
              {/* School Header */}
              <div className="text-center border-b pb-4">
                <h1 className="text-2xl font-black tracking-tight text-slate-900">SHIKSHANTAR ACADEMY</h1>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                  Bastipur, Karjanha-05, Siraha, Nepal
                </p>
                <p className="text-xs text-slate-500 font-medium">
                  +977 9709867048, +977 9807790805 | shikshantaracademy@gmail.com
                </p>
                <div className="inline-block mt-3 px-4 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-800 uppercase tracking-wider">
                  FAMILY CONSOLIDATED FEE STATEMENT
                </div>
              </div>

              {/* Guardian & Date Meta */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <p className="text-slate-500 font-bold uppercase text-[10px]">Guardian / Family Name</p>
                  <p className="font-black text-slate-800 text-sm">{selectedFamily.guardianName}</p>
                  <p className="text-slate-600 mt-1 font-medium">Contact: {selectedFamily.guardianPhone}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 font-bold uppercase text-[10px]">Academic Year & Date</p>
                  <p className="font-black text-slate-800">{academicYear} B.S.</p>
                  <p className="text-slate-600 mt-1 font-medium">Date (B.S.): {formatBSDate(new Date())}</p>
                </div>
              </div>

              {/* Children Breakdown Table */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">Enrolled Children & Payable Breakdown</h4>
                <div className="border rounded-2xl overflow-hidden border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Child Name & ID</th>
                        <th className="p-3">Class</th>
                        <th className="p-3 text-right">Prev Year Due</th>
                        <th className="p-3 text-right">Current Year Due</th>
                        <th className="p-3 text-right">Total Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedFamily.children.map((child) => (
                        <tr key={child.id} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{child.name}</span>
                            <span className="font-mono text-[10px] text-slate-500">{child.studentId}</span>
                          </td>
                          <td className="p-3 font-semibold text-slate-700">Class {child.class}</td>
                          <td className="p-3 text-right font-medium text-slate-600">
                            NRs. {child.previousYearDue.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-medium text-slate-600">
                            NRs. {child.currentYearDue.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-black text-rose-600">
                            NRs. {child.totalDue.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-900 text-white font-black text-xs">
                      <tr>
                        <td colSpan={4} className="p-3 uppercase tracking-wider text-right">
                          Total Family Payable:
                        </td>
                        <td className="p-3 text-right text-emerald-300 text-sm">
                          NRs. {selectedFamily.totalFamilyPayable.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Footer Note */}
              <div className="text-center text-[10px] text-slate-400 pt-4 border-t border-slate-100">
                <p>This is a consolidated statement. Official individual receipts will be issued upon payment settlement.</p>
                <p className="mt-0.5">Shikshantar Academy School ERP System</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: FAMILY CASH COLLECTION MODAL                         */}
      {/* ------------------------------------------------------------- */}
      {showPaymentModal && selectedFamily && paymentBreakdown && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 my-8">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] font-black uppercase text-blue-200 tracking-wider">Cash Collection Counter</span>
                <h3 className="text-lg font-black">{selectedFamily.guardianName}</h3>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success View */}
            {paymentSuccessData ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">Payment Successfully Collected!</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Receipt #{paymentSuccessData.receiptNo} has been generated and verified across all siblings.
                </p>

                <div className="bg-slate-50 p-4 rounded-2xl border text-left text-xs space-y-2">
                  <div className="flex justify-between font-bold">
                    <span>Guardian:</span>
                    <span>{selectedFamily.guardianName}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Cash Received:</span>
                    <span className="text-emerald-600">NRs. {paymentSuccessData.breakdown.cashTendered.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Amount Applied:</span>
                    <span>NRs. {paymentSuccessData.breakdown.amountApplied.toLocaleString()}</span>
                  </div>
                  {paymentSuccessData.breakdown.changeReturned > 0 && (
                    <div className="flex justify-between font-bold text-amber-600">
                      <span>Change Returned:</span>
                      <span>NRs. {paymentSuccessData.breakdown.changeReturned.toLocaleString()}</span>
                    </div>
                  )}
                  {paymentSuccessData.breakdown.advanceCreated > 0 && (
                    <div className="flex justify-between font-bold text-blue-600">
                      <span>Advance Credited:</span>
                      <span>NRs. {paymentSuccessData.breakdown.advanceCreated.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentSuccessData(null);
                  }}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition"
                >
                  Close & Refresh
                </button>
              </div>
            ) : (
              /* Payment Form */
              <div className="p-6 space-y-5">
                {errorMessage && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {errorMessage}
                  </div>
                )}

                {/* Amount Overview Card */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Net Family Payable</span>
                    <span className="text-2xl font-black text-rose-600">
                      NRs. {selectedFamily.totalFamilyPayable.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
                      Physical Cash Tendered (NRs.)
                    </label>
                    <input
                      type="text"
                      placeholder="Enter amount"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Overpayment Options if cash > total due */}
                {paymentBreakdown.isExcess && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-3 animate-in fade-in">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                      <AlertCircle className="w-4 h-4" />
                      <span>Excess Cash Tendered: NRs. {paymentBreakdown.excessAmount.toLocaleString()}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setExcessDecision('RETURN')}
                        className={`p-3 rounded-xl border text-left text-xs font-bold transition ${
                          excessDecision === 'RETURN'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                            : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                        }`}
                      >
                        <p className="text-xs">Option A: Return Change</p>
                        <p className="text-[10px] opacity-80 mt-0.5">Return NRs. {paymentBreakdown.excessAmount} to parent</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExcessDecision('ADVANCE')}
                        className={`p-3 rounded-xl border text-left text-xs font-bold transition ${
                          excessDecision === 'ADVANCE'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-white text-slate-700 border-blue-200 hover:bg-blue-50'
                        }`}
                      >
                        <p className="text-xs">Option B: Credit as Advance</p>
                        <p className="text-[10px] opacity-80 mt-0.5">Hold NRs. {paymentBreakdown.excessAmount} for next billing</p>
                      </button>
                    </div>

                    {excessDecision === 'ADVANCE' && (
                      <div className="pt-2">
                        <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
                          Designate Child for Advance Credit:
                        </label>
                        <select
                          value={advanceDesignatedChildId}
                          onChange={(e) => setAdvanceDesignatedChildId(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                        >
                          {selectedFamily.children.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (Class {c.class} • {c.studentId})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Per-Child Allocation Breakdown */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">Child Allocations</span>
                    <button
                      type="button"
                      onClick={() => setIsCustomMode(!isCustomMode)}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      {isCustomMode ? 'Switch to Auto Waterfall' : 'Customize Allocations'}
                    </button>
                  </div>

                  <div className="space-y-2 border rounded-2xl p-3 border-slate-200 bg-slate-50/50">
                    {paymentBreakdown.allocations.map((alloc) => (
                      <div
                        key={alloc.studentDocId}
                        className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-800">{alloc.studentName} (Class {alloc.class})</p>
                          <p className="text-[10px] text-slate-400 font-mono">Total Due: NRs. {alloc.totalDue.toLocaleString()}</p>
                        </div>

                        <div className="text-right flex items-center gap-3">
                          {isCustomMode ? (
                            <input
                              type="text"
                              placeholder="0"
                              value={customAllocations[alloc.studentDocId] || ''}
                              onChange={(e) =>
                                handleCustomChildAmountChange(alloc.studentDocId, e.target.value.replace(/\D/g, ''))
                              }
                              className="w-24 px-2 py-1 bg-slate-50 border rounded-lg text-right font-black text-xs text-blue-700"
                            />
                          ) : (
                            <span className="font-black text-emerald-600">
                              + NRs. {alloc.allocatedAmount.toLocaleString()}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              alloc.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700'
                                : alloc.status === 'partial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {alloc.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
                    Receipt / Accountant Remarks
                  </label>
                  <input
                    type="text"
                    placeholder="Optional transaction note..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                  />
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleConfirmPayment}
                  disabled={isProcessing || parseIntegerAmount(cashTendered) <= 0}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black rounded-xl text-sm shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
                >
                  <Banknote className="w-5 h-5" />
                  {isProcessing ? 'Processing Transaction...' : `Confirm Cash Collection (NRs. ${parseIntegerAmount(cashTendered).toLocaleString()})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
