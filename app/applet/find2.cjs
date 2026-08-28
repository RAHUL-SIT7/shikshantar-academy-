const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if(fs.statSync(dirPath).isDirectory()) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

walkDir('src/components', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split('\n');
    lines.forEach((l, i) => {
        if (l.includes('onSnapshot(')) {
            console.log(filePath + ':' + (i+1));
        }
    });
  }
});
