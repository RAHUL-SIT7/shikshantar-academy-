/**
 * NEPALI CALENDAR BILLING COVERAGE & DUPLICATE PROTECTION ENGINE
 * 
 * Strict month-level accounting sequence for Nepali Academic Years:
 * 1 = Baisakh, 2 = Jestha, 3 = Ashadh, 4 = Shrawan, 5 = Bhadra, 6 = Ashwin,
 * 7 = Kartik, 8 = Mangsir, 9 = Poush, 10 = Magh, 11 = Falgun, 12 = Chaitra.
 * 
 * Core Invariants:
 * 1. A billing duration is merely a container. The actual chargeable unit is
 *    Student + Academic Year + Nepali Month + Fee Head.
 * 2. An unpaid bill is GENERATED_DUE and must NEVER be generated again.
 * 3. Never silently wrap around across the Chaitra (Month 12) academic boundary.
 * 4. Annual & One-Time fees must not be duplicated in multi-month bills.
 * 5. Correction requires an explicit VOID & REISSUE audit trail.
 */

export const NEPALI_MONTH_SEQUENCE = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra'
] as const;

export type NepaliMonth = typeof NEPALI_MONTH_SEQUENCE[number];

/**
 * Normalizes Nepali month names handling common phonetic aliases (e.g. Asar -> Ashadh).
 */
export function normalizeNepaliMonth(m?: string | null): string {
  if (!m) return '';
  const trimmed = m.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'asar' || lower === 'ashad' || lower === 'aashadh' || lower === 'aasar') {
    return 'Ashadh';
  }
  if (lower === 'baishakh' || lower === 'baisak') return 'Baisakh';
  if (lower === 'jyestha' || lower === 'jeth') return 'Jestha';
  if (lower === 'sawan' || lower === 'shrawan' || lower === 'saun') return 'Shrawan';
  if (lower === 'bhadau' || lower === 'bhadau') return 'Bhadra';
  if (lower === 'asoj' || lower === 'aswin') return 'Ashwin';
  if (lower === 'kartik' || lower === 'katik') return 'Kartik';
  if (lower === 'mangshir' || lower === 'mangsir' || lower === 'mangsir') return 'Mangsir';
  if (lower === 'pus' || lower === 'push' || lower === 'poush') return 'Poush';
  if (lower === 'magh') return 'Magh';
  if (lower === 'fagun' || lower === 'phagun' || lower === 'falgun') return 'Falgun';
  if (lower === 'chait' || lower === 'chaitra') return 'Chaitra';

  const match = NEPALI_MONTH_SEQUENCE.find(nm => nm.toLowerCase() === lower);
  return match || trimmed;
}

/**
 * Returns the 0-based index of a Nepali month (0 = Baisakh, 11 = Chaitra). Returns -1 if invalid.
 */
export function getNepaliMonthIndex(monthName?: string | null): number {
  const norm = normalizeNepaliMonth(monthName);
  return NEPALI_MONTH_SEQUENCE.indexOf(norm as NepaliMonth);
}

export interface BillingPeriodCalculation {
  targetMonths: string[];
  endMonth: string;
  isExceedingYear: boolean;
  remainingMonthsCount: number;
  exceededByCount: number;
  periodText: string;
  validationMessage?: string;
}

/**
 * Calculates the exact sequence of consecutive Nepali months for a given start month and duration.
 * Strictly enforces academic year boundary (stops at Month 12: Chaitra) without silent wrap-around.
 */
export function calculateNepaliBillingPeriod(
  startMonth?: string | null,
  durationMonths: number = 3
): BillingPeriodCalculation {
  if (!startMonth) {
    return {
      targetMonths: [],
      endMonth: '',
      isExceedingYear: false,
      remainingMonthsCount: 0,
      exceededByCount: 0,
      periodText: ''
    };
  }

  const normStart = normalizeNepaliMonth(startMonth);
  const startIdx = getNepaliMonthIndex(normStart);

  if (startIdx === -1) {
    return {
      targetMonths: [],
      endMonth: '',
      isExceedingYear: false,
      remainingMonthsCount: 0,
      exceededByCount: 0,
      periodText: ''
    };
  }

  const remainingMonthsCount = 12 - startIdx;
  const isExceedingYear = durationMonths > remainingMonthsCount;
  const exceededByCount = isExceedingYear ? durationMonths - remainingMonthsCount : 0;
  
  // Clamped target months within current academic year
  const effectiveCount = isExceedingYear ? remainingMonthsCount : durationMonths;
  const targetMonths = NEPALI_MONTH_SEQUENCE.slice(startIdx, startIdx + effectiveCount).map(m => m as string);
  const endMonth = targetMonths[targetMonths.length - 1] || normStart;

  let validationMessage: string | undefined;
  if (isExceedingYear) {
    validationMessage = `The selected duration (${durationMonths} months starting ${normStart}) exceeds the remaining ${remainingMonthsCount} month(s) of this academic year (up to Chaitra). Academic year accounting boundary reached: clamped to ${normStart}–${endMonth}. Please generate billing for the next academic year separately.`;
  }

  const periodText = targetMonths.length === 1 
    ? `${targetMonths[0]} (1 Month)`
    : `${targetMonths[0]} to ${endMonth} (${targetMonths.length} Months)`;

  return {
    targetMonths,
    endMonth,
    isExceedingYear,
    remainingMonthsCount,
    exceededByCount,
    periodText,
    validationMessage
  };
}

export interface NepaliMonthIdMapping {
  monthId: string;       // e.g. '01_Baisakh', '02_Jestha'
  monthIndex: number;    // 1 to 12 (1 = Baisakh, 12 = Chaitra)
  monthName: string;     // 'Baisakh'
  academicYear: string;  // e.g. '2083'
  fullKey: string;       // e.g. '2083_01_Baisakh'
  code: string;          // e.g. 'M01', 'M02'
}

/**
 * Maps a requested duration (e.g. 3 months starting Baisakh) to specific Nepali month IDs.
 * Strictly respects Nepali calendar sequence (1 = Baisakh ... 12 = Chaitra)
 * and clamps to the academic year boundary (stops at Chaitra).
 */
export function mapDurationToNepaliMonthIds(
  startMonth?: string | null,
  durationMonths: number = 1,
  academicYear: string = '2083'
): NepaliMonthIdMapping[] {
  const calc = calculateNepaliBillingPeriod(startMonth, durationMonths);
  return calc.targetMonths.map(mName => {
    const idx = getNepaliMonthIndex(mName); // 0-based index
    const monthNum = idx >= 0 ? idx + 1 : 1;
    const padded = monthNum.toString().padStart(2, '0');
    const monthId = `${padded}_${mName}`;
    return {
      monthId,
      monthIndex: monthNum,
      monthName: mName,
      academicYear,
      fullKey: `${academicYear}_${monthId}`,
      code: `M${padded}`
    };
  });
}

export interface SingleChargeItemPlan {
  feeHeadId: string;
  feeHeadName: string;
  monthName: string;
  monthId: string;
  monthIndex: number;
  frequency: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME' | 'SCHEDULED';
  rate: number;
  discount: number;
  finalAmount: number;
  chargeKey: string; // academicYear_studentId_monthId_feeHeadId
}

export interface StudentBillingPlan {
  student: any;
  studentId: string;
  studentName: string;
  studentRoll: string;
  class: string;
  
  // 12-month coverage map for matrix/preview
  monthCoverage: Record<string, MonthCoverageDetail>;
  
  // Specific to requested period
  requestedMonths: string[];
  alreadyCoveredMonths: string[];
  unbilledMonths: string[];
  
  isFullyCovered: boolean;
  isPartiallyCovered: boolean;
  isCompletelyUnbilled: boolean;
  isExcluded: boolean;
  isBillable: boolean; // True if unbilledMonths.length > 0 and not isExcluded and has at least one charge item
  
  // Billable months (missing months only)
  billableMonths: string[];
  billableMonthsCount: number;
  actualBillPeriodText: string;
  actualBillPeriodArrowText?: string;
  
  // New charge items to be generated
  newChargeItems: SingleChargeItemPlan[];
  totalNewAmount: number;
}

export function formatBillingPeriodText(months: string[]): string {
  if (!months || months.length === 0) {
    return 'No New Billable Months';
  }
  if (months.length === 1) {
    return `${months[0]} (1 Month)`;
  }
  return `${months[0]} to ${months[months.length - 1]} (${months.length} Months)`;
}

export function formatPeriodWithArrow(months: string[]): string {
  if (!months || months.length === 0) {
    return 'No New Billable Months';
  }
  if (months.length === 1) {
    return `${months[0]} (1 Month)`;
  }
  return `${months[0]} → ${months[months.length - 1]} (${months.length} Months)`;
}

export interface BillingGenerationPlan {
  academicYearId: string;
  targetClass: string;
  generationMode: 'class' | 'student';
  selectedStudentId?: string;
  requestedDurationMonths: number;
  startMonth: string;
  endMonth: string;
  requestedMonths: string[];
  requestedMonthsCount: number;
  
  // Canonical Bill Heading Period Tag & Period Descriptions
  effectiveBillHeadingPeriodTag: string;
  billableMonths: string[];
  alreadyBilledMonths: string[];
  requestedPeriodText: string;
  requestedPeriodArrowText: string;
  actualBillablePeriodText: string;
  actualBillablePeriodArrowText: string;
  
  // Student plans
  studentPlans: StudentBillingPlan[];
  
  // Overall Summary
  totalSelectedStudents: number;
  billableStudentsCount: number;
  fullyCoveredStudentsCount: number;
  partiallyCoveredStudentsCount: number;
  completelyUnbilledStudentsCount: number;
  manuallyExcludedStudentsCount: number;
  
