import NepaliDate from 'nepali-date-converter';

export const formatBSDate = (date: Date | string | number): string => {
  try {
    const nd = new NepaliDate(new Date(date));
    return nd.format('DD MMMM YYYY'); 
  } catch(e) {
    return new Date(date).toLocaleDateString();
  }
}

export const formatBSDateTime = (date: Date | string | number): string => {
  try {
    const d = new Date(date);
    const nd = new NepaliDate(d);
    return nd.format('DD MMMM YYYY') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); 
  } catch(e) {
    return new Date(date).toLocaleString();
  }
}

export const getBSYearMonthDate = (date: Date = new Date()) => {
  try {
    const nd = new NepaliDate(date);
    return {
      year: nd.getYear(),
      month: nd.getMonth(),
      date: nd.getDate()
    };
  } catch (e) {
    return { year: date.getFullYear() + 57, month: 0, date: 1 };
  }
}
