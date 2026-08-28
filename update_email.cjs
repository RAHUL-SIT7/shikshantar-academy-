const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');

content = content.replace(/info@yourdomain.com/g, 'info@shikshantaracademy.edu.np'); // Or similar

fs.writeFileSync('index.html', content, 'utf8');
console.log('updated email');
