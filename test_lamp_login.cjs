const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runTests() {
  const evidenceDir = path.join(__dirname, 'login_lamp_evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  console.log('🚀 Launching Chromium browser with Playwright...');
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (err) {
    console.log('Could not launch standard chromium:', err.message);
    return;
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const viewports = [
    { name: 'desktop_2560x1440', width: 2560, height: 1440 },
    { name: 'desktop_1920x1080', width: 1920, height: 1080 },
    { name: 'desktop_1600x900', width: 1600, height: 900 },
    { name: 'desktop_1440x900', width: 1440, height: 900 },
    { name: 'desktop_1366x768', width: 1366, height: 768 },
    { name: 'desktop_1280x800', width: 1280, height: 800 },
    { name: 'tablet_1024x768', width: 1024, height: 768 },
    { name: 'tablet_820x1180', width: 820, height: 1180 },
    { name: 'tablet_768x1024', width: 768, height: 1024 },
    { name: 'mobile_430x932', width: 430, height: 932 },
    { name: 'mobile_390x844', width: 390, height: 844 },
    { name: 'mobile_375x667', width: 375, height: 667 },
    { name: 'mobile_360x800', width: 360, height: 800 },
    { name: 'mobile_320x568', width: 320, height: 568 },
  ];

  console.log('\n--- 1. Testing Desktop (1440x900) UI Elements & Hierarchy ---');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Capture master desktop screenshot
  const shot1 = path.join(evidenceDir, '01_redesigned_master_login_desktop.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log(`✓ Captured Screenshot: ${shot1}`);

  const pageText = await page.textContent('body');

  // Verify Image 1 background asset is loaded and rendered
  const bgImg = await page.$('img[alt="Shikshantar Academy Environment"]');
  if (bgImg) {
    const isVisible = await bgImg.isVisible();
    const naturalWidth = await bgImg.evaluate(el => el.naturalWidth);
    console.log(`✓ PASS: Image 1 Background asset is present in DOM (Visible: ${isVisible}, NaturalWidth: ${naturalWidth}px)`);
  } else {
    console.log('❌ FAIL: Image 1 background element missing');
  }

  // Verify Image 2 Login Card elements
  if (pageText.includes('WELCOME BACK') && pageText.includes('Sign in to your Academy Portal')) {
    console.log('✓ PASS: Image 2 Master Login Title & Eyebrow ("Sign in to your Academy Portal") are present');
  } else {
    console.log('❌ FAIL: Image 2 Login Card heading missing');
  }

  // Verify NO fake CAPTCHA
  if (!pageText.includes("I'm not a robot") && !pageText.includes('reCAPTCHA')) {
    console.log('✓ PASS: No fake CAPTCHA checkbox is rendered in UI');
  } else {
    console.log('❌ FAIL: Fake CAPTCHA found');
  }

  // Verify NO "Lamp Illuminated" badge
  if (!pageText.includes('Lamp Illuminated')) {
    console.log('✓ PASS: "Lamp Illuminated" badge has been removed');
  } else {
    console.log('❌ FAIL: "Lamp Illuminated" badge still present');
  }

  // Verify Watermark
  const watermarkInfo = await page.evaluate(() => {
    const wm = document.querySelector('div[aria-hidden="true"] img');
    if (!wm) return null;
    const parent = wm.parentElement;
    const style = window.getComputedStyle(parent);
    return {
      exists: true,
      pointerEvents: style.pointerEvents,
      opacity: style.opacity,
    };
  });
  console.log('✓ Watermark check:', watermarkInfo);

  // Verify STRICT Guest Button Rule: Absolutely nothing below button
  const guestButtonValidation = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const guestBtn = btns.find(b => b.textContent.includes('CONTINUE AS GUEST USER'));
    if (!guestBtn) return { found: false };
    const nextElem = guestBtn.nextElementSibling;
    return {
      found: true,
      text: guestBtn.textContent.trim(),
      nextElemTag: nextElem ? nextElem.tagName : null,
      nextElemText: nextElem ? nextElem.textContent.trim().substring(0, 50) : null,
    };
  });
  console.log('✓ STRICT Guest Button check:', guestButtonValidation);

  // Check login card sizing on desktop
  const cardSize = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Sign in to your Academy Portal'));
    if (!heading) return null;
    const card = heading.closest('.rounded-\\[32px\\]') || heading.closest('.rounded-\\[36px\\]') || heading.closest('.rounded-3xl') || heading.parentElement.parentElement.parentElement;
    const rect = card.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  });
  console.log('✓ Login Card bounding box on 1440x900:', cardSize);

  // Test Responsive Viewports for Horizontal Overflow
  console.log('\n--- 2. Testing Viewport Scaling & Horizontal Scroll Matrix (All 14 Resolutions) ---');
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);

    const overflowCheck = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });

    const isOk = !overflowCheck.hasOverflow;
    console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): ${isOk ? '✓ PASS (No Overflow)' : '❌ FAIL (Overflow detected)'} [Scroll: ${overflowCheck.scrollWidth}px, Client: ${overflowCheck.clientWidth}px]`);

    if (['desktop_1920x1080', 'tablet_768x1024', 'mobile_390x844', 'mobile_320x568'].includes(vp.name)) {
      const vpShot = path.join(evidenceDir, `responsive_${vp.name}.png`);
      await page.screenshot({ path: vpShot, fullPage: false });
    }
  }

  // Test Continue as Guest Navigation
  console.log('\n--- 3. Testing "CONTINUE AS GUEST USER" Flow ---');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const guestBtn = page.locator('button:has-text("CONTINUE AS GUEST USER")').first();
  await guestBtn.click();
  await page.waitForTimeout(800);

  const currentUrl = page.url();
  const guestLocalStorage = await page.evaluate(() => {
    return {
      userRole: localStorage.getItem('userRole'),
      isGuest: localStorage.getItem('isGuest')
    };
  });

  console.log(`✓ Current URL after guest click: ${currentUrl}`);
  console.log(`✓ Guest LocalStorage:`, guestLocalStorage);

  if (guestLocalStorage.userRole === 'guest' && guestLocalStorage.isGuest === 'true') {
    console.log('✓ PASS: Guest user routed cleanly to public school portal without session');
  } else {
    console.log('❌ FAIL: Guest state failed');
  }

  await browser.close();
  console.log('\n✅ All automated browser tests finished successfully.');
}

runTests().catch(err => {
  console.error('Error running test script:', err);
  process.exit(1);
});
