import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { formatBSDate } from './nepaliDate';

export interface AuditLogEntry {
    id?: string;
    timestamp: any;
    timestampStr: string;
    date: string;
    dateBS: string;
    transactionId?: string;
    receipt?: string;
    studentId?: string;
    studentName?: string;
    studentClass?: string;
    actionType: 'AMOUNT_MODIFIED' | 'STATUS_REFUNDED' | 'PAYMENT_UNDONE' | 'TRANSACTION_DELETED' | 'MANUAL_OVERRIDE' | 'FEE_ADJUSTED' | 'PAYMENT_ENTRY' | string;
    previousValue: string;
    newValue: string;
    reason: string;
    adminName: string;
    adminEmail?: string;
    adminUid?: string;
    meta?: Record<string, any>;
}

/**
 * Creates an immutable audit log entry in the Firestore `ledger_audit_logs` collection.
 */
export async function recordLedgerAuditLog(data: {
    transactionId?: string;
    receipt?: string;
    studentId?: string;
    studentName?: string;
    studentClass?: string;
    actionType: AuditLogEntry['actionType'];
    previousValue: string;
    newValue: string;
    reason: string;
    adminName?: string;
    adminEmail?: string;
    adminUid?: string;
    meta?: Record<string, any>;
}): Promise<string | null> {
    try {
        const user = auth.currentUser;
        const fallbackAdminName = data.adminName || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Administrator');
        const fallbackEmail = data.adminEmail || user?.email || 'admin@shikshantar.edu.np';
        const fallbackUid = data.adminUid || user?.uid || 'system_admin';

        const now = new Date();
        const dateBS = formatBSDate(now) || '';
        const timestampStr = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

        const logPayload: Omit<AuditLogEntry, 'id'> = {
            timestamp: serverTimestamp(),
            timestampStr,
            date: now.toISOString().split('T')[0],
            dateBS,
            transactionId: data.transactionId || '',
            receipt: data.receipt || 'N/A',
            studentId: data.studentId || '',
            studentName: data.studentName || 'General / Non-Student Ledger',
            studentClass: data.studentClass || '-',
            actionType: data.actionType,
            previousValue: data.previousValue || 'N/A',
            newValue: data.newValue || 'N/A',
            reason: (data.reason || 'Administrative Ledger Modification').trim(),
            adminName: fallbackAdminName,
            adminEmail: fallbackEmail,
            adminUid: fallbackUid,
            meta: data.meta || {}
        };

        const docRef = await addDoc(collection(db, 'ledger_audit_logs'), logPayload);
        return docRef.id;
    } catch (error) {
        console.error('Failed to write to ledger_audit_logs:', error);
        return null;
    }
}
