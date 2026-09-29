import { db } from '../firebase';
import { 
  doc, 
  runTransaction, 
  getDocs, 
  collection, 
  query, 
  where,
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { getBSYearMonthDate } from './nepaliDate';

export type FinancialDocumentType = 'RMT' | 'RCP' | 'ADV' | 'REF' | 'REV';

export interface DocumentSequenceRecord {
  docType: FinancialDocumentType;
  academicYear: string;
  bsYear: number;
  lastIssuedSequence: number;
  lastAllocatedNumbers?: string[];
  updatedAt?: any;
}

/**
 * Normalizes an academic year identifier or extracts the 4-digit BS year.
 * Examples: '2083-2084 BS' -> '2083', '2083' -> '2083', undefined -> current BS year.
 */
export function extractBSYear(academicYearInput?: string): number {
  if (academicYearInput) {
    const match = String(academicYearInput).match(/\b(20[4-9][0-9])\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return getBSYearMonthDate().year;
}

/**
 * Formats a canonical document number with institutional prefix, BS year, and 6-digit zero-padded sequence.
 * Example: formatDocumentNumber('RMT', 2083, 701) -> 'RMT-2083-000701'
 */
export function formatDocumentNumber(
  docType: FinancialDocumentType,
  bsYear: number,
  sequence: number
): string {
  const paddedSeq = String(sequence).padStart(6, '0');
  return `${docType}-${bsYear}-${paddedSeq}`;
}

/**
 * Parses a document number into its constituent parts.
 * Example: parseDocumentNumber('RMT-2083-000701') -> { docType: 'RMT', bsYear: 2083, sequence: 701 }
 */
export function parseDocumentNumber(documentNo: string): {
  isValid: boolean;
  docType?: FinancialDocumentType;
  bsYear?: number;
  sequence?: number;
} {
  if (!documentNo || typeof documentNo !== 'string') {
    return { isValid: false };
  }

  const parts = documentNo.trim().split('-');
  if (parts.length === 3) {
    const docType = parts[0].toUpperCase() as FinancialDocumentType;
    const bsYear = parseInt(parts[1], 10);
    const sequence = parseInt(parts[2], 10);

    if (['RMT', 'RCP', 'ADV', 'REF', 'REV'].includes(docType) && !isNaN(bsYear) && !isNaN(sequence)) {
      return {
        isValid: true,
        docType,
        bsYear,
        sequence
      };
    }
  }

  return { isValid: false };
}

/**
 * Scans existing Firestore documents to find the highest sequence currently used for an academic year.
 * Used for initial seeding of the sequence counter document.
 */
async function scanHighestExistingSequence(
  docType: FinancialDocumentType,
  bsYear: number
): Promise<number> {
  let highest = 0;

  try {
    if (docType === 'RMT') {
      const snap = await getDocs(collection(db, 'remitBills'));
      snap.forEach(d => {
        const data = d.data();
        const billNo = data.billNo || data.billNumber || '';
        if (typeof billNo === 'string' && billNo.startsWith(`RMT-${bsYear}-`)) {
          const parsed = parseDocumentNumber(billNo);
          if (parsed.isValid && parsed.sequence && parsed.sequence > highest) {
            highest = parsed.sequence;
          } else {
            // Also check non-padded numeric tail if any legacy numbers exist
            const rawSeq = parseInt(billNo.replace(`RMT-${bsYear}-`, ''), 10);
            if (!isNaN(rawSeq) && rawSeq > highest && rawSeq < 1000000) {
              highest = rawSeq;
            }
          }
        }
      });
    } else if (docType === 'RCP') {
      const snap = await getDocs(collection(db, 'transactions'));
      snap.forEach(d => {
        const data = d.data();
        const rNo = data.receiptNo || data.receipt || '';
        if (typeof rNo === 'string' && rNo.startsWith(`RCP-${bsYear}-`)) {
          const parsed = parseDocumentNumber(rNo);
          if (parsed.isValid && parsed.sequence && parsed.sequence > highest) {
            highest = parsed.sequence;
          } else {
            const rawSeq = parseInt(rNo.replace(`RCP-${bsYear}-`, ''), 10);
            if (!isNaN(rawSeq) && rawSeq > highest && rawSeq < 1000000) {
              highest = rawSeq;
            }
          }
        }
      });
    }
  } catch (err) {
    console.warn(`[documentNumberingEngine] Failed to scan existing sequence for ${docType}-${bsYear}:`, err);
  }

  return highest;
}

/**
 * Atomically allocates a batch of N sequential document numbers in Firestore.
 * Concurrency-safe, retry-safe, idempotent, and guarantees numbers are never reused.
 *
 * @param docType - 'RMT' | 'RCP' | 'ADV' | 'REF' | 'REV'
 * @param count - number of sequential numbers to reserve (e.g. 1 for single, 50 for bulk)
 * @param academicYearInput - optional academic year string (defaults to current BS year)
 * @returns Array of formatted document number strings (e.g. ['RMT-2083-000701', 'RMT-2083-000702'])
 */
export async function allocateBatchDocumentNumbers(
  docType: FinancialDocumentType,
  count: number = 1,
  academicYearInput?: string
): Promise<string[]> {
  if (count <= 0) return [];

  const bsYear = extractBSYear(academicYearInput);
  const sequenceDocId = `${docType}_${bsYear}`;
  const sequenceRef = doc(db, 'document_sequences', sequenceDocId);

  const MAX_RETRIES = 12;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      return await runTransaction(db, async (transaction) => {
        const seqSnap = await transaction.get(sequenceRef);

        let currentLastSequence = 0;

        if (seqSnap.exists()) {
          const data = seqSnap.data() as DocumentSequenceRecord;
          currentLastSequence = Number(data.lastIssuedSequence || 0);
        }

        const startSequence = currentLastSequence + 1;
        const endSequence = currentLastSequence + count;

        const allocatedNumbers: string[] = [];
        for (let seq = startSequence; seq <= endSequence; seq++) {
          allocatedNumbers.push(formatDocumentNumber(docType, bsYear, seq));
        }

        transaction.set(sequenceRef, {
          docType,
          academicYear: `${bsYear}-${bsYear + 1} BS`,
          bsYear,
          lastIssuedSequence: endSequence,
          lastAllocatedNumbers: allocatedNumbers.slice(-10), // keep last 10 for quick audit inspection
          updatedAt: serverTimestamp()
        }, { merge: true });

        return allocatedNumbers;
      });
    } catch (err: any) {
      attempt++;
      const isContentionError = 
        err?.code === 'failed-precondition' || 
        err?.code === 'aborted' || 
        err?.code === 'unavailable' ||
        (err?.message && err.message.includes('FAILED_PRECONDITION'));

      if (isContentionError && attempt < MAX_RETRIES) {
        // Exponential backoff with random jitter: (50ms * 2^attempt) + rand(0-100ms)
        const delayMs = Math.min(2500, Math.pow(2, attempt) * 40 + Math.floor(Math.random() * 80));
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Failed to allocate sequential document numbers for ${docType}-${bsYear} after ${MAX_RETRIES} attempts due to high database contention.`);
}

/**
 * Atomically allocates a single sequential document number in Firestore.
 *
 * @param docType - 'RMT' | 'RCP' | 'ADV' | 'REF' | 'REV'
 * @param academicYearInput - optional academic year string
 * @returns Single formatted document number string (e.g. 'RMT-2083-000701')
 */
export async function allocateNextDocumentNumber(
  docType: FinancialDocumentType,
  academicYearInput?: string
): Promise<string> {
  const [allocatedNo] = await allocateBatchDocumentNumbers(docType, 1, academicYearInput);
  return allocatedNo;
}