  totalNewChargeItemsCount: number;
  totalNewAmount: number;
  
  // Month-by-month breakdown
  monthBreakdown: Array<{
    monthName: string;
    monthId: string;
    monthIndex: number;
    billedCount: number;
    unbilledCount: number;
    paidCount: number;
    dueCount: number;
    status: 'ALL_BILLED' | 'SOME_BILLED' | 'NONE_BILLED';
  }>;
  
  // Representative single pupil preview rate for the sandbox card
  sandboxPreview: {
    studentName: string;
    studentClass: string;
    requestedPeriodText: string;
    actualBillablePeriodText: string;
    actualBillableMonthsCount: number;
    items: Array<{
      name: string;
      unitRate: number;
      multiplier: number;
      total: number;
      amount: number;
      frequency: string;
      isDeduction?: boolean;
    }>;
    subtotal: number;
    scholarshipTotal: number;
    totalAmount: number;
  };
  
  // Status and button messaging
  overallStatus: 'NOTHING_NEW_TO_GENERATE' | 'READY_TO_GENERATE_MISSING' | 'READY_TO_GENERATE_ALL' | 'NO_ELIGIBLE_STUDENTS';
  summaryMessage: string;
  buttonLabel: string;
  isGenerationAllowed: boolean;
}

export interface CalculateBillingPlanParams {
  students: any[];
  academicYearId: string;
  targetClass?: string;
  generationMode?: 'class' | 'student';
  selectedStudentId?: string;
  startMonth: string;
  durationMonths: number;
  remitBills: any[];
  studentFees?: any[];
  billItems?: any[];
  excludedStudentIds?: string[];
  feeSettings?: {
    classes?: Array<{
      className: string;
      tuitionFee?: number;
      computerFee?: number;
      annualFee?: number;
      admissionFee?: number;
      examFee?: number;
    }>;
  };
  selectedFeeCategories?: {
    includeTuition?: boolean;
    includeTransport?: boolean;
    includeComputer?: boolean;
    includeAcademy?: boolean;
    includeAnnual?: boolean;
    includeAdmission?: boolean;
    includeExam?: boolean;
    academyFeeRate?: number | string;
    customCharges?: Array<{ id: string; name: string; amount: number; isMonthly: boolean }>;
  };
}

/**
 * AUTHORITATIVE UNIVERSAL BILLING CALCULATION ENGINE
 * 
 * Strict Single Source of Truth for:
 * 1. Generate Remit Bills
 * 2. 12-Month Academic Matrix
 * 3. Billing Coverage Preview Badges
 * 4. Right Sandbox Preview (Accurate multiplier matching actual missing months)
 * 5. Review Pupils Drawer & Generate Button State
 */
