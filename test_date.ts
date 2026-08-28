import NepaliDate from 'nepali-date-converter';

const d1 = '2024-05-15'; // AD
const d2 = '2081-05-15'; // BS

const nd1 = new NepaliDate(new Date(d1));
console.log('AD->BS:', nd1.format('YYYY-MM-DD'));

try {
  const nd2 = new NepaliDate(new Date(d2));
  console.log('BS->BS???', nd2.format('YYYY-MM-DD'));
} catch (e: any) {
  console.log('Error', e.message);
}

try {
  const nd3 = new NepaliDate(d2);
  console.log('direct BS:', nd3.format('YYYY-MM-DD'));
} catch (e: any) {
  console.log('direct BS error', e.message);
}
