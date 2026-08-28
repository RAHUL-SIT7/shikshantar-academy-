const fs = require('fs');
const path = require('path');

const LOGO_URL = "https://i.postimg.cc/nc9G7pRB/image.png";

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let changed = false;

            // Remove import logoImage from '.../assets/logo.png'
            if (content.includes('import logoImage from')) {
                content = content.replace(/import logoImage from '[^']+';\n?/g, '');
                changed = true;
            }

            // Ensure const logoImage = "..." is declared near the top if it uses logoImage
            if (content.includes('logoImage') && !content.includes('const logoImage =')) {
                const firstImportEnd = content.lastIndexOf('import ');
                const newlineIndex = content.indexOf('\n', firstImportEnd);
                
                if (newlineIndex !== -1) {
                     content = content.slice(0, newlineIndex + 1) + `\nconst logoImage = "${LOGO_URL}";\n` + content.slice(newlineIndex + 1);
                } else {
                     content = `const logoImage = "${LOGO_URL}";\n` + content;
                }
                changed = true;
            }

            if (changed) {
                fs.writeFileSync(fullPath, content);
                console.log('Fixed ' + fullPath);
            }
        }
    }
}

// Add the same LOGO_URL to index.html Open Graph/Twitter meta tags
let indexHtml = fs.readFileSync('index.html', 'utf8');
let replacedHtml = indexHtml.replace(/https:\/\/ais-pre[^\"]+\/logo\.png/g, LOGO_URL);
replacedHtml = replacedHtml.replace(/href="\/logo\.png"/g, `href="${LOGO_URL}"`);
if(indexHtml !== replacedHtml) {
    fs.writeFileSync('index.html', replacedHtml);
    console.log('Fixed index.html');
}

processDir('./src');