export function calculateBillingGenerationPlan(params: CalculateBillingPlanParams): BillingGenerationPlan {
  const {
    students,
    academicYearId,
    targetClass = '',
    generationMode = 'class',
    selectedStudentId = '',
    startMonth,
    durationMonths,
    remitBills,
    studentFees = [],
    billItems = [],
    excludedStudentIds = [],
    feeSettings,
    selectedFeeCategories = { includeTuition: true }
  } = params;

  // 1. Calculate requested Nepali billing period adhering to calendar boundary
  const periodCalc = calculateNepaliBillingPeriod(startMonth, durationMonths);
  const requestedMonths = periodCalc.targetMonths;
  const endMonth = periodCalc.endMonth;

  // 2. Resolve target students
  let targetStudents: any[] = [];
  if (generationMode === 'student' && selectedStudentId) {
    const s = students.find(st => st.id === selectedStudentId);
    if (s) targetStudents = [s];
  } else if (targetClass) {
    targetStudents = students.filter(
      st => (st.class || '').toString().trim().toLowerCase() === targetClass.toString().trim().toLowerCase()
    );
  } else {
    targetStudents = [...students];
  }

  // Helper to get class fee settings
  const getClassFees = (cls: string) => {
    const norm = (cls || '').toString().trim().toLowerCase();
    const found = feeSettings?.classes?.find(
      c => (c.className || '').toString().trim().toLowerCase() === norm
    );
    return {
      tuition: Number(found?.tuitionFee || 0),
      computer: Number(found?.computerFee || 0),
      annual: Number(found?.annualFee || 0),
      admission: Number(found?.admissionFee || 0),
      exam: Number(found?.examFee || 0)
    };
  };

  let fullyCoveredStudentsCount = 0;
  let partiallyCoveredStudentsCount = 0;
  let completelyUnbilledStudentsCount = 0;
  let billableStudentsCount = 0;
  let manuallyExcludedStudentsCount = 0;
  let totalNewChargeItemsCount = 0;
  let totalNewAmount = 0;

  // 3. Process each student independently using the unified canonical getStudentBillingCoverage engine
  const studentPlans: StudentBillingPlan[] = targetStudents.map(student => {
    const isExcluded = excludedStudentIds.includes(student.id);
    if (isExcluded) manuallyExcludedStudentsCount++;

    // Compute authorative 12-month coverage snapshot
    const snapshot = getStudentBillingCoverage(student, academicYearId, remitBills, billItems);
    const rawCoverage = getStudentYearCoverage(student.id, academicYearId, remitBills, studentFees, billItems);

    const classFees = getClassFees(student.class || targetClass);
    const newChargeItems: SingleChargeItemPlan[] = [];

    // Evaluate each requested month individually at the fee-head level
    const monthsWithNewCharges = new Set<string>();
    const monthsFullyCovered = new Set<string>();

    if (!isExcluded) {
      requestedMonths.forEach(mName => {
        const mIdx = getNepaliMonthIndex(mName);
        const mNum = mIdx >= 0 ? mIdx + 1 : 1;
        const mId = `${mNum.toString().padStart(2, '0')}_${mName}`;
        const monthCov = snapshot.monthMap[mName];
        
        let monthHasRequestedCharge = false;
        let monthChargeAdded = false;

        // Monthly Tuition Fee
        if (selectedFeeCategories.includeTuition !== false) {
          const tuitionRate = Number(student.monthlyFee || classFees.tuition || 0);
          if (tuitionRate > 0) {
            monthHasRequestedCharge = true;
            const tuitionAlreadyBilled = monthCov?.feeHeads?.some(
              fh => fh.feeHeadId === 'TUITION' && fh.chargeExists
            );
            if (!tuitionAlreadyBilled) {
              const scholarshipDiscount = (student.scholarshipStatus === 'Provided' || Number(student.scholarshipAmount || 0) > 0)
                ? Math.min(tuitionRate, Number(student.scholarshipAmount || 0))
                : 0;
              const finalAmount = Math.max(0, tuitionRate - scholarshipDiscount);

              newChargeItems.push({
                feeHeadId: 'TUITION',
                feeHeadName: 'Monthly Tuition Fee',
                monthName: mName,
                monthId: mId,
                monthIndex: mNum,
                frequency: 'MONTHLY',
                rate: tuitionRate,
                discount: scholarshipDiscount,
                finalAmount: finalAmount,
                chargeKey: `${academicYearId}_${student.id}_${mId}_TUITION`
              });
              monthChargeAdded = true;
            }
          }
        }

        // Transportation Charges
        if (selectedFeeCategories.includeTransport) {
          const hasTransport =
            student.hasTransportation === 'Yes' ||
            (student.transportRoute && student.transportRoute !== '') ||
            Number(student.transportFee || 0) > 0;

          if (hasTransport) {
            const transportRate = Number(student.transportFee || 0);
            if (transportRate > 0) {
              monthHasRequestedCharge = true;
              const transportAlreadyBilled = monthCov?.feeHeads?.some(
                fh => fh.feeHeadId === 'TRANSPORT' && fh.chargeExists
              );
              if (!transportAlreadyBilled) {
                newChargeItems.push({
                  feeHeadId: 'TRANSPORT',
                  feeHeadName: 'Transportation Charges',
                  monthName: mName,
                  monthId: mId,
                  monthIndex: mNum,
                  frequency: 'MONTHLY',
                  rate: transportRate,
                  discount: 0,
                  finalAmount: transportRate,
                  chargeKey: `${academicYearId}_${student.id}_${mId}_TRANSPORT`
                });
                monthChargeAdded = true;
              }
            }
          }
        }

        // Computer Facility Fee
        if (selectedFeeCategories.includeComputer) {
          const computerRate = Number(classFees.computer || student.computerFee || 0);
          if (computerRate > 0) {
            monthHasRequestedCharge = true;
            const computerAlreadyBilled = monthCov?.feeHeads?.some(
              fh => fh.feeHeadId === 'COMPUTER' && fh.chargeExists
            );
            if (!computerAlreadyBilled) {
              newChargeItems.push({
                feeHeadId: 'COMPUTER',
                feeHeadName: 'Computer Lab Charges',
                monthName: mName,
                monthId: mId,
                monthIndex: mNum,
                frequency: 'MONTHLY',
                rate: computerRate,
                discount: 0,
                finalAmount: computerRate,
                chargeKey: `${academicYearId}_${student.id}_${mId}_COMPUTER`
              });
              monthChargeAdded = true;
            }
          }
        }

        // Academy & Sports Fee
        if (selectedFeeCategories.includeAcademy) {
          const academyRate = Number(selectedFeeCategories.academyFeeRate || student.academyFee || 0);
          if (academyRate > 0) {
            monthHasRequestedCharge = true;
            const academyAlreadyBilled = monthCov?.feeHeads?.some(
              fh => fh.feeHeadId === 'ACADEMY' && fh.chargeExists
            );
            if (!academyAlreadyBilled) {
              newChargeItems.push({
                feeHeadId: 'ACADEMY',
                feeHeadName: 'Academy & Sports Activities',
                monthName: mName,
                monthId: mId,
                monthIndex: mNum,
                frequency: 'MONTHLY',
                rate: academyRate,
                discount: 0,
                finalAmount: academyRate,
                chargeKey: `${academicYearId}_${student.id}_${mId}_ACADEMY`
              });
              monthChargeAdded = true;
            }
          }
        }

        // Custom monthly charges
        if (selectedFeeCategories.customCharges) {
          selectedFeeCategories.customCharges.forEach(c => {
            if (c.isMonthly && Number(c.amount || 0) > 0) {
              monthHasRequestedCharge = true;
              const customId = `CUSTOM_${c.name.replace(/\s+/g, '_').toUpperCase()}`;
              const customAlreadyBilled = monthCov?.feeHeads?.some(
                fh => (fh.feeHeadId === customId || fh.feeHeadName === c.name) && fh.chargeExists
              );
              if (!customAlreadyBilled) {
                newChargeItems.push({
                  feeHeadId: customId,
                  feeHeadName: c.name,
                  monthName: mName,
                  monthId: mId,
                  monthIndex: mNum,
                  frequency: 'MONTHLY',
                  rate: Number(c.amount),
                  discount: 0,
                  finalAmount: Number(c.amount),
                  chargeKey: `${academicYearId}_${student.id}_${mId}_${customId}`
                });
                monthChargeAdded = true;
              }
            }
          });
        }

        if (monthChargeAdded) {
          monthsWithNewCharges.add(mName);
        } else if (monthHasRequestedCharge) {
          monthsFullyCovered.add(mName);
        } else if (monthCov?.isBilled) {
          monthsFullyCovered.add(mName);
        }
      });

      // Annual Fee (Charged ONCE per academic year)
      if (selectedFeeCategories.includeAnnual && classFees.annual > 0) {
        const annualCheck = hasAnnualFeeBeenBilled(student.id, academicYearId, remitBills, studentFees);
        if (!annualCheck.billed) {
          const firstMonth = Array.from(monthsWithNewCharges)[0] || requestedMonths[0] || startMonth;
          newChargeItems.push({
            feeHeadId: 'ANNUAL',
            feeHeadName: 'Annual Fee',
            monthName: firstMonth,
            monthId: `${(getNepaliMonthIndex(firstMonth) + 1).toString().padStart(2, '0')}_${firstMonth}`,
            monthIndex: getNepaliMonthIndex(firstMonth) + 1,
            frequency: 'ANNUAL',
            rate: classFees.annual,
            discount: 0,
            finalAmount: classFees.annual,
            chargeKey: `${academicYearId}_${student.id}_ANNUAL`
          });
          monthsWithNewCharges.add(firstMonth);
        }
      }

      // Admission Fee (Charged ONCE)
      if (selectedFeeCategories.includeAdmission && classFees.admission > 0) {
        const hasAdmissionBilled = remitBills.some(b => {
          if (b.studentId !== student.id || b.status === 'void' || b.status === 'cancelled') return false;
          return Array.isArray(b.itemizedCharges) && b.itemizedCharges.some((it: any) => it.name === 'Admission Fee');
        });
        if (!hasAdmissionBilled) {
          const firstMonth = Array.from(monthsWithNewCharges)[0] || requestedMonths[0] || startMonth;
          newChargeItems.push({
            feeHeadId: 'ADMISSION',
            feeHeadName: 'Admission Fee',
            monthName: firstMonth,
            monthId: `${(getNepaliMonthIndex(firstMonth) + 1).toString().padStart(2, '0')}_${firstMonth}`,
            monthIndex: getNepaliMonthIndex(firstMonth) + 1,
            frequency: 'ONE_TIME',
            rate: classFees.admission,
            discount: 0,
            finalAmount: classFees.admission,
            chargeKey: `${academicYearId}_${student.id}_ADMISSION`
          });
          monthsWithNewCharges.add(firstMonth);
        }
      }

      // Terminal Exam Fee
      if (selectedFeeCategories.includeExam && classFees.exam > 0) {
        const firstMonth = Array.from(monthsWithNewCharges)[0] || requestedMonths[0] || startMonth;
        newChargeItems.push({
          feeHeadId: 'EXAM',
          feeHeadName: 'Terminal Exam Fee',
          monthName: firstMonth,
          monthId: `${(getNepaliMonthIndex(firstMonth) + 1).toString().padStart(2, '0')}_${firstMonth}`,
          monthIndex: getNepaliMonthIndex(firstMonth) + 1,
          frequency: 'SCHEDULED',
          rate: classFees.exam,
          discount: 0,
          finalAmount: classFees.exam,
          chargeKey: `${academicYearId}_${student.id}_EXAM`
        });
        monthsWithNewCharges.add(firstMonth);
      }

      // Custom flat charges
      if (selectedFeeCategories.customCharges) {
        selectedFeeCategories.customCharges.forEach(c => {
          if (!c.isMonthly && Number(c.amount || 0) > 0) {
            const firstMonth = Array.from(monthsWithNewCharges)[0] || requestedMonths[0] || startMonth;
            const customId = `CUSTOM_${c.name.replace(/\s+/g, '_').toUpperCase()}`;
            newChargeItems.push({
              feeHeadId: customId,
              feeHeadName: c.name,
              monthName: firstMonth,
              monthId: `${(getNepaliMonthIndex(firstMonth) + 1).toString().padStart(2, '0')}_${firstMonth}`,
              monthIndex: getNepaliMonthIndex(firstMonth) + 1,
              frequency: 'ONE_TIME',
              rate: Number(c.amount),
              discount: 0,
              finalAmount: Number(c.amount),
              chargeKey: `${academicYearId}_${student.id}_${customId}`
            });
            monthsWithNewCharges.add(firstMonth);
          }
        });
      }
    }

    // Billable months are the requested months that have new charges
    const billableMonths = requestedMonths.filter(m => monthsWithNewCharges.has(m));
    const alreadyCoveredMonths = requestedMonths.filter(m => !monthsWithNewCharges.has(m));
    const unbilledMonths = billableMonths;
    const billableMonthsCount = billableMonths.length;

    const isFullyCovered = requestedMonths.length > 0 && newChargeItems.length === 0 && !isExcluded;
    const isPartiallyCovered = alreadyCoveredMonths.length > 0 && billableMonths.length > 0;
    const isCompletelyUnbilled = requestedMonths.length > 0 && billableMonths.length === requestedMonths.length && alreadyCoveredMonths.length === 0;

    if (isFullyCovered) fullyCoveredStudentsCount++;
    else if (isPartiallyCovered) partiallyCoveredStudentsCount++;
    else if (isCompletelyUnbilled) completelyUnbilledStudentsCount++;

    const studentTotal = newChargeItems.reduce((sum, item) => sum + item.finalAmount, 0);
    const isBillable = !isExcluded && newChargeItems.length > 0;

    if (isBillable) {
      billableStudentsCount++;
      totalNewChargeItemsCount += newChargeItems.length;
      totalNewAmount += studentTotal;
    }

    const actualBillPeriodText = formatBillingPeriodText(billableMonths);
    const actualBillPeriodArrowText = formatPeriodWithArrow(billableMonths);

    return {
      student,
      studentId: student.id,
      studentName: student.fullName || student.name || 'Student',
      studentRoll: student.rollNumber || student.studentId || '',
      class: student.class || targetClass,
      monthCoverage: rawCoverage,
      requestedMonths,
      alreadyCoveredMonths,
      unbilledMonths,
      isFullyCovered,
      isPartiallyCovered,
      isCompletelyUnbilled,
      isExcluded,
      isBillable,
      billableMonths,
      billableMonthsCount,
      actualBillPeriodText,
      actualBillPeriodArrowText,
      newChargeItems,
      totalNewAmount: studentTotal
    };
  });

  // 4. Calculate month-by-month status breakdown across the cohort
  const monthBreakdown = requestedMonths.map(mName => {
    const mIdx = getNepaliMonthIndex(mName);
    const mNum = mIdx >= 0 ? mIdx + 1 : 1;
    const mId = `${mNum.toString().padStart(2, '0')}_${mName}`;

    let billedCount = 0;
    let paidCount = 0;
    let dueCount = 0;

    studentPlans.forEach(sp => {
      const st = sp.monthCoverage[mName]?.status;
      if (st === 'BILLED_PAID' || st === 'PAID') {
        billedCount++;
        paidCount++;
      } else if (
        st === 'BILLED_DUE' ||
        st === 'GENERATED_DUE' ||
        st === 'BILLED_PARTIAL' ||
        st === 'PARTIAL' ||
        st === 'COVERED_BY_ADVANCE'
      ) {
        billedCount++;
        dueCount++;
      }
    });

    const unbilledCount = targetStudents.length - billedCount;
    let status: 'ALL_BILLED' | 'SOME_BILLED' | 'NONE_BILLED' = 'NONE_BILLED';
    if (billedCount === targetStudents.length && targetStudents.length > 0) status = 'ALL_BILLED';
    else if (billedCount > 0) status = 'SOME_BILLED';

    return {
      monthName: mName,
      monthId: mId,
      monthIndex: mNum,
      billedCount,
      unbilledCount,
      paidCount,
      dueCount,
      status
    };
  });

  // 5. Determine Overall Status & Safe Messaging
  let overallStatus: BillingGenerationPlan['overallStatus'] = 'NOTHING_NEW_TO_GENERATE';
  let summaryMessage = '';
  let buttonLabel = '';
  let isGenerationAllowed = false;

  if (targetStudents.length === 0) {
    overallStatus = 'NO_ELIGIBLE_STUDENTS';
    summaryMessage = 'No students found for the selected criteria.';
    buttonLabel = 'No Students Selected';
    isGenerationAllowed = false;
  } else if (billableStudentsCount === 0 || totalNewChargeItemsCount === 0) {
    overallStatus = 'NOTHING_NEW_TO_GENERATE';
    summaryMessage = `All selected ${targetStudents.length} student(s) already have active billing coverage for ${requestedMonths.join(', ')}. Zero duplicate charges created.`;
    buttonLabel = `Nothing New to Generate (0 / ${targetStudents.length} Billable)`;
    isGenerationAllowed = false;
  } else if (partiallyCoveredStudentsCount > 0 || fullyCoveredStudentsCount > 0) {
    overallStatus = 'READY_TO_GENERATE_MISSING';
    summaryMessage = `Ready to generate ${totalNewChargeItemsCount} missing charge items for ${billableStudentsCount} student(s). ${fullyCoveredStudentsCount} fully covered student(s) will be automatically skipped.`;
    buttonLabel = `Generate Missing Charges (${billableStudentsCount} Student${billableStudentsCount > 1 ? 's' : ''})`;
    isGenerationAllowed = true;
  } else {
    overallStatus = 'READY_TO_GENERATE_ALL';
    summaryMessage = `Ready to generate standard remit bills (${totalNewChargeItemsCount} charge items) for all ${billableStudentsCount} student(s) across ${requestedMonths.join(', ')}.`;
    buttonLabel = `Generate Remit Bills (${billableStudentsCount} Student${billableStudentsCount > 1 ? 's' : ''})`;
    isGenerationAllowed = true;
  }

  // 6. Representative Sandbox Preview Card Calculation
  // Find a representative billable student or the first student
  const repStudentPlan = studentPlans.find(sp => sp.isBillable) || studentPlans[0];
  const repStudent = repStudentPlan?.student || targetStudents[0] || {};
  const repClassFees = getClassFees(repStudent.class || targetClass);

  // The sandbox preview multiplier MUST match the actual billable months for that student!
  // If the student has 1 unbilled month (e.g. Shrawan), multiplier is 1x, NOT the requested duration 3x!
  const previewMultiplier = repStudentPlan && repStudentPlan.billableMonthsCount > 0
    ? repStudentPlan.billableMonthsCount
    : (requestedMonths.length > 0 ? requestedMonths.length : 1);

  const previewItems: Array<{
    name: string;
    unitRate: number;
    multiplier: number;
    total: number;
    amount: number;
    frequency: string;
    isDeduction?: boolean;
  }> = [];

  let previewSubtotal = 0;
  let previewScholarshipTotal = 0;

  if (selectedFeeCategories.includeTuition !== false) {
    const rate = Number(repStudent.monthlyFee || repClassFees.tuition || 0);
    if (rate > 0) {
      const tot = rate * previewMultiplier;
      previewItems.push({
        name: `Monthly Tuition Fee (${previewMultiplier}x)`,
        unitRate: rate,
        multiplier: previewMultiplier,
        total: tot,
        amount: tot,
        frequency: 'MONTHLY'
      });
      previewSubtotal += tot;
    }
  }

  if (selectedFeeCategories.includeTransport) {
    const hasTransport =
      repStudent.hasTransportation === 'Yes' ||
      (repStudent.transportRoute && repStudent.transportRoute !== '') ||
      Number(repStudent.transportFee || 0) > 0;
    const rate = hasTransport ? Number(repStudent.transportFee || 400) : 0;
    if (rate > 0) {
      const tot = rate * previewMultiplier;
      previewItems.push({
        name: `Transport Cost (${previewMultiplier}x)`,
        unitRate: rate,
        multiplier: previewMultiplier,
        total: tot,
        amount: tot,
        frequency: 'MONTHLY'
      });
      previewSubtotal += tot;
    }
  }

  if (selectedFeeCategories.includeComputer) {
    const rate = Number(repClassFees.computer || repStudent.computerFee || 0);
    if (rate > 0) {
      const tot = rate * previewMultiplier;
      previewItems.push({
        name: `Computer Lab Charges (${previewMultiplier}x)`,
        unitRate: rate,
        multiplier: previewMultiplier,
        total: tot,
        amount: tot,
        frequency: 'MONTHLY'
      });
      previewSubtotal += tot;
    }
  }

  if (selectedFeeCategories.includeAcademy) {
    const rate = Number(selectedFeeCategories.academyFeeRate || repStudent.academyFee || 0);
    if (rate > 0) {
      const tot = rate * previewMultiplier;
      previewItems.push({
        name: `Academy & Sports Activities (${previewMultiplier}x)`,
        unitRate: rate,
        multiplier: previewMultiplier,
        total: tot,
        amount: tot,
        frequency: 'MONTHLY'
      });
      previewSubtotal += tot;
    }
  }

  if (selectedFeeCategories.includeAnnual && repClassFees.annual > 0) {
    previewItems.push({
      name: 'Annual Fee (Once)',
      unitRate: repClassFees.annual,
      multiplier: 1,
      total: repClassFees.annual,
      amount: repClassFees.annual,
      frequency: 'ANNUAL'
    });
    previewSubtotal += repClassFees.annual;
  }

  if (selectedFeeCategories.includeAdmission && repClassFees.admission > 0) {
    previewItems.push({
      name: 'Admission Fee (Once)',
      unitRate: repClassFees.admission,
      multiplier: 1,
      total: repClassFees.admission,
      amount: repClassFees.admission,
      frequency: 'ONE_TIME'
    });
    previewSubtotal += repClassFees.admission;
  }

  if (selectedFeeCategories.includeExam && repClassFees.exam > 0) {
    previewItems.push({
      name: 'Terminal Exam Fee (Once)',
      unitRate: repClassFees.exam,
      multiplier: 1,
      total: repClassFees.exam,
      amount: repClassFees.exam,
      frequency: 'SCHEDULED'
    });
    previewSubtotal += repClassFees.exam;
  }

  if (repStudent.scholarshipStatus === 'Provided' && Number(repStudent.scholarshipAmount || 0) > 0) {
    const schRate = Number(repStudent.scholarshipAmount);
    const schTot = schRate * previewMultiplier;
    previewScholarshipTotal = schTot;
    previewItems.push({
      name: `Scholarship Deduction (${repStudent.scholarshipCategory || 'Concession'}) (${previewMultiplier}x)`,
      unitRate: schRate,
      multiplier: previewMultiplier,
      total: schTot,
      amount: schTot,
      frequency: 'MONTHLY',
      isDeduction: true
    });
  }

  if (selectedFeeCategories.customCharges) {
    selectedFeeCategories.customCharges.forEach(c => {
      const mult = c.isMonthly ? previewMultiplier : 1;
      const tot = Number(c.amount || 0) * mult;
      if (tot > 0) {
        previewItems.push({
          name: `${c.name} (${c.isMonthly ? `${mult}x` : 'Flat'})`,
          unitRate: Number(c.amount),
          multiplier: mult,
          total: tot,
          amount: tot,
          frequency: c.isMonthly ? 'MONTHLY' : 'ONE_TIME'
        });
        previewSubtotal += tot;
      }
    });
  }

  const previewTotalAmount = Math.max(0, previewSubtotal - previewScholarshipTotal);

  // Calculate cohort/overall Billable and Already Billed Months
  let overallBillableMonths: string[] = [];
  let overallAlreadyBilledMonths: string[] = [];

  if (generationMode === 'student' && repStudentPlan) {
    overallAlreadyBilledMonths = [...repStudentPlan.alreadyCoveredMonths];
    overallBillableMonths = [...repStudentPlan.billableMonths];
  } else {
    overallBillableMonths = requestedMonths.filter(m => {
      const mb = monthBreakdown.find(x => x.monthName === m);
      return mb && mb.unbilledCount > 0;
    });
    overallAlreadyBilledMonths = requestedMonths.filter(m => {
      const mb = monthBreakdown.find(x => x.monthName === m);
      return mb && mb.billedCount > 0;
    });
  }

  const requestedPeriodText = formatBillingPeriodText(requestedMonths);
  const requestedPeriodArrowText = formatPeriodWithArrow(requestedMonths);

  // The Bill Heading Period Tag MUST always be generated from the final BillingGenerationPlan (the actual billable months)
  const effectiveBillHeadingPeriodTag = formatBillingPeriodText(
    repStudentPlan && repStudentPlan.billableMonths.length > 0
      ? repStudentPlan.billableMonths
      : overallBillableMonths
  );
  const actualBillablePeriodText = effectiveBillHeadingPeriodTag;
  const actualBillablePeriodArrowText = formatPeriodWithArrow(
    repStudentPlan && repStudentPlan.billableMonths.length > 0
      ? repStudentPlan.billableMonths
      : overallBillableMonths
  );

  const sandboxPreview = {
    studentName: repStudent.fullName || repStudent.name || (targetClass ? `Standard Pupil of Class ${targetClass}` : 'Selected Pupil'),
    studentClass: repStudent.class || targetClass || 'N/A',
    requestedPeriodText,
    requestedPeriodArrowText,
    actualBillablePeriodText,
    actualBillablePeriodArrowText,
    actualBillableMonthsCount: previewMultiplier,
    items: previewItems,
    subtotal: previewSubtotal,
    scholarshipTotal: previewScholarshipTotal,
    totalAmount: previewTotalAmount
  };

  return {
    academicYearId,
    targetClass,
    generationMode,
    selectedStudentId,
    requestedDurationMonths: durationMonths,
    startMonth,
    endMonth,
    requestedMonths,
    requestedMonthsCount: requestedMonths.length,
    effectiveBillHeadingPeriodTag,
    billableMonths: overallBillableMonths,
    alreadyBilledMonths: overallAlreadyBilledMonths,
    requestedPeriodText,
    requestedPeriodArrowText,
    actualBillablePeriodText,
    actualBillablePeriodArrowText,
    studentPlans,
    totalSelectedStudents: targetStudents.length,
    billableStudentsCount,
    fullyCoveredStudentsCount,
    partiallyCoveredStudentsCount,
    completelyUnbilledStudentsCount,
    manuallyExcludedStudentsCount,
    totalNewChargeItemsCount,
    totalNewAmount,
    monthBreakdown,
    sandboxPreview,
    overallStatus,
    summaryMessage,
    buttonLabel,
    isGenerationAllowed
  };
}

