/**
 * Utility for safe Firestore data preparation and object sanitation.
 * Ensures NO `undefined` values ever reach Firestore WriteBatch, setDoc, or updateDoc calls.
 */

/**
 * Recursively removes undefined object properties so Firestore never throws
 * "Unsupported field value: undefined".
 * 
 * Preserves:
 * - Primitives (strings, numbers, booleans)
 * - null (if explicitly used)
 * - Arrays (recursively mapped)
 * - Dates
 * - Special Firestore object instances (FieldValue, Timestamp, DocumentReference)
 * - Completely OMITS keys with undefined values
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return undefined as unknown as T;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data
      .map(item => sanitizeForFirestore(item))
      .filter(item => item !== undefined) as unknown as T;
  }

  // Handle Dates
  if (data instanceof Date) {
    return data;
  }

  // Preserve custom prototype instances (Firestore FieldValue, Timestamp, DocumentReference, etc.)
  const proto = Object.getPrototypeOf(data);
  if (proto && proto.constructor && proto.constructor.name !== 'Object') {
    return data;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      const sanitized = sanitizeForFirestore(value);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
  }

  return result as T;
}

export interface RemitBillValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates critical required financial and metadata fields for a Remit Bill before Firestore commitment.
 */
export function validateRemitBillPayload(payload: Record<string, any>): RemitBillValidationResult {
  const errors: string[] = [];

  if (!payload.billNo || typeof payload.billNo !== 'string' || !payload.billNo.trim()) {
    errors.push('Bill number (billNo) is required.');
  }
  if (!payload.studentId || typeof payload.studentId !== 'string' || !payload.studentId.trim()) {
    errors.push('Student ID (studentId) is required.');
  }
  if (!payload.academicYear || typeof payload.academicYear !== 'string' || !payload.academicYear.trim()) {
    errors.push('Academic Year is required.');
  }
  if (!payload.billingPeriod || typeof payload.billingPeriod !== 'string' || !payload.billingPeriod.trim()) {
    errors.push('Billing period is required.');
  }
  if (!Array.isArray(payload.coveredMonths) || payload.coveredMonths.length === 0) {
    errors.push('Covered months list cannot be empty.');
  }
  if (!Array.isArray(payload.itemizedCharges) || payload.itemizedCharges.length === 0) {
    errors.push('Itemized charges list cannot be empty.');
  }
  if (typeof payload.totalAmount !== 'number' || isNaN(payload.totalAmount) || payload.totalAmount <= 0) {
    errors.push(`Total amount must be a positive valid number (received: ${payload.totalAmount}).`);
  }
  if (!payload.createdBy || typeof payload.createdBy !== 'string' || !payload.createdBy.trim()) {
    errors.push('CreatedBy author field is required.');
  }
  if (!payload.status || typeof payload.status !== 'string') {
    errors.push('Status is required.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
