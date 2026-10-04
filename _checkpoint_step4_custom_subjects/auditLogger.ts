import { db, auth } from '../firebase';
import { 
    collection, 
    serverTimestamp, 
    doc, 
    getDoc, 
    setDoc, 
    Transaction, 
    WriteBatch 
} from 'firebase/firestore';
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
    actionType: 'AMOUNT_MODIFIED' | 'STATUS_REFUNDED' | 'PAYMENT_UNDONE' | 'TRANSACTION_DELETED' | 'MANUAL_OVERRIDE' | 'FEE_ADJUSTED' | 'PAYMENT_ENTRY' | 'USER_APPROVED' | 'ROLE_CHANGED' | 'ADMIN_TIER_CHANGED' | 'USER_DELETED' | 'USER_DELETION_REQUESTED' | 'USER_AUTH_DELETE_FAILED' | 'USER_DELETION_FINALIZED' | 'USER_PROFILE_UPDATED' | 'BILL_GENERATED' | 'BILL_VOIDED' | 'EXAM_PUBLISHED' | 'MARK_MODIFIED' | 'RESULT_EDITED' | 'MARK_ENTRY' | 'RESULTS_SAVED' | 'SETTINGS_CHANGED' | 'TEST_TRANSACTION_PURGED' | 'EXCESS_APPROVED_ADVANCE' | 'EXCESS_APPROVED_RETURN' | 'REMARKS_MODIFIED' | 'LEDGER_RECONCILIATION_REPAIR' | string;
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
    // Client hints (will NOT override authenticated user UID or role/tier)
    adminName?: string;
    adminEmail?: string;
    adminUid?: string;
    adminTier?: 'primary' | 'secondary' | string;
    meta?: Record<string, any>;
}

/**
 * Resolves authoritative actor identity exclusively from Firebase Auth and Firestore users/{uid}.
 * Never relies on client-controlled localStorage or arbitrary caller-provided role/tier.
 * Fails closed if Firestore profile is inaccessible or unverified.
 */
export async function getAuthoritativeActor() {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('UNAUTHENTICATED: An active authenticated session is required to perform security-sensitive or audited actions.');
    }

    const userDocRef = doc(db, 'users', user.uid);
    let userSnap;
    try {
        userSnap = await getDoc(userDocRef);
    } catch (err: any) {
        throw new Error(`AUTHORIZATION_ERROR: Authoritative security identity could not be verified from Firestore (${err?.message || 'Database inaccessible'}). Operation aborted.`);
    }

    if (!userSnap || !userSnap.exists()) {
        throw new Error(`AUTHORIZATION_DENIED: User profile record for ${user.uid} does not exist in authoritative users registry.`);
    }

    const uData = userSnap.data();
    if (uData.deleted === true || uData.status === 'DELETED' || uData.status === 'AUTH_DELETED_PENDING_FINALIZATION' || uData.status === 'DELETION_PENDING') {
        throw new Error(`AUTHORIZATION_DENIED: User account ${user.uid} is inactive, tombstoned, or pending deletion.`);
    }

    const actorRole = uData.role;
    if (!actorRole) {
        throw new Error('AUTHORIZATION_DENIED: User record lacks an authoritative role.');
    }

    const adminTier: 'primary' | 'secondary' | string = uData.adminTier || (actorRole === 'admin' ? 'primary' : '');
    const actorName = uData.fullName || uData.name || user.displayName || (user.email ? user.email.split('@')[0] : 'Administrator');

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
 * Overwrites client-supplied role/tier/UID with authoritative authenticated values.
 */
export async function buildAuthoritativeAuditPayload(data: AuditLogInput, customAuditId?: string): Promise<AuditLogEntry> {
    const actor = await getAuthoritativeActor();
    const now = new Date();
    const dateBS = formatBSDate(now) || '';
    const timestampStr = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    const opId = data.operationId || data.correlationId || customAuditId || `OP_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const auditDocId = customAuditId || opId;

    const prevStr = data.previousValue || (data.beforeState !== undefined ? (typeof data.beforeState === 'object' ? JSON.stringify(data.beforeState) : String(data.beforeState)) : 'N/A');
    const newStr = data.newValue || (data.afterState !== undefined ? (typeof data.afterState === 'object' ? JSON.stringify(data.afterState) : String(data.afterState)) : 'N/A');

    const resolvedCategory = data.category || (data.transactionId || data.receipt || data.receiptNo || data.paymentGroupId ? 'financial' : 'system');
    const resolvedAction = data.action || data.actionType;

    return {
        id: auditDocId,
        auditLogId: auditDocId,
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
        // Authoritative actor identity derived directly from authenticated account and Firestore users profile
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
 * Uses deterministic document ID derived from operationId to guarantee idempotency across retries.
 */
export async function recordAuditLog(data: AuditLogInput): Promise<string | null> {
    try {
        const payload = await buildAuthoritativeAuditPayload(data);
        const docId = payload.id || payload.operationId || `OP_${Date.now()}`;
        const docRef = doc(db, 'audit_logs', docId);
        await setDoc(docRef, payload, { merge: true });
        return docId;
    } catch (error) {
        console.error('Failed to write to audit_logs:', error);
        return null;
    }
}

/**
 * Creates an immutable audit log entry in the Firestore `ledger_audit_logs` collection,
 * and mirrors it to `audit_logs` for comprehensive administrative visibility.
 * Uses deterministic document ID derived from operationId for idempotency.
 */
export async function recordLedgerAuditLog(data: AuditLogInput): Promise<string | null> {
    try {
        const payload = await buildAuthoritativeAuditPayload({
            ...data,
            category: data.category || 'financial'
        });

        const docId = payload.id || payload.operationId || `OP_LEDGER_${Date.now()}`;
        const docRef = doc(db, 'ledger_audit_logs', docId);
        await setDoc(docRef, payload, { merge: true });
        
        // Also mirror to audit_logs for unified administrative transparency
        try {
            await setDoc(doc(db, 'audit_logs', docId), payload, { merge: true });
        } catch (mirrorErr) {
            console.warn('Could not mirror to audit_logs:', mirrorErr);
        }

        return docId;
    } catch (error) {
        console.error('Failed to write to ledger_audit_logs:', error);
        return null;
    }
}

/**
 * Binds an audit log write to an existing Firestore Transaction.
 */
export async function recordTransactionalAuditLog(
    transaction: Transaction,
    data: AuditLogInput,
    collections: ('audit_logs' | 'ledger_audit_logs')[] = ['audit_logs']
): Promise<string> {
    const payload = await buildAuthoritativeAuditPayload(data);
    const docId = payload.id || payload.operationId || `OP_${Date.now()}`;
    
    for (const col of collections) {
        const docRef = doc(db, col, docId);
        transaction.set(docRef, payload, { merge: true });
    }
    return docId;
}

/**
 * Binds an audit log write to an existing Firestore WriteBatch.
 */
export async function recordBatchAuditLog(
    batch: WriteBatch,
    data: AuditLogInput,
    collections: ('audit_logs' | 'ledger_audit_logs')[] = ['audit_logs']
): Promise<string> {
    const payload = await buildAuthoritativeAuditPayload(data);
    const docId = payload.id || payload.operationId || `OP_${Date.now()}`;
    
    for (const col of collections) {
        const docRef = doc(db, col, docId);
        batch.set(docRef, payload, { merge: true });
    }
    return docId;
}
