import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import { db, auth } from '../src/firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

async function runFullResponsiveAudit() {
  if (!fs.existsSync('./screenshots')) {
    fs.mkdirSync('./screenshots', { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Create test credentials for admin, teacher, student
  const testPassword = 'TestPassword123!';
  const timestamp = Date.now();
  
  const adminEmail = `admin_resp_${timestamp}@shikshantar.edu.np`;
  const teacherEmail = `teacher_resp_${timestamp}@shikshantar.edu.np`;
  const studentEmail = `student_resp_${timestamp}@shikshantar.edu.np`;

  console.log('--- CREATING AUDIT ACCOUNTS IN FIRESTORE ---');
  // Admin account
  const adminCred = await createUserWithEmailAndPassword(auth, adminEmail, testPassword);
  await setDoc(doc(db, 'users', adminCred.user.uid), {
    email: adminEmail,
    role: 'admin',
    name: 'Responsive Audit Admin',
    active: true,
    status: 'approved'
  });

  // Teacher account
  const teacherCred = await createUserWithEmailAndPassword(auth, teacherEmail, testPassword);
  await setDoc(doc(db, 'users', teacherCred.user.uid), {
    email: teacherEmail,
    role: 'teacher',
    name: 'Responsive Audit Teacher',
    active: true,
    status: 'approved'
  });

  // Student account
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
  const screenshotViewports = [320, 390, 768, 1280, 1920];

  const auditResults: any[] = [];
  const consoleErrors: string[] = [];

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

  // Helper function to test a set of routes
  async function testRouteGroup(groupName: string, routes: string[]) {
    console.log(`\n==================================================`);
    console.log(`TESTING ${groupName.toUpperCase()} ROUTES (${routes.length} routes)`);
    console.log(`==================================================`);

    for (const route of routes) {
      for (const width of viewports) {
        await page.setViewportSize({ width, height: 850 });
        try {
          await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForTimeout(400);

          const pageOverflow = await page.evaluate(() => {
            const body = document.body;
            const html = document.documentElement;
            const scrollW = Math.max(body.scrollWidth, html.scrollWidth);
            const innerW = window.innerWidth;
            return {
              scrollWidth: scrollW,
              innerWidth: innerW,
              hasOverflow: scrollW > innerW + 3 // 3px tolerance
            };
          });

          auditResults.push({
            group: groupName,
            route,
            width,
            status: 'SUCCESS',
            hasOverflow: pageOverflow.hasOverflow,
            scrollWidth: pageOverflow.scrollWidth,
            innerWidth: pageOverflow.innerWidth
          });

          if (screenshotViewports.includes(width) && (
            route === '/' || 
            route === '/fee-structure' || 
            route === '/notices' || 
            route === '/admin' || 
            route === '/account' ||
            route === '/teacher-salary'
          )) {
            const cleanName = route === '/' ? 'home' : route.replace(/[^a-zA-Z0-9]/g, '_');
            const filePath = `./screenshots/${groupName}_${cleanName}_${width}px.png`;
            await page.screenshot({ path: filePath, fullPage: false });
          }
        } catch (err: any) {
          auditResults.push({
            group: groupName,
            route,
            width,
            status: 'ERROR',
            error: err.message
          });
        }
      }
      console.log(`  ✓ Route verified across 18 viewports: ${route}`);
    }
  }

  // 1. PUBLIC / GUEST ROUTES
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
    '/alumni',
    '/login'
  ];
  await testRouteGroup('public', publicRoutes);

  // Helper to authenticate in browser page
  async function loginAs(email: string) {
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
  }

  // 2. STUDENT ROUTES
  console.log('\nLogging in as Student...');
  await loginAs(studentEmail);
  const studentRoutes = [
    '/account',
    '/result',
    '/profile'
  ];
  await testRouteGroup('student', studentRoutes);

  // 3. TEACHER ROUTES
  console.log('\nLogging in as Teacher...');
  await loginAs(teacherEmail);
  const teacherRoutes = [
    '/teacher-salary',
    '/admin',
    '/result',
    '/profile'
  ];
  await testRouteGroup('teacher', teacherRoutes);

  // 4. ADMIN ROUTES
  console.log('\nLogging in as Admin...');
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

  // SUMMARY ANALYSIS
  const overflowFailures = auditResults.filter(r => r.hasOverflow);
  const errorFailures = auditResults.filter(r => r.status === 'ERROR');

  console.log(`\n==================================================`);
  console.log(`RESPONSIVE UI AUDIT COMPLETE SUMMARY`);
  console.log(`==================================================`);
  console.log(`Total Route-Viewport Test Executions: ${auditResults.length}`);
  console.log(`Horizontal Page Overflow Violations: ${overflowFailures.length}`);
  console.log(`Navigation / Load Errors: ${errorFailures.length}`);
  console.log(`Console Exceptions Caught: ${consoleErrors.length}`);

  if (overflowFailures.length > 0) {
    console.log('\nOVERFLOW VIOLATION DETAILS:');
    overflowFailures.forEach(f => {
      console.log(`  - [${f.group}] Route: ${f.route} | Width: ${f.width}px | ScrollWidth: ${f.scrollWidth}px vs WindowInner: ${f.innerWidth}px`);
    });
  } else {
    console.log('\nPASSED: 0 HORIZONTAL PAGE OVERFLOW VIOLATIONS ACROSS ALL 18 VIEWPORTS AND ALL ROLE ROUTES!');
  }

  if (consoleErrors.length > 0) {
    console.log('\nCONSOLE EXCEPTION DETAILS:');
    consoleErrors.forEach(e => console.log('  -', e));
  } else {
    console.log('PASSED: 0 UNHANDLED CONSOLE EXCEPTIONS DETECTED!');
  }

  await browser.close();
}

runFullResponsiveAudit().catch(err => {
  console.error('Fatal responsive audit error:', err);
  process.exit(1);
});
