import { chromium } from 'playwright';
import * as fs from 'fs';
import { db, auth } from '../src/firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

async function runResponsiveAudit() {
  console.log('==============================================================================');
  console.log('PART 1: REAL RESPONSIVE UI BROWSER AUDIT VIA PLAYWRIGHT / CHROMIUM');
  console.log('==============================================================================\n');

  const screenshotDir = '/tmp/screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const timestamp = Date.now();
  const testPassword = 'TestPassword123!';

  const adminEmail = `admin_resp_${timestamp}@shikshantar.edu.np`;
  const teacherEmail = `teacher_resp_${timestamp}@shikshantar.edu.np`;
  const studentEmail = `student_resp_${timestamp}@shikshantar.edu.np`;

  console.log('[PROVISIONING] Creating temporary test roles in Auth & Firestore...');
  const adminCred = await createUserWithEmailAndPassword(auth, adminEmail, testPassword);
  await setDoc(doc(db, 'users', adminCred.user.uid), {
    email: adminEmail,
    role: 'admin',
    name: 'Responsive Audit Admin',
    active: true,
    status: 'approved'
  });

  const teacherCred = await createUserWithEmailAndPassword(auth, teacherEmail, testPassword);
  await setDoc(doc(db, 'users', teacherCred.user.uid), {
    email: teacherEmail,
    role: 'teacher',
    name: 'Responsive Audit Teacher',
    active: true,
    status: 'approved'
  });

  const studentCred = await createUserWithEmailAndPassword(auth, studentEmail, testPassword);
  await setDoc(doc(db, 'users', studentCred.user.uid), {
    email: studentEmail,
    role: 'student',
    name: 'Responsive Audit Student',
    studentId: 'STU-AUDIT-001',
    class: '10',
    rollNumber: '01',
    active: true,
    status: 'approved'
  });
  console.log('[PROVISIONING SUCCESS] Roles ready: Admin, Teacher, Student.\n');

  const viewports = [320, 360, 375, 390, 412, 430, 480, 600, 768, 820, 912, 1024, 1280, 1366, 1440, 1536, 1920, 2560];
  const screenshotViewports = [320, 390, 768, 1280, 1920];

  const auditResults = [];
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('Failed to load resource') && !text.includes('websocket')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  async function testRouteGroup(groupName, routes) {
    console.log(`\n--- TESTING ${groupName.toUpperCase()} ROUTES (${routes.length} routes x ${viewports.length} viewports) ---`);

    for (const route of routes) {
      let routePassCount = 0;
      try {
        await page.setViewportSize({ width: 1280, height: 850 });
        await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(100);

        for (const width of viewports) {
          await page.setViewportSize({ width, height: 850 });
          await page.waitForTimeout(30);

          const pageOverflow = await page.evaluate(() => {
            const body = document.body;
            const html = document.documentElement;
            const scrollW = Math.max(body.scrollWidth, html.scrollWidth);
            const innerW = window.innerWidth;
            return {
              scrollWidth: scrollW,
              innerWidth: innerW,
              hasOverflow: scrollW > innerW + 4 // 4px tolerance for subpixel render rounding
            };
          });

          if (!pageOverflow.hasOverflow) {
            routePassCount++;
          }

          auditResults.push({
            group: groupName,
            route,
            width,
            status: 'SUCCESS',
            hasOverflow: pageOverflow.hasOverflow,
            scrollWidth: pageOverflow.scrollWidth,
            innerWidth: pageOverflow.innerWidth
          });

          // Capture screenshots for representative routes and key viewports
          if (screenshotViewports.includes(width) && (
            route === '/' || 
            route === '/fee-structure' || 
            route === '/notices' || 
            route === '/account' ||
            route === '/account-admin' ||
            route === '/teacher-salary' ||
            route === '/login' ||
            route === '/admin'
          )) {
            const cleanName = route === '/' ? 'home' : route.replace(/[^a-zA-Z0-9]/g, '_');
            const filePath = `${screenshotDir}/${groupName}_${cleanName}_${width}px.png`;
            await page.screenshot({ path: filePath, fullPage: false });
          }
        }
        console.log(`  ✓ [${groupName}] Route: ${route.padEnd(20)} [${routePassCount}/${viewports.length} viewports PASS]`);
      } catch (err) {
        console.log(`  ✗ [${groupName}] Route: ${route.padEnd(20)} [LOAD ERROR: ${err.message}]`);
        auditResults.push({
          group: groupName,
          route,
          width: 0,
          status: 'ERROR',
          error: err.message
        });
      }
    }
  }

  // 1. PUBLIC ROUTES
  const publicRoutes = [
    '/',
    '/about',
    '/facilities',
    '/gallery',
    '/calendar',
    '/events',
    '/admission',
    '/fee-structure',
    '/notices',
    '/contact',
    '/faq',
    '/alumni'
  ];
  await testRouteGroup('public', publicRoutes);

  // 2. AUTH ROUTES
  const authRoutes = [
    '/login',
    '/forgot-password',
    '/reset-password'
  ];
  await testRouteGroup('auth', authRoutes);

  async function loginAs(email) {
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
  }

  // 3. STUDENT ROUTES
  console.log('\n[AUTH] Logging in as Student...');
  await loginAs(studentEmail);
  const studentRoutes = ['/account', '/result', '/profile'];
  await testRouteGroup('student', studentRoutes);

  // 4. TEACHER ROUTES
  console.log('\n[AUTH] Logging in as Teacher...');
  await loginAs(teacherEmail);
  const teacherRoutes = ['/teacher-salary', '/admin', '/result', '/profile'];
  await testRouteGroup('teacher', teacherRoutes);

  // 5. ADMIN ROUTES
  console.log('\n[AUTH] Logging in as Admin...');
  await loginAs(adminEmail);
  const adminRoutes = [
    '/admin',
    '/account-admin',
    '/salary-admin',
    '/admin-admissions',
    '/user-approvals',
    '/iemis',
    '/settings',
    '/profile'
  ];
  await testRouteGroup('admin', adminRoutes);

  // 6. ADMIN ACCOUNT-ADMIN TABS RESPONSIVENESS
  console.log('\n--- TESTING ADMIN FINANCIAL MANAGEMENT SUB-TABS ---');
  await page.goto('http://localhost:3000/account-admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const adminTabs = [
    'Simple Ledger & Cash Collection',
    'Student Remit Bills',
    'Daily Register & Cash Book',
    'Financial Transactions & Refunds',
    'Institutional Fee Structure',
    'Scholarship & Concessions',
    'Reports & Analytics'
  ];

  for (const tabLabel of adminTabs) {
    try {
      const button = page.locator(`button:has-text("${tabLabel}")`).first();
      if (await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(200);
      }
      let tabPassCount = 0;
      for (const width of viewports) {
        await page.setViewportSize({ width, height: 850 });
        await page.waitForTimeout(30);

        const pageOverflow = await page.evaluate(() => {
          const body = document.body;
          const html = document.documentElement;
          const scrollW = Math.max(body.scrollWidth, html.scrollWidth);
          const innerW = window.innerWidth;
          return {
            scrollWidth: scrollW,
            innerWidth: innerW,
            hasOverflow: scrollW > innerW + 4
          };
        });

        if (!pageOverflow.hasOverflow) {
          tabPassCount++;
        }

        auditResults.push({
          group: 'admin-tab',
          route: `/account-admin#${tabLabel}`,
          width,
          status: 'SUCCESS',
          hasOverflow: pageOverflow.hasOverflow,
          scrollWidth: pageOverflow.scrollWidth,
          innerWidth: pageOverflow.innerWidth
        });
      }
      console.log(`  ✓ Sub-Tab: ${tabLabel.padEnd(35)} [${tabPassCount}/${viewports.length} viewports PASS]`);
    } catch (err) {
      console.log(`  ✗ Sub-Tab: ${tabLabel} ERROR: ${err.message}`);
    }
  }

  // SUMMARY
  const overflowFailures = auditResults.filter(r => r.hasOverflow);
  const errorFailures = auditResults.filter(r => r.status === 'ERROR');

  console.log(`\n==================================================`);
  console.log(`REAL RESPONSIVE UI AUDIT SUMMARY (PLAYWRIGHT CHROMIUM)`);
  console.log(`==================================================`);
  console.log(`Total Route-Viewport Executions:     ${auditResults.length}`);
  console.log(`Horizontal Page Overflow Violations: ${overflowFailures.length}`);
  console.log(`Navigation / Load Errors:            ${errorFailures.length}`);
  console.log(`Console Exceptions Caught:           ${consoleErrors.length}`);

  if (overflowFailures.length > 0) {
    console.log('\nOVERFLOW VIOLATIONS:');
    overflowFailures.slice(0, 10).forEach(f => {
      console.log(`  - [${f.group}] Route: ${f.route} | Width: ${f.width}px | Scroll: ${f.scrollWidth}px vs Window: ${f.innerWidth}px`);
    });
  } else {
    console.log('\n[PASS] ZERO HORIZONTAL PAGE OVERFLOW DETECTED ACROSS ALL 18 VIEWPORTS AND ALL ROLES!');
  }

  const screenshotsTaken = fs.readdirSync(screenshotDir);
  console.log(`Screenshots Captured: ${screenshotsTaken.length} files saved in ${screenshotDir}`);
  console.log('Sample Screenshots:');
  screenshotsTaken.slice(0, 10).forEach(f => console.log(`  - ${f}`));

  await browser.close();
  process.exit(overflowFailures.length === 0 ? 0 : 1);
}

runResponsiveAudit().catch(err => {
  console.error('Fatal responsive audit error:', err);
  process.exit(1);
});
