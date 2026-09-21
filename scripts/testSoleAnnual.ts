import {
  AtomicBillingStudentRequest
} from '../src/lib/atomicBillingTransactionEngine';

// Test: Sole Annual Fee concurrency
const onlyAnnualReq: AtomicBillingStudentRequest = {
  student: { id: 'STU_ONLY_ANNUAL', fullName: 'Sole Annual Student', class: '1' },
  unbilledForStudent: ['Baisakh'],
  mappedNepaliMonthIds: [{ monthName: 'Baisakh', monthId: '01_baisakh', fullKey: '2083_01_baisakh' }],
  itemizedCharges: [
    { name: 'Annual Fee', rate: 3500, total: 3500 }
  ],
  totalAmount: 3500
};

console.log('Testing sole Annual Fee concurrent requests...');
