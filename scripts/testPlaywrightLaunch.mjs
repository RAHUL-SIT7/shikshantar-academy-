import { chromium } from 'playwright';

async function test() {
  console.log('Launching browser with --no-sandbox...');
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });
  console.log('Browser launched successfully!');
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  console.log('Page loaded! Title:', await page.title());
  await browser.close();
  console.log('Browser closed successfully!');
  process.exit(0);
}

test().catch(e => {
  console.error('Launch failed:', e);
  process.exit(1);
});
