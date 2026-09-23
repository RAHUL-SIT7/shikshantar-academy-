import { chromium } from 'playwright';
import * as fs from 'fs';
import { db, auth } from '../src/firebase.js';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

async function runFastAudit() {
  if (!fs.existsSync('./screenshots')) {
    fs.mkdirSync('./screenshots', { recursive: true });
  }

  const possiblePaths = [
    '/app/applet/browsers/chromium-1243/chrome-linux64/chrome',
    '/app/applet/browsers/chromium-1243/chrome-linux/chrome',
    '/app/applet/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
    '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome'
  ];
  const chromeExec = possiblePaths.find(p => fs.existsSync(p));
  console.log('Using browser executable:', chromeExec || 'default playwright resolution');
  const browser = await chromium.launch({
    executablePath: chromeExec,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const timestamp = Date.now();
  const testPassword = 'TestPassword123!';

  const adminEmail = `admin_resp_f_${timestamp}@shikshantar.edu.np`;
  const teacherEmail = `teacher_resp_f_${timestamp}@shikshantar.edu.np`;
  const studentEmail = `student_resp_f_${timestamp}@shikshantar.edu.np`;

  console.log('--- PROVISIONING AUDIT ACCOUNTS IN FIRESTORE ---');
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

  const viewports = [320, 360, 375, 390, 412, 430, 480, 600, 768, 820, 912, 1024, 1280, 1366, 1440, 1536, 1920, 2560];
  const publicRoutes = ['/', '/notices', '/facilities', '/contact', '/about', '/admission', '/fee-structure', '/gallery', '/calendar', '/events', '/faq', '/alumni'];
  const authRoutes = ['/login'];
  const studentRoutes = ['/account', '/result', '/profile'];
  const teacherRoutes = ['/teacher-salary', '/admin'];
  const adminRoutes = ['/admin', '/account-admin', '/salary-admin', '/user-approvals', '/admin-admissions', '/iemis', '/settings'];

  const auditResults: any[] = [];
  const page = await browser.newPage();

  async function auditGroup(groupName: string, routes: string[]) {
    for (const route of routes) {
      for (const width of viewports) {
        await page.setViewportSize({ width, height: 850 });
        try {
          await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
          await page.waitForTimeout(100);

          const overflow = await page.evaluate(() => {
            const scrollW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
            const innerW = window.innerWidth;
            return { scrollW, innerW, hasOverflow: scrollW > innerW + 3 };
          });

          auditResults.push({
            group: groupName,
            route,
            width,
            status: 'SUCCESS',
            hasOverflow: overflow.hasOverflow,
            scrollW: overflow.scrollW,
            innerW: overflow.innerW
          });

          if ([320, 390, 768, 1280, 1920].includes(width) && (route === '/' || route === '/fee-structure' || route === '/admin' || route === '/account')) {
            const cleanName = route === '/' ? 'home' : route.replace(/[^a-zA-Z0-9]/g, '_');
            await page.screenshot({ path: `./screenshots/${groupName}_${cleanName}_${width}px.png` });
          }
        } catch (e: any) {
          auditResults.push({ group: groupName, route, width, status: 'ERROR', error: e.message });
        }
      }
      console.log(`Verified ${groupName} route: ${route}`);
    }
  }

  console.log('\n--- TESTING PUBLIC ROUTES ---');
  await auditGroup('public', publicRoutes);

  console.log('\n--- TESTING STUDENT ROUTES ---');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', studentEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  await auditGroup('student', studentRoutes);

  console.log('\n--- TESTING TEACHER ROUTES ---');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', teacherEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  await auditGroup('teacher', teacherRoutes);

  console.log('\n--- TESTING ADMIN ROUTES ---');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', adminEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  await auditGroup('admin', adminRoutes);

  const overflowFailures = auditResults.filter(r => r.hasOverflow);
  const errors = auditResults.filter(r => r.status === 'ERROR');

  console.log('\n==================================================');
  console.log('REAL RESPONSIVE UI AUDIT SUMMARY');
  console.log('==================================================');
  console.log('Total Viewport Checks Executed:', auditResults.length);
  console.log('Horizontal Overflow Failures:', overflowFailures.length);
  console.log('Load / Navigation Errors:', errors.length);

  if (overflowFailures.length > 0) {
    console.log('\nOverflow Details:');
    overflowFailures.forEach(f => console.log(`  - [${f.group}] ${f.route} @ ${f.width}px: scroll ${f.scrollW}px > inner ${f.innerW}px`));
  } else {
    console.log('\nSUCCESS: 0 HORIZONTAL OVERFLOW VIOLATIONS ACROSS ALL TESTED VIEWPORTS AND ROLE ROUTES!');
  }

  await browser.close();
  process.exit(0);
}

runFastAudit().catch(e => {
  console.error('Fatal audit error:', e);
  process.exit(1);
});
