import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { formatBSDate, getBSYearMonthDate } from './nepaliDate';

export interface AuditLogEntry {
    id?: string;
    auditLogId?: string;
    timestamp: any;
    timestampStr: string;
    createdAt?: any;
    date: string;
    dateBS: string;
    category?: 'financial' | 'system' | 'security' | 'academic' | string;
    action?: string;
    actionType: 'AMOUNT_MODIFIED' | 'STATUS_REFUNDED' | 'PAYMENT_UNDONE' | 'TRANSACTION_DELETED' | 'MANUAL_OVERRIDE' | 'FEE_ADJUSTED' | 'PAYMENT_ENTRY' | 'USER_APPROVED' | 'ROLE_CHANGED' | 'ADMIN_TIER_CHANGED' | 'USER_DELETED' | 'USER_PROFILE_UPDATED' | 'BILL_GENERATED' | 'BILL_VOIDED' | 'EXAM_PUBLISHED' | 'SETTINGS_CHANGED' | string;
    targetType?: string;
    targetId?: string;
    transactionId?: string;
    receipt?: string;
    receiptNo?: string;
    paymentGroupId?: string;
    studentId?: string;
    studentUid?: string;
    studentEmis?: string;
    studentName?: string;
    studentClass?: string;
    academicYear?: string;
    enrollmentId?: string;
    beforeState?: any;
    afterState?: any;
    previousValue: string;
    newValue: string;
    reason: string;
    result?: 'SUCCESS' | 'REJECTED' | 'ABORTED' | 'FAILED' | string;
    operationId?: string;
    correlationId?: string;
    actorUid: string;
    adminUid: string;
    actorName: string;
    adminName: string;
    actorRole: string;
    adminTier?: 'primary' | 'secondary' | string;
    meta?: Record<string, any>;
}

export interface AuditLogInput {
    category?: 'financial' | 'system' | 'security' | 'academic' | string;
    action?: string;
    actionType: AuditLogEntry['actionType'];
    targetType?: string;
    targetId?: string;
    transactionId?: string;
    receipt?: string;
    receiptNo?: string;
    paymentGroupId?: string;
    studentId?: string;
    studentUid?: string;
    studentEmis?: string;
    studentName?: string;
    studentClass?: string;
    academicYear?: string;
    enrollmentId?: string;
    beforeState?: any;
    afterState?: any;
    previousValue?: string;
    newValue?: string;
    reason: string;
    result?: 'SUCCESS' | 'REJECTED' | 'ABORTED' | 'FAILED' | string;
    operationId?: string;
    correlationId?: string;
    // Client hints (will NOT override authenticated user UID)
    adminName?: string;
    adminEmail?: string;
    adminUid?: string;
    adminTier?: 'primary' | 'secondary' | string;
    meta?: Record<string, any>;
}

/**
 * Resolves authoritative actor identity from Firebase Auth and Firestore users/{uid}.
 * Prevents client-side identity spoofing (actorUid, actorName, actorRole, adminTier).
 */
export async function getAuthoritativeActor() {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('UNAUTHENTICATED: An active authenticated session is required to perform audited actions.');
    }

    let actorRole = 'admin';
    let adminTier = 'primary';
    let actorName = user.displayName || (user.email ? user.email.split('@')[0] : 'Administrator');

    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
            const uData = userSnap.data();
            actorRole = uData.role || 'admin';
            adminTier = uData.adminTier || (actorRole === 'admin' ? 'primary' : '');
            if (uData.fullName || uData.name) {
                actorName = uData.fullName || uData.name;
            }
        }
    } catch (e) {
        console.warn('Could not read authoritative user doc for audit actor:', e);
    }

    return {
        actorUid: user.uid,
        adminUid: user.uid,
        actorEmail: user.email || '',
        adminEmail: user.email || '',
        actorName,
        adminName: actorName,
        actorRole,
        adminTier
    };
}

/**
 * Builds a standardized, authoritative audit log payload with immutable timestamps and identity.
 */
