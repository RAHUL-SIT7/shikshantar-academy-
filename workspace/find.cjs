const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split('\n');
    lines.forEach((l, i) => {
        if (l.includes('onSnapshot(')) {
            let nextFewLines = lines.slice(Math.max(0, i-2), i+15).join('\n');
            if (nextFewLines.includes('error') || nextFewLines.includes('err') || nextFewLines.includes('warn') || nextFewLines.includes('catch(')) {
                // likely has error handler
            } else {
                console.log(filePath + ':' + (i+1) + ': ' + l.trim());
            }
        }
    });
  }
});
