/**
 * Converts a numerical amount in Nepali Rupees into words.
 * Handles South Asian numbering system (Crore, Lakh, Thousand, Hundred).
 */
export function numberToWords(num: number): string {
  if (isNaN(num) || num === null || num === undefined) return '';
  num = Math.round(Math.abs(num));
  if (num === 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];

  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function convertTwoDigits(n: number): string {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return (tens[t] + (o > 0 ? ' ' + ones[o] : '')).trim();
  }

  function convertThreeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let str = '';
    if (h > 0) {
      str += ones[h] + ' Hundred';
    }
    if (rest > 0) {
      if (str.length > 0) str += ' ';
      str += convertTwoDigits(rest);
    }
    return str.trim();
  }

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(convertThreeDigits(crore) + ' Crore');
  }
  if (lakh > 0) {
    parts.push(convertThreeDigits(lakh) + ' Lakh');
  }
  if (thousand > 0) {
    parts.push(convertThreeDigits(thousand) + ' Thousand');
  }
  if (hundred > 0) {
    parts.push(convertThreeDigits(hundred));
  }

  return parts.join(' ') + ' Rupees Only';
}