export type MonthBillingStatus = 
  | 'NOT_APPLICABLE'
  | 'NOT_GENERATED'    // Month is unbilled
  | 'BILLED_DUE'       // Bill generated, unpaid (DUPLICATE BLOCKED)
  | 'BILLED_PARTIAL'   // Bill partially paid (DUPLICATE BLOCKED)
  | 'BILLED_PAID'      // Bill fully deposited (DUPLICATE BLOCKED)
  | 'COVERED_BY_ADVANCE'
  | 'VOIDED'           // Voided / Cancelled (released for authorized reissue)
  | 'CANCELLED'
  | 'GENERATED_DUE'    // Legacy alias
  | 'PARTIAL'          // Legacy alias
  | 'PAID'             // Legacy alias
  | 'VOID';            // Legacy alias

export interface FinancialChargeItem {
  chargeKey: string;
  studentId: string;
  academicYearId: string;
  nepaliMonthId: string;
  nepaliMonthName: string;
  feeHeadId: string;
  feeHeadName: string;
  chargeType: 'NORMAL' | 'SUPPLEMENTARY' | 'AUTHORIZED_OVERRIDE' | 'ANNUAL' | 'ONE_TIME';
  occurrenceId?: string;
  billedAmount: number;
  paidAmount: number;
  allocatedAmount: number;
  remainingAmount: number;
  status: 'ACTIVE' | 'PAID' | 'PARTIAL' | 'VOIDED';
  existingBillId?: string;
  existingBillNo?: string;
}

