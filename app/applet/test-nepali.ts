import NepaliDate from 'nepali-datetime';
const date = new NepaliDate();
console.log("Current Date:", date.format("YYYY-MM-DD"));
console.log("Current DateTime:", date.format("YYYY-MM-DD HH:mm:ss"));
console.log("Current string:", date.toString());
