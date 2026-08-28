const fs = require('fs');
const glob = require('glob');
function run() {
  glob.sync('src/**/*.tsx').forEach(file => {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('onSnapshot')) {
      const lines = text.split('\n');
      lines.forEach((l, i) => {
        if (l.includes('onSnapshot(')) {
          console.log(`${file}:${i+1}: ${l}`);
        }
      });
    }
  });
}
run();
