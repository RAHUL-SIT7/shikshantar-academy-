export interface RemitChargeItem {
  name: string;
  rate: number;
  months: number;
  total: number;
}

export interface FormattedRemitChargeItem {
  sn: number;
  name: string;
  rateStr: string;
  durationStr: string;
  durationShortStr: string;
  totalStr: string;
  isBackDues: boolean;
  total: number;
  months: number;
  rate: number;
}

/**
 * Consolidates and formats itemized charges for Remit Bills (Pre-payment Remit Bills).
 * Any historical or multiple back dues (e.g. Back Dues (Academy Fee), Back Dues (Tuition Fee), etc.)
 * are consolidated into a single clean line:
 * 'Back Dues' with Rate: '--', Duration: '----', and Total: sum of all back dues.
 */
export function formatRemitBillItems(charges: RemitChargeItem[] = []): FormattedRemitChargeItem[] {
  const regularItems: RemitChargeItem[] = [];
  let totalBackDues = 0;
  let hasBackDues = false;

  (charges || []).forEach(item => {
    const itemName = item.name || '';
    const isBackDue = itemName.toLowerCase().includes('back dues') || 
                      itemName.toLowerCase().includes('arrears') || 
                      itemName.toLowerCase().includes('outstanding dues');
    if (isBackDue) {
      hasBackDues = true;
      totalBackDues += Number(item.total !== undefined ? item.total : (item.rate || 0));
    } else {
      regularItems.push(item);
    }
  });

  const formatted: FormattedRemitChargeItem[] = regularItems.map((item, idx) => ({
    sn: idx + 1,
    name: item.name,
    rateStr: `NRs. ${Number(item.rate || 0).toLocaleString()}`,
    durationStr: item.months > 0 ? `${item.months} Month${item.months > 1 ? 's' : ''}` : '----',
    durationShortStr: item.months > 0 ? `${item.months} M` : '----',
    totalStr: `NRs. ${Number(item.total || 0).toLocaleString()}`,
    isBackDues: false,
    total: Number(item.total || 0),
    months: item.months || 0,
    rate: Number(item.rate || 0)
  }));

  if (hasBackDues && totalBackDues > 0) {
    formatted.push({
      sn: formatted.length + 1,
      name: 'Back Dues',
      rateStr: '--',
      durationStr: '----',
      durationShortStr: '----',
      totalStr: `NRs. ${totalBackDues.toLocaleString()}`,
      isBackDues: true,
      total: totalBackDues,
      months: 0,
      rate: 0
    });
  }

  return formatted;
}
