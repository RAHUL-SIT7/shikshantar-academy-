const fs = require('fs');

const filesToUpdate = ['index.html', 'public/robots.txt', 'public/sitemap.xml'];
const targetDomain = 'https://ais-pre-uc6g6uxuccqm7lfda3ldzd-725921555856.asia-east1.run.app';
const oldDomainStr = 'https://your-domain.com';

filesToUpdate.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace domain
    content = content.replace(new RegExp(oldDomainStr, 'g'), targetDomain);
    
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
