const fs = require('fs');
const path = require('path');

function walkDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;
            
            // Replaces <img with <img loading="lazy" decoding="async" if not already present
            content = content.replace(/<img(?!([^>]*?)(loading=|decoding=))/g, '<img loading="lazy" decoding="async"');
            
            // Also looking for <img src="..." loading="lazy" but missing decoding="async"
            // Let's just be simple
            
            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated ${fullPath}`);
            }
        }
    });
}

walkDir('./src');