export async function buildAuthoritativeAuditPayload(data: AuditLogInput, customAuditId?: string): Promise<AuditLogEntry> {
    const actor = await getAuthoritativeActor();
    const now = new Date();
    const dateBS = formatBSDate(now) || '';
    const timestampStr = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    const opId = data.operationId || data.correlationId || `OP_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const prevStr = data.previousValue || (data.beforeState !== undefined ? (typeof data.beforeState === 'object' ? JSON.stringify(data.beforeState) : String(data.beforeState)) : 'N/A');
    const newStr = data.newValue || (data.afterState !== undefined ? (typeof data.afterState === 'object' ? JSON.stringify(data.afterState) : String(data.afterState)) : 'N/A');

    const resolvedCategory = data.category || (data.transactionId || data.receipt || data.receiptNo || data.paymentGroupId ? 'financial' : 'system');
    const resolvedAction = data.action || data.actionType;

    return {
        ...(customAuditId ? { id: customAuditId, auditLogId: customAuditId } : {}),
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        timestampStr,
        date: now.toISOString().split('T')[0],
        dateBS,
        category: resolvedCategory,
        action: resolvedAction,
        actionType: data.actionType,
        targetType: data.targetType || (data.transactionId ? 'transaction' : (data.studentId ? 'student' : 'system')),
        targetId: data.targetId || data.transactionId || data.studentId || '',
        transactionId: data.transactionId || '',
        receipt: data.receipt || data.receiptNo || 'N/A',
        receiptNo: data.receiptNo || data.receipt || 'N/A',
        paymentGroupId: data.paymentGroupId || '',
        studentId: data.studentId || data.studentUid || '',
        studentUid: data.studentUid || data.studentId || '',
        studentEmis: data.studentEmis || '',
        studentName: data.studentName || 'System Target',
        studentClass: data.studentClass || '-',
        academicYear: data.academicYear || `${getBSYearMonthDate().year} BS`,
        enrollmentId: data.enrollmentId || '',
        beforeState: data.beforeState !== undefined ? data.beforeState : prevStr,
        afterState: data.afterState !== undefined ? data.afterState : newStr,
        previousValue: prevStr,
        newValue: newStr,
        reason: (data.reason || 'Administrative Action').trim(),
        result: data.result || 'SUCCESS',
        operationId: opId,
        correlationId: data.correlationId || opId,
        // Authoritative actor identity derived directly from authenticated account
        actorUid: actor.actorUid,
        adminUid: actor.adminUid,
        actorName: actor.actorName,
        adminName: actor.adminName,
        actorRole: actor.actorRole,
        adminEmail: actor.adminEmail,
        adminTier: actor.adminTier,
        meta: data.meta || {}
    };
}

/**
 * Creates an immutable audit log entry in the Firestore `audit_logs` collection.
 */
export async function recordAuditLog(data: AuditLogInput): Promise<string | null> {
    try {
        const payload = await buildAuthoritativeAuditPayload(data);
        const docRef = await addDoc(collection(db, 'audit_logs'), payload);
        return docRef.id;
    } catch (error) {
        console.error('Failed to write to audit_logs:', error);
        return null;
    }
}

/**
 * Creates an immutable audit log entry in the Firestore `ledger_audit_logs` collection,
 * and mirrors it to `audit_logs` for comprehensive administrative visibility.
 */
export async function recordLedgerAuditLog(data: AuditLogInput): Promise<string | null> {
    try {
        const payload = await buildAuthoritativeAuditPayload({
            ...data,
            category: data.category || 'financial'
        });

        const docRef = await addDoc(collection(db, 'ledger_audit_logs'), payload);
        
        // Also mirror to audit_logs for unified administrative transparency
        try {
            await addDoc(collection(db, 'audit_logs'), payload);
        } catch (mirrorErr) {
            console.warn('Could not mirror to audit_logs:', mirrorErr);
        }

        return docRef.id;
    } catch (error) {
        console.error('Failed to write to ledger_audit_logs:', error);
        return null;
    }
}