export interface StudentChargeCoverage {
  studentId: string;
  studentName: string;
  studentRoll?: string;
  class: string;
  academicYearId: string;
  monthCoverage: Record<string, MonthCoverageDetail>;
  requestedMonthsSummary: {
    totalRequested: number;
    fullyCoveredCount: number;
    unbilledCount: number;
    partiallyCoveredCount: number;
    coveredMonthNames: string[];
    unbilledMonthNames: string[];
    missingChargesCount: number;
    coverageStatus: 'FULLY_COVERED' | 'PARTIALLY_COVERED' | 'COMPLETELY_UNBILLED' | 'NOT_APPLICABLE';
  };
  missingChargesToGenerate: Array<{
    monthName: string;
    monthId: string;
    monthIndex: number;
    feeHeadId: string;
    feeHeadName: string;
    rate: number;
    isMonthly: boolean;
  }>;
}

export interface BillingCoverageResult {
  academicYearId: string;
  requestedMonthNames: string[];
  requestedMonthIds: string[];
  totalSelectedStudents: number;
  fullyCoveredStudentsCount: number;
  partiallyCoveredStudentsCount: number;
  unbilledStudentsCount: number;
  totalNewChargeItemsToCreate: number;
  isCompletelyBilled: boolean;
  hasMissingCharges: boolean;
  studentCoverages: StudentChargeCoverage[];
  monthBreakdown: Array<{
    monthName: string;
    monthId: string;
    billedStudentsCount: number;
    unbilledStudentsCount: number;
    paidStudentsCount: number;
    dueStudentsCount: number;
    status: 'ALL_BILLED' | 'SOME_BILLED' | 'NONE_BILLED';
  }>;
  overallStatus: 'NOTHING_NEW_TO_GENERATE' | 'READY_TO_GENERATE_MISSING' | 'READY_TO_GENERATE_ALL';
  summaryMessage: string;
}

/**
 * Authoritative Universal Billing Coverage Engine
 * Used uniformly by:
 * - Tab 1: Generate Remit Bills
 * - Tab 2: Manage Distributed Bills
 * - Tab 3: 12-Month Academic Matrix
 * - Firestore Pre-Flight Verification
 */
export function getBillingCoverage(params: {
  students: any[];
  academicYearId: string;
  requestedMonthNames: string[];
  remitBills: any[];
  studentFees?: any[];
  billItems?: any[];
  selectedFeeCategories?: {
    includeTuition?: boolean;
    includeTransport?: boolean;
    includeComputer?: boolean;
    includeAcademy?: boolean;
    includeAnnual?: boolean;
    includeAdmission?: boolean;
    includeExam?: boolean;
    academyFeeRate?: number | string;
    customCharges?: Array<{ name: string; amount: number; isMonthly: boolean }>;
  };
}): BillingCoverageResult {
  const {
    students,
    academicYearId,
    requestedMonthNames,
    remitBills,
    studentFees = [],
    billItems = [],
    selectedFeeCategories = { includeTuition: true }
  } = params;

  const normRequestedMonths = requestedMonthNames.map(m => normalizeNepaliMonth(m)).filter(Boolean);
  const requestedMonthIds = normRequestedMonths.map(m => {
    const idx = getNepaliMonthIndex(m);
    const num = idx >= 0 ? idx + 1 : 1;
    return `${num.toString().padStart(2, '0')}_${m}`;
  });

  if (students.length === 0 || normRequestedMonths.length === 0) {
    return {
      academicYearId,
      requestedMonthNames: normRequestedMonths,
      requestedMonthIds,
      totalSelectedStudents: 0,
      fullyCoveredStudentsCount: 0,
      partiallyCoveredStudentsCount: 0,
      unbilledStudentsCount: 0,
      totalNewChargeItemsToCreate: 0,
      isCompletelyBilled: true,
      hasMissingCharges: false,
      studentCoverages: [],
      monthBreakdown: [],
      overallStatus: 'NOTHING_NEW_TO_GENERATE',
      summaryMessage: 'No students or months selected.'
    };
  }

  let fullyCoveredCount = 0;
  let partiallyCoveredCount = 0;
  let unbilledCount = 0;
  let totalNewChargeItems = 0;

  const studentCoverages: StudentChargeCoverage[] = students.map(student => {
    const snapshot = getStudentBillingCoverage(student, academicYearId, remitBills, billItems);
    const rawCoverage = getStudentYearCoverage(student.id, academicYearId, remitBills, studentFees, billItems);

    const coveredInRequested: string[] = [];
    const unbilledInRequested: string[] = [];

    normRequestedMonths.forEach(m => {
      const isCovered = snapshot.monthMap[m]?.isBilled || false;
      if (isCovered) {
        coveredInRequested.push(m);
      } else {
        unbilledInRequested.push(m);
      }
    });

    let covStatus: 'FULLY_COVERED' | 'PARTIALLY_COVERED' | 'COMPLETELY_UNBILLED' | 'NOT_APPLICABLE' = 'COMPLETELY_UNBILLED';
    if (coveredInRequested.length === normRequestedMonths.length) {
      covStatus = 'FULLY_COVERED';
      fullyCoveredCount++;
    } else if (coveredInRequested.length > 0) {
      covStatus = 'PARTIALLY_COVERED';
      partiallyCoveredCount++;
    } else {
      covStatus = 'COMPLETELY_UNBILLED';
      unbilledCount++;
    }

    // Build missing charges list
    const missingCharges: Array<{
      monthName: string;
      monthId: string;
      monthIndex: number;
      feeHeadId: string;
      feeHeadName: string;
      rate: number;
      isMonthly: boolean;
    }> = [];

    unbilledInRequested.forEach(mName => {
      const idx = getNepaliMonthIndex(mName);
      const mNum = idx >= 0 ? idx + 1 : 1;
      const mId = `${mNum.toString().padStart(2, '0')}_${mName}`;

      if (selectedFeeCategories.includeTuition !== false) {
        const rate = Number(student.monthlyFee || 0);
        if (rate > 0) {
          missingCharges.push({
            monthName: mName,
            monthId: mId,
            monthIndex: mNum,
            feeHeadId: 'TUITION',
            feeHeadName: 'Monthly Tuition Fee',
            rate,
            isMonthly: true
          });
        }
      }

      if (selectedFeeCategories.includeTransport) {
        const rate = Number(student.transportFee || 0);
        if (rate > 0) {
          missingCharges.push({
            monthName: mName,
            monthId: mId,
            monthIndex: mNum,
            feeHeadId: 'TRANSPORT',
            feeHeadName: 'Transportation Fee',
            rate,
            isMonthly: true
          });
        }
      }

      if (selectedFeeCategories.includeComputer) {
        const rate = Number(student.computerFee || 0);
        if (rate > 0) {
          missingCharges.push({
            monthName: mName,
            monthId: mId,
            monthIndex: mNum,
            feeHeadId: 'COMPUTER',
            feeHeadName: 'Computer Lab Charges',
            rate,
            isMonthly: true
          });
        }
      }

      if (selectedFeeCategories.includeAcademy) {
        const rate = Number(selectedFeeCategories.academyFeeRate || student.academyFee || 0);
        if (rate > 0) {
          missingCharges.push({
            monthName: mName,
            monthId: mId,
            monthIndex: mNum,
            feeHeadId: 'ACADEMY',
            feeHeadName: 'Academy & Sports Fee',
            rate,
            isMonthly: true
          });
        }
      }
    });

    totalNewChargeItems += missingCharges.length;

    return {
      studentId: student.id,
      studentName: student.fullName || student.name || 'Student',
      studentRoll: student.rollNumber || student.studentId || '',
      class: student.class || '',
      academicYearId,
      monthCoverage: rawCoverage,
      requestedMonthsSummary: {
        totalRequested: normRequestedMonths.length,
        fullyCoveredCount: coveredInRequested.length,
        unbilledCount: unbilledInRequested.length,
        partiallyCoveredCount: coveredInRequested.length > 0 && unbilledInRequested.length > 0 ? 1 : 0,
        coveredMonthNames: coveredInRequested,
        unbilledMonthNames: unbilledInRequested,
        missingChargesCount: missingCharges.length,
        coverageStatus: covStatus
      },
      missingChargesToGenerate: missingCharges
    };
  });

  // Calculate Month-by-month breakdown across the entire student cohort
  const monthBreakdown = normRequestedMonths.map(mName => {
    const idx = getNepaliMonthIndex(mName);
    const mNum = idx >= 0 ? idx + 1 : 1;
    const mId = `${mNum.toString().padStart(2, '0')}_${mName}`;

    let billedStudentsCount = 0;
    let paidStudentsCount = 0;
    let dueStudentsCount = 0;

    studentCoverages.forEach(sc => {
      const st = sc.monthCoverage[mName]?.status;
      if (st === 'BILLED_PAID' || st === 'PAID') {
        billedStudentsCount++;
        paidStudentsCount++;
      } else if (st === 'BILLED_DUE' || st === 'GENERATED_DUE' || st === 'BILLED_PARTIAL' || st === 'PARTIAL') {
        billedStudentsCount++;
        dueStudentsCount++;
      }
    });

    const unbilledStudentsCount = students.length - billedStudentsCount;
    let status: 'ALL_BILLED' | 'SOME_BILLED' | 'NONE_BILLED' = 'NONE_BILLED';
    if (billedStudentsCount === students.length) status = 'ALL_BILLED';
    else if (billedStudentsCount > 0) status = 'SOME_BILLED';

    return {
      monthName: mName,
      monthId: mId,
      billedStudentsCount,
      unbilledStudentsCount,
      paidStudentsCount,
      dueStudentsCount,
      status
    };
  });

  const isCompletelyBilled = fullyCoveredCount === students.length;
  const hasMissingCharges = totalNewChargeItems > 0;

  let overallStatus: 'NOTHING_NEW_TO_GENERATE' | 'READY_TO_GENERATE_MISSING' | 'READY_TO_GENERATE_ALL' = 'NOTHING_NEW_TO_GENERATE';
  if (isCompletelyBilled || totalNewChargeItems === 0) {
    overallStatus = 'NOTHING_NEW_TO_GENERATE';
  } else if (partiallyCoveredCount > 0 || fullyCoveredCount > 0) {
    overallStatus = 'READY_TO_GENERATE_MISSING';
  } else {
    overallStatus = 'READY_TO_GENERATE_ALL';
  }

  let summaryMessage = '';
  if (overallStatus === 'NOTHING_NEW_TO_GENERATE') {
    summaryMessage = `All selected ${students.length} student(s) already have active billing coverage for ${normRequestedMonths.join(', ')}. Nothing new to generate.`;
  } else if (overallStatus === 'READY_TO_GENERATE_MISSING') {
    summaryMessage = `Ready to generate ${totalNewChargeItems} missing charge items for ${partiallyCoveredCount + unbilledCount} eligible student(s). ${fullyCoveredCount} fully billed student(s) will be automatically skipped.`;
  } else {
    summaryMessage = `Ready to generate ${totalNewChargeItems} charge items for all ${unbilledCount} student(s) across ${normRequestedMonths.join(', ')}.`;
  }

  return {
    academicYearId,
    requestedMonthNames: normRequestedMonths,
    requestedMonthIds,
    totalSelectedStudents: students.length,
    fullyCoveredStudentsCount: fullyCoveredCount,
    partiallyCoveredStudentsCount: partiallyCoveredCount,
    unbilledStudentsCount: unbilledCount,
    totalNewChargeItemsToCreate: totalNewChargeItems,
    isCompletelyBilled,
    hasMissingCharges,
    studentCoverages,
    monthBreakdown,
    overallStatus,
    summaryMessage
  };
}

