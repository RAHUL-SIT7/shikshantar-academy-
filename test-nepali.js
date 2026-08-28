const NepaliDate = require('nepali-datetime');
console.log(NepaliDate);
try {
  let d = new NepaliDate();
  console.log(d.format('YYYY-MM-DD'));
} catch (e) {
  console.log('Error 1:', e.message);
}
try {
  if (NepaliDate.default) {
    let d = new NepaliDate.default();
    console.log(d.format('YYYY-MM-DD'));
  }
} catch (e) {
  console.log('Error 2:', e.message);
}
