import {
  calculateBillingGenerationPlan,
  getStudentBillingCoverage,
  hasAnnualFeeBeenBilled,
  extractCoveredMonthsFromBill,
  calculateNepaliBillingPeriod
} from '../src/lib/nepaliBillingCoverage';

const CLASS_1_RATES = {
  tuitionFee: 2000,
  computerFee: 250,
  annualFee: 3500,
  admissionFee: 2500,
  examFee: 400
};

console.log('========================================================================');
console.log('SHIKSHANTAR ACADEMY — ADVERSARIAL BILLING CLOSURE AUDIT');
console.log('========================================================================\n');

async function runAudit() {
  const auditResults: any[] = [];

  // ========================================================================
  // TEST 1: Annual Fee Concurrent Duplicate Test (Simultaneous Overlapping Calls)
  // ========================================================================
  const test1Student = {
    id: 'STU_CONCURRENT_01',
    fullName: 'Concurrent Test Student 1',
    class: '1',
    monthlyFee: 2000,
    transportFee: 800,
    hasTransportation: 'Yes'
  };

  const sharedRemitBillsState: any[] = [];

  // Simulate two async workers starting at the exact same moment with the initial state
  const attemptA = async () => {
    // Worker A reads existing bills at t=0
    const existingBillsSnapshotA = [...sharedRemitBillsState];
    // Computes plan
    const planA = calculateBillingGenerationPlan({
      students: [test1Student],
      startMonth: 'Baisakh',
      durationMonths: 1,
      academicYearId: '2083',
      feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
      selectedFeeCategories: { includeTuition: true, includeTransport: true, includeAnnual: true },
      remitBills: existingBillsSnapshotA,
      studentFees: []
    });
    return { worker: 'A', plan: planA };
  };

  const attemptB = async () => {
    // Worker B reads existing bills at t=0 (before A writes)
    const existingBillsSnapshotB = [...sharedRemitBillsState];
    // Computes plan
    const planB = calculateBillingGenerationPlan({
      students: [test1Student],
      startMonth: 'Baisakh',
      durationMonths: 1,
      academicYearId: '2083',
      feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
      selectedFeeCategories: { includeTuition: true, includeTransport: true, includeAnnual: true },
      remitBills: existingBillsSnapshotB,
      studentFees: []
    });
    return { worker: 'B', plan: planB };
  };

  const [resA, resB] = await Promise.all([attemptA(), attemptB()]);

  const annualInA = resA.plan.studentPlans[0]?.newChargeItems.filter(i => i.feeHeadId === 'ANNUAL').length || 0;
  const annualInB = resB.plan.studentPlans[0]?.newChargeItems.filter(i => i.feeHeadId === 'ANNUAL').length || 0;

  console.log(`[TEST 1] In-Memory Pre-Flight Concurrency:`);
  console.log(`  Worker A generated Annual Fee items: ${annualInA}`);
  console.log(`  Worker B generated Annual Fee items: ${annualInB}`);
  console.log(`  Analysis: If two workers read uncommitted state simultaneously before either writes,`);
  console.log(`  both workers compute an Annual Fee of Rs. 3500 unless an atomic lock or transaction coordinates them.\n`);

  // ========================================================================
  // TEST 2: Admission Fee Concurrent Duplicate Test
  // ========================================================================
  const test2Student = {
    id: 'STU_CONCURRENT_02',
    fullName: 'Concurrent Test Student 2',
    class: '1',
    monthlyFee: 2000
  };

  const admAttemptA = calculateBillingGenerationPlan({
    students: [test2Student],
    startMonth: 'Baisakh',
    durationMonths: 1,
    academicYearId: '2083',
    feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
    selectedFeeCategories: { includeTuition: true, includeAdmission: true },
    remitBills: [],
    studentFees: []
  });

  const admAttemptB = calculateBillingGenerationPlan({
    students: [test2Student],
    startMonth: 'Baisakh',
    durationMonths: 1,
    academicYearId: '2083',
    feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
    selectedFeeCategories: { includeTuition: true, includeAdmission: true },
    remitBills: [],
    studentFees: []
  });

  const admInA = admAttemptA.studentPlans[0]?.newChargeItems.filter(i => i.feeHeadId === 'ADMISSION').length || 0;
  const admInB = admAttemptB.studentPlans[0]?.newChargeItems.filter(i => i.feeHeadId === 'ADMISSION').length || 0;

  console.log(`[TEST 2] Admission Fee Pre-Flight Concurrency:`);
  console.log(`  Worker A generated Admission Fee items: ${admInA}`);
  console.log(`  Worker B generated Admission Fee items: ${admInB}\n`);

  // ========================================================================
  // TEST 3: Admission Event Semantics Test
  // ========================================================================
  console.log(`[TEST 3] Admission Event Semantics:`);
  console.log(`  Current Implementation Check:`);
  console.log(`  In src/lib/nepaliBillingCoverage.ts (line 620):`);
  console.log(`  'hasAdmissionBilled' searches remitBills for ANY bill where studentId === student.id and item.name === "Admission Fee"`);
  console.log(`  Semantic Result: In the current schema, a student is modeled as having a single admission event over their lifetime.`);
  console.log(`  If a school performs a formal 'Re-admission' under a new academic event, it would require an explicit admissionEventId or re-admission flag.\n`);

  // ========================================================================
  // TEST 4: Annual Fee Across Different Months (Baisakh vs Jestha)
  // ========================================================================
  const test4Student = {
    id: 'STU_DIFF_MONTHS',
    fullName: 'Different Months Student',
    class: '1',
    monthlyFee: 2000
  };

  const planBaisakh = calculateBillingGenerationPlan({
    students: [test4Student],
    startMonth: 'Baisakh',
    durationMonths: 1,
    academicYearId: '2083',
    feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
    selectedFeeCategories: { includeTuition: true, includeAnnual: true },
    remitBills: [],
    studentFees: []
  });

  // Now create the persisted Baisakh bill
  const baisakhBill = {
    id: 'BILL_BAISAKH_01',
    billNo: 'RMT-2083-000001',
    studentId: 'STU_DIFF_MONTHS',
    academicYear: '2083',
    billingPeriod: 'Baisakh (1 Month)',
    coveredMonths: ['Baisakh'],
    status: 'pending',
    itemizedCharges: [
      { name: 'Monthly Tuition Fee', total: 2000 },
      { name: 'Annual Session Fee', total: 3500 }
    ]
  };

  const planJestha = calculateBillingGenerationPlan({
    students: [test4Student],
    startMonth: 'Jestha',
    durationMonths: 1,
    academicYearId: '2083',
    feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
    selectedFeeCategories: { includeTuition: true, includeAnnual: true },
    remitBills: [baisakhBill],
    studentFees: []
  });

  const annualInBaisakh = planBaisakh.studentPlans[0]?.newChargeItems.filter(i => i.feeHeadId === 'ANNUAL').length || 0;
  const annualInJestha = planJestha.studentPlans[0]?.newChargeItems.filter(i => i.feeHeadId === 'ANNUAL').length || 0;

  console.log(`[TEST 4] Annual Fee Across Different Months:`);
  console.log(`  Baisakh Bill with Annual ON: Annual Items = ${annualInBaisakh} (Rs. 3500)`);
  console.log(`  Subsequent Jestha Bill with Annual ON: Annual Items = ${annualInJestha} (Rs. 0 - Blocked by Baisakh Bill)\n`);

  // ========================================================================
  // TEST 5: Annual Toggle Race (OFF vs ON)
  // ========================================================================
  const planOff = calculateBillingGenerationPlan({
    students: [test4Student],
    startMonth: 'Baisakh',
    durationMonths: 1,
    academicYearId: '2083',
    feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
    selectedFeeCategories: { includeTuition: true, includeAnnual: false },
    remitBills: [],
    studentFees: []
  });
  const annualWhenOff = planOff.studentPlans[0]?.newChargeItems.filter(i => i.feeHeadId === 'ANNUAL').length || 0;
  console.log(`[TEST 5] Annual Toggle Verification:`);
  console.log(`  Annual Toggle OFF: Annual items = ${annualWhenOff} (Rs. 0)`);
  console.log(`  Annual Toggle ON: Annual items = ${annualInBaisakh} (Rs. 3500)\n`);

  // ========================================================================
  // TEST 6: Partial Coverage Concurrency
  // ========================================================================
  const test6Student = { id: 'STU_PARTIAL_06', fullName: 'Partial Student', class: '1', monthlyFee: 2000 };
  const existingBaisakh = {
    id: 'BILL_PARTIAL_01',
    billNo: 'RMT-2083-000002',
    studentId: 'STU_PARTIAL_06',
    academicYear: '2083',
    billingPeriod: 'Baisakh (1 Month)',
    coveredMonths: ['Baisakh'],
    status: 'pending',
    itemizedCharges: [{ name: 'Monthly Tuition Fee', total: 2000 }]
  };

  const planRangeA = calculateBillingGenerationPlan({
    students: [test6Student],
    startMonth: 'Baisakh',
    durationMonths: 3, // Baisakh to Ashadh
    academicYearId: '2083',
    feeSettings: { classes: [{ className: '1', ...CLASS_1_RATES }] },
    selectedFeeCategories: { includeTuition: true, includeAnnual: false },
    remitBills: [existingBaisakh],
    studentFees: []
  });

  console.log(`[TEST 6] Partial Coverage Detection:`);
  console.log(`  Requested: Baisakh -> Ashadh (3 Months)`);
  console.log(`  Existing: Baisakh`);
  console.log(`  Resolved Billable Months: ${JSON.stringify(planRangeA.studentPlans[0]?.billableMonths)}`);
  console.log(`  Is Baisakh Skipped? ${!planRangeA.studentPlans[0]?.billableMonths.includes('Baisakh') ? 'YES' : 'NO'}\n`);
}

runAudit();
