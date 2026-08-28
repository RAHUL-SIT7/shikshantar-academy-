const fs = require('fs');
const path = require('path');

const traverse = (dir, callback) => {
  fs.readdirSync(dir).forEach(file => {
    let fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      traverse(fullPath, callback);
    } else {
      callback(fullPath);
    }
  });
};

const regexLogo = /https:\/\/i\.postimg\.cc\/SxGS5WxY\/logo\.png/g;
const regexPrincipal = /https:\/\/i\.postimg\.cc\/7LmLCgvb\/606350985-1458678509597899-5556893883060728495-n-jpg-stp-dst-jpegr-tt6-nc-cat-111-ccb-1-7-nc-sid-7\.jpg/g;

traverse('./src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    content = content.replace(regexLogo, '/logo.png');
    content = content.replace(regexPrincipal, '/principal.jpg');
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});

let indexHtml = fs.readFileSync('./index.html', 'utf8');
let newIndex = indexHtml.replace(regexLogo, '/logo.png');
fs.writeFileSync('./index.html', newIndex, 'utf8');
console.log('Updated index.html');