export interface BillingFeeHeadCoverage {
  feeHeadId: string;
  feeHeadName: string;
  applicable: boolean;
  chargeExists: boolean;
  chargeStatus: 'NOT_GENERATED' | 'GENERATED_DUE' | 'PARTIAL' | 'PAID' | 'VOIDED';
  billId?: string;
  billItemId?: string;
  billNo?: string;
  chargedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  createdAt?: string;
  createdBy?: string;
  source?: 'remitBills' | 'billItems';
  isDuplicate?: boolean;
}

export interface BillingMonthCoverage {
  monthId: string; // e.g. "01_Baisakh"
  monthSequence: number; // 1 to 12
  monthName: string; // "Baisakh"
  feeHeads: BillingFeeHeadCoverage[];
  monthStatus: 'NOT_GENERATED' | 'GENERATED_DUE' | 'PARTIAL' | 'PAID' | 'VOIDED';
  isBilled: boolean; // true if GENERATED_DUE, PARTIAL, or PAID
  isPaid: boolean; // true if PAID
  isPartial: boolean; // true if PARTIAL
  isDue: boolean; // true if GENERATED_DUE
  isVoided: boolean; // true if VOIDED
  totalCharged: number;
  totalPaid: number;
  totalDue: number;
  billIds: string[];
  billNos: string[];
  hasDuplicateCharges?: boolean;
  duplicateCount?: number;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  reissuedToBillNo?: string;
}

export interface BillingCoverageSnapshot {
  studentId: string;
  studentName: string;
  studentRoll?: string;
  studentClass?: string;
  academicYearId: string;
  months: BillingMonthCoverage[];
  monthMap: Record<string, BillingMonthCoverage>;
  generatedMonthCount: number;
  missingMonthCount: number;
  partialMonthCount: number;
  paidMonthCount: number;
  voidedMonthCount: number;
  totalChargedAmount: number;
  totalPaidAmount: number;
  totalOutstandingAmount: number;
  hasDuplicateActiveCharges: boolean;
  duplicateCharges: Array<{
    month: string;
    feeHead: string;
    bills: Array<{ billId?: string; billNo?: string; amount: number; status: string }>;
  }>;
  rawBills: any[];
}

/**
 * Authoritative Canonical Billing Coverage Function
 *
 * ONE SINGLE SOURCE OF TRUTH for:
 * - 12-Month Academic Matrix
 * - Generate Remit Bill coverage analysis
 * - Live Preview Calculator
 * - Firestore Verification Pre-flight
 * - Manage Distributed Bills
 * - Student Ledger & Audit
 *
 * Checks all active non-void remitBills and their itemized charges/billItems.
 * Returns the exact status for every Student × Academic Year × Nepali Month × Fee Head.
 */
