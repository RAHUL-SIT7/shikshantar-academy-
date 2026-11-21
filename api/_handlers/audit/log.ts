import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { applyCorsAndSecurityHeaders, getVercelAdminDb, verifyVercelCaller } from '../../_lib/auth';

export default async function handler(req: any, res: any) {
  applyCorsAndSecurityHeaders(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyVercelCaller(req, res);
    if (!caller) return;
    if (caller.role !== 'admin' && caller.role !== 'teacher') {
      return res.status(403).json({ error: 'Forbidden: Audit log creation is restricted to Administrators and Teachers.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const actionType = String(body.actionType || body.action || '').trim();
    const reason = String(body.reason || '').trim();
    if (!actionType || !reason) {
      return res.status(400).json({ error: 'Missing required actionType or reason for audit log.' });
    }

    const db = getVercelAdminDb();
    const now = new Date();
    const timestampIso = now.toISOString();
    const opId = String(body.operationId || body.correlationId || `OP_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`).replace(/[^a-zA-Z0-9_.-]/g, '_');

    const actorName = caller.userData?.fullName || caller.userData?.name || caller.email.split('@')[0] || 'User';
    const entry = {
      id: opId,
      auditLogId: opId,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      timestampStr: `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
      date: timestampIso.split('T')[0],
      dateBS: String(body.dateBS || ''),
      category: String(body.category || 'system'),
      action: String(body.action || actionType),
      actionType,
      targetType: String(body.targetType || 'system'),
      targetId: String(body.targetId || ''),
      transactionId: String(body.transactionId || ''),
      receipt: String(body.receipt || 'N/A'),
      receiptNo: String(body.receiptNo || body.receipt || 'N/A'),
      paymentGroupId: String(body.paymentGroupId || ''),
      studentId: String(body.studentId || ''),
      studentUid: String(body.studentUid || ''),
      studentEmis: String(body.studentEmis || ''),
      studentName: String(body.studentName || ''),
      studentClass: String(body.studentClass || '-'),
      academicYear: String(body.academicYear || ''),
      enrollmentId: String(body.enrollmentId || ''),
      beforeState: body.beforeState ?? null,
      afterState: body.afterState ?? null,
      previousValue: String(body.previousValue || 'N/A'),
      newValue: String(body.newValue || 'N/A'),
      reason,
      result: String(body.result || 'SUCCESS'),
      operationId: opId,
      correlationId: String(body.correlationId || opId),
      actorUid: caller.uid,
      adminUid: caller.uid,
      actorName,
      adminName: actorName,
      actorEmail: caller.email,
      adminEmail: caller.email,
      actorRole: caller.role,
      adminTier: caller.adminTier,
      meta: typeof body.meta === 'object' && body.meta ? body.meta : {}
    };

    await db.collection('audit_logs').doc(opId).set(entry, { merge: true });
    if (body.includeLedger === true && caller.role === 'admin') {
      await db.collection('ledger_audit_logs').doc(opId).set(entry, { merge: true });
    }

    return res.status(200).json({ success: true, auditLogId: opId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to record authoritative audit log.' });
  }
}
