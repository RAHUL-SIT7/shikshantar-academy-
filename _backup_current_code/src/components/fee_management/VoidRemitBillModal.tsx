import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  AlertTriangle, 
  Ban, 
  RotateCcw, 
  X, 
  Check, 
  Loader2, 
  ShieldAlert 
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { doc, updateDoc, collection, query, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { formatBSDate } from '../../lib/nepaliDate';
import { releaseBillUniquenessLocks } from '../../lib/atomicBillingTransactionEngine';

interface VoidRemitBillModalProps {
  bill: any | null;
  onClose: () => void;
  onSuccess: (voidedBillId: string, shouldReissue: boolean) => void;
  operatorName: string;
}

export default function VoidRemitBillModal({
  bill,
  onClose,
  onSuccess,
  operatorName
}: VoidRemitBillModalProps) {
  const [voidReasonCategory, setVoidReasonCategory] = useState('Wrong fee structure or rate applied');
  const [customExplanation, setCustomExplanation] = useState('');
  const [confirmedAgreement, setConfirmedAgreement] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!bill) return null;

  const fullVoidReason = customExplanation.trim() 
    ? `${voidReasonCategory}: ${customExplanation.trim()}`
    : voidReasonCategory;

  const handleExecuteVoid = async (shouldReissue: boolean) => {
    if (!confirmedAgreement) {
      setErrorMsg('Please confirm the verification checkbox to proceed.');
      return;
    }

    setProcessing(true);
    setErrorMsg('');

    try {
      const batch = writeBatch(db);
      const bsDate = formatBSDate(new Date());

      // 1. Mark the bill document as VOID
      const billRef = doc(db, 'remitBills', bill.id);
      batch.update(billRef, {
        status: 'void',
        voidReason: fullVoidReason,
        voidedAt: bsDate,
        voidedBy: operatorName || 'Authorized Accountant',
        updatedAt: serverTimestamp()
      });

      // 2. Query and update associated studentFees records to release the months
      const feeQuery = query(collection(db, 'studentFees'), where('remitBillId', '==', bill.id));
      const feeSnap = await getDocs(feeQuery);
      feeSnap.forEach(fDoc => {
        batch.update(fDoc.ref, {
          status: 'void',
          voidReason: fullVoidReason,
          voidedAt: bsDate,
          voidedBy: operatorName || 'Authorized Accountant'
        });
      });

      // 3. Query and update associated billItems collection records to release months
      try {
        const itemQuery = query(collection(db, 'billItems'), where('remitBillId', '==', bill.id));
        const itemSnap = await getDocs(itemQuery);
        itemSnap.forEach(iDoc => {
          batch.update(iDoc.ref, {
            status: 'void',
            voidReason: fullVoidReason,
            voidedAt: bsDate,
            voidedBy: operatorName || 'Authorized Accountant'
          });
        });
      } catch (itemErr) {
        console.warn('Could not query billItems for voiding:', itemErr);
      }

      // 4. If there was a linked cash payment or transaction, record void audit
      if (bill.transactionId) {
        const txQuery = query(collection(db, 'transactions'), where('receipt', '==', bill.transactionId));
        const txSnap = await getDocs(txQuery);
        txSnap.forEach(tDoc => {
          batch.update(tDoc.ref, {
            status: 'VOIDED',
            voidReason: fullVoidReason,
            voidedAt: bsDate,
            voidedBy: operatorName || 'Authorized Accountant'
          });
        });
      }

      await batch.commit();

      // Release mutual-exclusion atomic uniqueness locks so months/fees can be reissued
      try {
        await releaseBillUniquenessLocks(db, bill);
      } catch (lockErr) {
        console.warn('Non-fatal: could not release uniqueness locks upon void:', lockErr);
      }

      onSuccess(bill.id, shouldReissue);
      onClose();
    } catch (err: any) {
      console.error('Error executing bill void:', err);
      handleFirestoreError(err, OperationType.WRITE, 'remitBills');
      setErrorMsg(err.message || 'Failed to void bill. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-red-100 space-y-5 animate-in zoom-in-95 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">
              Authorized Bill Void & Reissue
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Strict audit trail. Voiding releases the covered months for re-issuance.
            </p>
          </div>
        </div>

        {/* Bill Summary Card */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Bill Serial:</span>
            <span className="font-mono font-black text-[#1B4F72]">{bill.billNo}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Student & Class:</span>
            <span className="font-bold text-slate-800">{bill.studentName} (Class {bill.class})</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Billing Period:</span>
            <span className="font-bold text-slate-700">{bill.billingPeriod}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <span className="text-[10px] font-black uppercase text-slate-500">Bill Amount:</span>
            <span className="font-black text-slate-900 text-sm">NRs. {Number(bill?.totalAmount || 0).toLocaleString()}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Reason Fields */}
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Reason for Voiding *
            </label>
            <select
              value={voidReasonCategory}
              onChange={e => setVoidReasonCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-[#1B4F72]"
            >
              <option value="Wrong fee structure or rate applied">Wrong fee structure or rate applied</option>
              <option value="Incorrect scholarship / concession deduction">Incorrect scholarship / concession deduction</option>
              <option value="Duplicate bill generated in error">Duplicate bill generated in error</option>
              <option value="Wrong billing months selected">Wrong billing months selected</option>
              <option value="Student section / class reassigned">Student section / class reassigned</option>
              <option value="Student transferred or withdrawn">Student transferred or withdrawn</option>
              <option value="Clerical or administrative correction">Clerical or administrative correction</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Additional Audit Notes / Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={customExplanation}
              onChange={e => setCustomExplanation(e.target.value)}
              placeholder="e.g. Correcting missing 15% scholarship deduction as per Principal authorization"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-[#1B4F72]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Authorized By
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={operatorName || 'Authorized Accountant'}
              className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 cursor-not-allowed"
            />
          </div>

          <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedAgreement}
              onChange={e => setConfirmedAgreement(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer"
            />
            <span className="text-[11px] text-slate-600 font-semibold leading-relaxed">
              I verify that voiding this bill marks it permanently as <strong>VOID</strong> in institutional audit history and releases these Nepali months for clean re-generation.
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold uppercase tracking-wider rounded-xl text-xs transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={processing || !confirmedAgreement}
            onClick={() => handleExecuteVoid(false)}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold uppercase tracking-wider rounded-xl text-xs transition shadow-md shadow-rose-500/20 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            Confirm Void Only
          </button>

          <button
            type="button"
            disabled={processing || !confirmedAgreement}
            onClick={() => handleExecuteVoid(true)}
            className="flex-1 py-3 bg-[#1B4F72] hover:bg-[#143c57] text-white font-bold uppercase tracking-wider rounded-xl text-xs transition shadow-md shadow-slate-300 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Void & Reissue
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