export function getStudentBillingCoverage(
  student: any,
  academicYearId: string,
  remitBills: any[],
  billItems?: any[]
): BillingCoverageSnapshot {
  const studentId = typeof student === 'string' ? student : (student?.id || student?.studentId || '');
  const studentName = typeof student === 'object' ? (student?.fullName || student?.name || 'Student') : 'Student';
  const studentRoll = typeof student === 'object' ? (student?.rollNumber || student?.studentId || '') : '';
  const studentClass = typeof student === 'object' ? (student?.class || '') : '';

  const cleanYear = (academicYearId || '').replace(/\D/g, '');

  // Filter bills strictly matching student and academic year
  const studentBills = (remitBills || []).filter(b => {
    if (!b) return false;
    if (b.studentId !== studentId) return false;
    if (!academicYearId) return true;
    const bYear = String(b.academicYear || '').replace(/\D/g, '');
    if (cleanYear && bYear && cleanYear !== bYear && !String(b.academicYear).includes(academicYearId) && !academicYearId.includes(String(b.academicYear))) {
      return false;
    }
    return true;
  });

  const activeBills = studentBills.filter(b => b.status !== 'void' && b.status !== 'cancelled');
  const voidBills = studentBills.filter(b => b.status === 'void' || b.status === 'cancelled');

  const duplicateCharges: Array<{
    month: string;
    feeHead: string;
    bills: Array<{ billId?: string; billNo?: string; amount: number; status: string }>;
  }> = [];

  let hasDuplicateActiveCharges = false;

  const months: BillingMonthCoverage[] = NEPALI_MONTH_SEQUENCE.map((mName, idx) => {
    const monthNum = idx + 1;
    const monthId = `${monthNum.toString().padStart(2, '0')}_${mName}`;

    // Collect all active bills that cover this month
    const matchingActiveBills = activeBills.filter(b => {
      const covered = extractCoveredMonthsFromBill(b);
      return covered.includes(mName);
    });

    // Check void bills
    const matchingVoidBills = voidBills.filter(b => {
      const covered = extractCoveredMonthsFromBill(b);
      return covered.includes(mName);
    });

    const feeHeads: BillingFeeHeadCoverage[] = [];
    const feeHeadMap = new Map<string, BillingFeeHeadCoverage[]>();

    // Process matching active bills
    matchingActiveBills.forEach(b => {
      const isPaid = b.status === 'paid' || (Number(b.paidAmount || 0) >= Number(b.totalAmount || 0) && Number(b.totalAmount || 0) > 0);
      const isPartial = b.status === 'partial' || (Number(b.paidAmount || 0) > 0 && Number(b.paidAmount || 0) < Number(b.totalAmount || 0));
      const chargeStatus: 'PAID' | 'PARTIAL' | 'GENERATED_DUE' = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'GENERATED_DUE';

      // If bill has itemizedCharges, decompose into fee heads
      if (Array.isArray(b.itemizedCharges) && b.itemizedCharges.length > 0) {
        b.itemizedCharges.forEach((item: any) => {
          let headId = 'TUITION';
          let headName = 'Tuition Fee';
          const iName = (item.name || '').toLowerCase();
          if (iName.includes('transport')) { headId = 'TRANSPORT'; headName = 'Transportation Fee'; }
          else if (iName.includes('computer')) { headId = 'COMPUTER'; headName = 'Computer Lab Charges'; }
          else if (iName.includes('academy') || iName.includes('sports')) { headId = 'ACADEMY'; headName = 'Academy & Sports Fee'; }
          else if (iName.includes('annual')) { headId = 'ANNUAL'; headName = 'Annual Session Fee'; }
          else if (iName.includes('admission')) { headId = 'ADMISSION'; headName = 'Admission Fee'; }
          else if (iName.includes('exam')) { headId = 'EXAM'; headName = 'Terminal Exam Fee'; }
          else if (!iName.includes('tuition')) { headId = 'CUSTOM'; headName = item.name || 'Custom Charge'; }

          const totalMonths = Math.max(1, (b.coveredMonths || []).length);
          const chargedAmt = (item.isMonthly || headId === 'TUITION' || headId === 'TRANSPORT' || headId === 'COMPUTER' || headId === 'ACADEMY')
            ? Math.round(Number(item.total || item.amount || 0) / totalMonths)
            : Number(item.total || item.amount || 0);

          const feeHeadItem: BillingFeeHeadCoverage = {
            feeHeadId: headId,
            feeHeadName: headName,
            applicable: true,
            chargeExists: true,
            chargeStatus,
            billId: b.id,
            billItemId: item.id || undefined,
            billNo: b.billNo,
            chargedAmount: chargedAmt,
            paidAmount: isPaid ? chargedAmt : isPartial ? Math.round(chargedAmt * (Number(b.paidAmount || 0) / Math.max(1, Number(b.totalAmount || 1)))) : 0,
            outstandingAmount: isPaid ? 0 : chargedAmt,
            createdAt: b.createdAt,
            createdBy: b.createdBy,
            source: 'remitBills'
          };

          if (!feeHeadMap.has(headId)) feeHeadMap.set(headId, []);
          feeHeadMap.get(headId)!.push(feeHeadItem);
          feeHeads.push(feeHeadItem);
        });
      } else {
        // Fallback aggregate charge
        const feeHeadItem: BillingFeeHeadCoverage = {
          feeHeadId: 'TUITION',
          feeHeadName: 'Standard Monthly Fee',
          applicable: true,
          chargeExists: true,
          chargeStatus,
          billId: b.id,
          billNo: b.billNo,
          chargedAmount: Math.round(Number(b.totalAmount || 0) / Math.max(1, (b.coveredMonths || []).length)),
          paidAmount: isPaid ? Math.round(Number(b.totalAmount || 0) / Math.max(1, (b.coveredMonths || []).length)) : 0,
          outstandingAmount: isPaid ? 0 : Math.round(Number(b.totalAmount || 0) / Math.max(1, (b.coveredMonths || []).length)),
          createdAt: b.createdAt,
          createdBy: b.createdBy,
          source: 'remitBills'
        };
        if (!feeHeadMap.has('TUITION')) feeHeadMap.set('TUITION', []);
        feeHeadMap.get('TUITION')!.push(feeHeadItem);
        feeHeads.push(feeHeadItem);
      }
    });

    // Check for duplicate active charges for the same fee head in the same month
    feeHeadMap.forEach((items, headId) => {
      if (items.length > 1) {
        hasDuplicateActiveCharges = true;
        items.forEach(it => { it.isDuplicate = true; });
        duplicateCharges.push({
          month: mName,
          feeHead: headId,
          bills: items.map(it => ({ billId: it.billId, billNo: it.billNo, amount: it.chargedAmount, status: it.chargeStatus }))
        });
      }
    });

    // Calculate month status
    let monthStatus: 'NOT_GENERATED' | 'GENERATED_DUE' | 'PARTIAL' | 'PAID' | 'VOIDED' = 'NOT_GENERATED';
    let totalCharged = 0;
    let totalPaid = 0;
    let totalDue = 0;
    const billIds: string[] = [];
    const billNos: string[] = [];

    matchingActiveBills.forEach(b => {
      if (b.id && !billIds.includes(b.id)) billIds.push(b.id);
      if (b.billNo && !billNos.includes(b.billNo)) billNos.push(b.billNo);
    });

    if (feeHeads.length > 0) {
      feeHeads.forEach(fh => {
        totalCharged += fh.chargedAmount;
        totalPaid += fh.paidAmount;
        totalDue += fh.outstandingAmount;
      });

      const allPaid = feeHeads.every(fh => fh.chargeStatus === 'PAID');
      const anyPartial = feeHeads.some(fh => fh.chargeStatus === 'PARTIAL');
      const anyPaid = feeHeads.some(fh => fh.chargeStatus === 'PAID');

      if (allPaid) {
        monthStatus = 'PAID';
      } else if (anyPartial || anyPaid) {
        monthStatus = 'PARTIAL';
      } else {
        monthStatus = 'GENERATED_DUE';
      }
    } else if (matchingVoidBills.length > 0) {
      monthStatus = 'VOIDED';
      matchingVoidBills.forEach(b => {
        if (b.id && !billIds.includes(b.id)) billIds.push(b.id);
        if (b.billNo && !billNos.includes(b.billNo)) billNos.push(b.billNo);
      });
    }

    const isBilled = monthStatus === 'PAID' || monthStatus === 'PARTIAL' || monthStatus === 'GENERATED_DUE';
    const isPaid = monthStatus === 'PAID';
    const isPartial = monthStatus === 'PARTIAL';
    const isDue = monthStatus === 'GENERATED_DUE';
    const isVoided = monthStatus === 'VOIDED';

    const latestVoid = matchingVoidBills[0];

    return {
      monthId,
      monthSequence: monthNum,
      monthName: mName,
      feeHeads,
      monthStatus,
      isBilled,
      isPaid,
      isPartial,
      isDue,
      isVoided,
      totalCharged,
      totalPaid,
      totalDue,
      billIds,
      billNos,
      hasDuplicateCharges: (feeHeadMap.get('TUITION')?.length || 0) > 1,
      duplicateCount: feeHeads.filter(f => f.isDuplicate).length,
      voidReason: latestVoid?.voidReason,
      voidedAt: latestVoid?.voidedAt,
      voidedBy: latestVoid?.voidedBy,
      reissuedToBillNo: latestVoid?.reissuedToBillNo
    };
  });

  const monthMap: Record<string, BillingMonthCoverage> = {};
  let generatedMonthCount = 0;
  let missingMonthCount = 0;
  let partialMonthCount = 0;
  let paidMonthCount = 0;
  let voidedMonthCount = 0;
  let totalChargedAmount = 0;
  let totalPaidAmount = 0;
  let totalOutstandingAmount = 0;

  months.forEach(m => {
    monthMap[m.monthName] = m;
    if (m.isBilled) generatedMonthCount++;
    else missingMonthCount++;

    if (m.isPaid) paidMonthCount++;
    if (m.isPartial) partialMonthCount++;
    if (m.isVoided) voidedMonthCount++;

    totalChargedAmount += m.totalCharged;
    totalPaidAmount += m.totalPaid;
    totalOutstandingAmount += m.totalDue;
  });

  return {
    studentId,
    studentName,
    studentRoll,
    studentClass,
    academicYearId,
    months,
    monthMap,
    generatedMonthCount,
    missingMonthCount,
    partialMonthCount,
    paidMonthCount,
    voidedMonthCount,
    totalChargedAmount,
    totalPaidAmount,
    totalOutstandingAmount,
    hasDuplicateActiveCharges,
    duplicateCharges,
    rawBills: studentBills
  };
}

export interface MonthCoverageDetail {
  month: string;
  monthIndex: number;
  status: MonthBillingStatus;
  billId?: string;
  billNo?: string;
  amount?: number;
  paidAmount?: number;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  reissuedToBillNo?: string;
}

/**
 * Extracts covered months array from a remit bill document, falling back to parsed period text.
 */
export function extractCoveredMonthsFromBill(bill: any): string[] {
  if (!bill) return [];

  if (Array.isArray(bill.coveredMonths) && bill.coveredMonths.length > 0) {
    return bill.coveredMonths.map((m: string) => normalizeNepaliMonth(m)).filter(Boolean);
  }

  if (Array.isArray(bill.monthsCovered) && bill.monthsCovered.length > 0) {
    return bill.monthsCovered.map((m: string) => normalizeNepaliMonth(m)).filter(Boolean);
  }

  if (Array.isArray(bill.months) && bill.months.length > 0) {
    return bill.months.map((m: string) => normalizeNepaliMonth(m)).filter(Boolean);
  }

  if (bill.startMonth && bill.endMonth) {
    const sIdx = getNepaliMonthIndex(bill.startMonth);
    const eIdx = getNepaliMonthIndex(bill.endMonth);
    if (sIdx !== -1 && eIdx !== -1 && sIdx <= eIdx) {
      return NEPALI_MONTH_SEQUENCE.slice(sIdx, eIdx + 1).map(m => m as string);
    }
  }

  // Also check itemizedCharges for month tags
  if (Array.isArray(bill.itemizedCharges) && bill.itemizedCharges.length > 0) {
    const itemMonths: string[] = [];
    bill.itemizedCharges.forEach((it: any) => {
      if (it.month) {
        const norm = normalizeNepaliMonth(it.month);
        if (norm && !itemMonths.includes(norm)) itemMonths.push(norm);
      }
      if (it.monthName) {
        const norm = normalizeNepaliMonth(it.monthName);
        if (norm && !itemMonths.includes(norm)) itemMonths.push(norm);
      }
    });
    if (itemMonths.length > 0) {
      return itemMonths;
    }
  }

  // Parse from billingPeriod string
  const text = bill.billingPeriod || '';
  const months: string[] = [];
  NEPALI_MONTH_SEQUENCE.forEach(m => {
    if (text.includes(m) || (m === 'Ashadh' && text.includes('Asar'))) {
      months.push(m);
    }
  });

  if (months.length <= 2) {
    // Check if it was a range like "Baisakh to Ashadh"
    const words = text.split(/\s+/);
    let firstM: string | null = null;
    let lastM: string | null = null;
    for (const w of words) {
      const norm = normalizeNepaliMonth(w);
      if (getNepaliMonthIndex(norm) !== -1) {
        if (!firstM) firstM = norm;
        else lastM = norm;
      }
    }
    if (firstM && lastM && firstM !== lastM) {
      const sIdx = getNepaliMonthIndex(firstM);
      const eIdx = getNepaliMonthIndex(lastM);
      if (sIdx !== -1 && eIdx !== -1 && sIdx <= eIdx) {
        return NEPALI_MONTH_SEQUENCE.slice(sIdx, eIdx + 1).map(m => m as string);
      }
    }
  }

  return months;
}

/**
 * Evaluates the 12-month billing status for a single student.
 * STRICTLY DERIVED from the single canonical getStudentBillingCoverage engine.
 */
export function getStudentYearCoverage(
  studentId: string,
  academicYear: string,
  remitBills: any[],
  studentFees?: any[],
  billItems?: any[]
): Record<string, MonthCoverageDetail> {
  const studentObj = { id: studentId };
  const snapshot = getStudentBillingCoverage(studentObj, academicYear, remitBills, billItems);

  const coverage: Record<string, MonthCoverageDetail> = {};
  snapshot.months.forEach((m, idx) => {
    let legacyStatus: MonthBillingStatus = 'NOT_GENERATED';
    if (m.monthStatus === 'PAID') legacyStatus = 'PAID';
    else if (m.monthStatus === 'PARTIAL') legacyStatus = 'PARTIAL';
    else if (m.monthStatus === 'GENERATED_DUE') legacyStatus = 'GENERATED_DUE';
    else if (m.monthStatus === 'VOIDED') legacyStatus = 'VOID';

    coverage[m.monthName] = {
      month: m.monthName,
      monthIndex: idx,
      status: legacyStatus,
      billId: m.billIds[0],
      billNo: m.billNos[0],
      amount: m.totalCharged,
      paidAmount: m.totalPaid,
      voidReason: m.voidReason,
      voidedAt: m.voidedAt,
      voidedBy: m.voidedBy,
      reissuedToBillNo: m.reissuedToBillNo
    };
  });

  return coverage;
}

export interface PeriodCoverageAnalysis {
  targetMonths: string[];
  totalTargetStudents: number;
  fullyBilledStudentsCount: number;
  partiallyBilledStudentsCount: number;
  unbilledStudentsCount: number;
  
  // Month-by-month summary across target students
  monthBreakdown: Array<{
    month: string;
    billedCount: number;
    unbilledCount: number;
    status: 'ALL_BILLED' | 'SOME_BILLED' | 'NONE_BILLED';
  }>;

  // The subset of requested months that have ALREADY been billed for ANY or ALL students
  alreadyBilledMonths: string[];
  // The subset of requested months that are completely unbilled across target students
  unbilledMonths: string[];

  // Protection flags
  isDuplicateBlocked: boolean; // True if ALL target students are ALREADY fully billed for ALL target months
  hasPartialOverlap: boolean;  // True if some months or some students are already billed
  missingMonthsToBill: string[]; // Missing months recommendation
}

/**
 * Analyzes billing coverage for a set of target students against a requested period.
 */
export function analyzePeriodCoverage(
  targetStudents: any[],
  academicYear: string,
  targetMonths: string[],
  remitBills: any[],
  studentFees?: any[]
): PeriodCoverageAnalysis {
  if (targetStudents.length === 0 || targetMonths.length === 0) {
    return {
      targetMonths,
      totalTargetStudents: 0,
      fullyBilledStudentsCount: 0,
      partiallyBilledStudentsCount: 0,
      unbilledStudentsCount: 0,
      monthBreakdown: [],
      alreadyBilledMonths: [],
      unbilledMonths: targetMonths,
      isDuplicateBlocked: false,
      hasPartialOverlap: false,
      missingMonthsToBill: targetMonths
    };
  }

  const studentCoverageMap = targetStudents.map(student => ({
    student,
    coverage: getStudentYearCoverage(student.id, academicYear, remitBills, studentFees)
  }));

  let fullyBilledCount = 0;
  let partiallyBilledCount = 0;
  let unbilledCount = 0;

  studentCoverageMap.forEach(({ coverage }) => {
    const billedMonthsForStudent = targetMonths.filter(m => {
      const st = coverage[m]?.status;
      return st === 'GENERATED_DUE' || st === 'PARTIAL' || st === 'PAID';
    });

    if (billedMonthsForStudent.length === targetMonths.length) {
      fullyBilledCount++;
    } else if (billedMonthsForStudent.length > 0) {
      partiallyBilledCount++;
    } else {
      unbilledCount++;
    }
  });

  const monthBreakdown = targetMonths.map(month => {
    let billedCount = 0;
    studentCoverageMap.forEach(({ coverage }) => {
      const st = coverage[month]?.status;
      if (st === 'GENERATED_DUE' || st === 'PARTIAL' || st === 'PAID') {
        billedCount++;
      }
    });
    const unbilledCount = targetStudents.length - billedCount;
    let status: 'ALL_BILLED' | 'SOME_BILLED' | 'NONE_BILLED' = 'NONE_BILLED';
    if (billedCount === targetStudents.length) status = 'ALL_BILLED';
    else if (billedCount > 0) status = 'SOME_BILLED';

    return {
      month,
      billedCount,
      unbilledCount,
      status
    };
  });

  const alreadyBilledMonths = monthBreakdown
    .filter(mb => mb.billedCount > 0)
    .map(mb => mb.month);

  const unbilledMonths = monthBreakdown
    .filter(mb => mb.billedCount === 0)
    .map(mb => mb.month);

  const missingMonthsToBill = monthBreakdown
    .filter(mb => mb.billedCount < targetStudents.length)
    .map(mb => mb.month);

  // If ALL target students already have bills covering ALL target months:
  const isDuplicateBlocked = fullyBilledCount === targetStudents.length;
  const hasPartialOverlap = !isDuplicateBlocked && alreadyBilledMonths.length > 0;

  return {
    targetMonths,
    totalTargetStudents: targetStudents.length,
    fullyBilledStudentsCount: fullyBilledCount,
    partiallyBilledStudentsCount: partiallyBilledCount,
    unbilledStudentsCount: unbilledCount,
    monthBreakdown,
    alreadyBilledMonths,
    unbilledMonths,
    isDuplicateBlocked,
    hasPartialOverlap,
    missingMonthsToBill
  };
}

/**
 * Checks whether an Annual Fee has ALREADY been billed for this student in the current academic year.
 */
export function hasAnnualFeeBeenBilled(
  studentId: string,
  academicYear: string,
  remitBills: any[],
  studentFees?: any[]
): { billed: boolean; billNo?: string; amount?: number } {
  // 1. Check remit bills
  const billWithAnnual = remitBills.find(b => {
    if (b.studentId !== studentId) return false;
    if (b.status === 'void' || b.status === 'cancelled') return false;
    const bYear = b.academicYear || (b.createdAt ? b.createdAt.split('-')[0] : academicYear);
    if (bYear && !bYear.includes(academicYear) && !academicYear.includes(bYear)) return false;
    return Array.isArray(b.itemizedCharges) && b.itemizedCharges.some((item: any) => 
      item.name === 'Annual Fee' || item.name.includes('Annual Fee')
    );
  });

  if (billWithAnnual) {
    const charge = billWithAnnual.itemizedCharges.find((i: any) => i.name === 'Annual Fee' || i.name.includes('Annual Fee'));
    return { billed: true, billNo: billWithAnnual.billNo, amount: charge?.total };
  }

  // 2. Check student fees
  if (Array.isArray(studentFees)) {
    const feeWithAnnual = studentFees.find(f => {
      if (f.studentId !== studentId) return false;
      if (f.status === 'void' || f.status === 'cancelled') return false;
      if (f.type !== 'Annual Fee') return false;
      const fYear = f.academicYear || (f.createdAt ? f.createdAt.split('-')[0] : academicYear);
      return !fYear || fYear.includes(academicYear) || academicYear.includes(fYear);
    });
    if (feeWithAnnual) {
      return { billed: true, billNo: feeWithAnnual.receiptNo || 'Student Fee Ledger', amount: feeWithAnnual.totalFee };
    }
  }

  return { billed: false };
}
