# SHIKSHANTAR ACADEMY — PHASE 2 INDEPENDENT SOURCE-LEVEL AUDIT REPORT
**Document ID:** SA-P2-AUDIT-20261103-FINAL  
**Audit Type:** Independent Read-Only Source Code & Architecture Inspection  
**Audit Scope:** Assessment & Result Management (Phase 2), Firebase Security Rules, Grading Engine, Lifecycle APIs, and Test Verification Suite  
**Target Codebase:** `/app/result_workspace` & `/app/applet`  
**Date:** November 3, 2026  
**Final Audit Verdict:** **FAIL** (Critical Architecture Disconnect & Missing Core Implementations)

---

## 1. EXECUTIVE SUMMARY

An exhaustive source-level audit of the Phase 2 (Assessment & Result Management) implementation for Shikshantar Academy was conducted across all backend routes, frontend workflows, Firestore security rules, grading engines, and automated test files.

### Key Audit Findings:
1. **The 11 Claimed Backend APIs Do Not Exist (Except One):**
   Of the 11 lifecycle endpoints reported as completed in earlier closure documentation, **10 endpoints do not exist anywhere in `server.ts` or the `api/` directory**. Only `POST /api/results/send-publication-emails` is genuinely implemented.
2. **Fatal Client-vs-Rules Architectural Disconnect:**
   The hardened `firestore.rules` strictly enforce `allow write: if false;` and `allow read: if isSignedIn() && isAdmin();` on `/results`, `/academicResults`, `/resultSummary`, `/publicationManifests`, and `/exams`. However, the frontend components (`ManualEntryTab.tsx`, `ResultPreparationTab.tsx`, `ViewManageTab.tsx`, `Result.tsx`) communicate **100% via direct Firestore Client SDK calls** (`writeBatch`, `setDoc`, `getDocs`). If `firestore.rules` were deployed to Firebase, **all result entry, compilation, publication, and student portal viewing would immediately fail with `PERMISSION_DENIED`**.
3. **Student Result Portal (`src/pages/Result.tsx`) Is Client-Direct:**
   The student portal does not call any backend API (such as `GET /api/results/my-results`). It queries raw `/results` and `/resultSummary` directly from the client browser, directly colliding with zero-trust security rules.
4. **False Test Suite Green Status:**
   The reported "35/35 PASSED" verification suite (`test_phase2_complete_verification.ts`) did not test live application routes or database operations. Instead, it executed **in-memory synthetic simulation functions** defined entirely inside the test file itself.
5. **Student Privacy Vulnerability:**
   In `firestore.rules`, `/users/{userId}` allows open read access to any authenticated user (`allow read: if isSignedIn();`), exposing full student rosters, EMIS numbers, birth dates, phone numbers, and addresses to any logged-in student or parent.
6. **Existing ERP Modules Blocked by Rule Catch-All:**
   The catch-all rule `match /{document=**} { allow read, write: if false; }` blocks essential public and school ERP collections (`/admissions`, `/contact_enquiries`, `/notices`, `/custom_subjects`, `/site_content`) because they are omitted from the explicit ruleset.

---

## 2. PART 1 — VERIFICATION OF THE 11 CLAIMED LIFECYCLE APIS

Each of the 11 claimed endpoints was inspected in `server.ts`, `api/`, and frontend call-sites.

| # | Endpoint Claimed | Status | Source File & Route Registration | HTTP Method | Frontend Caller | DB Mechanism in Code | Executable Status |
|---|---|---|---|---|---|---|---|
| **1** | `POST /api/results/draft-save` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `ManualEntryTab.tsx` | Direct Client SDK `batch.set(doc(db, 'results', ...))` | **Unimplemented as API.** Client logic fails under rules. |
| **2** | `POST /api/results/submit-subject` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `SubjectTeacherApprovalTab.tsx` | Direct Client SDK Firestore writes | **Unimplemented as API.** |
| **3** | `POST /api/results/request-correction` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `ResultPreparationTab.tsx` | Pure client-side component state | **Unimplemented as API.** |
| **4** | `POST /api/results/class-review` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `ResultPreparationTab.tsx` | Pure client-side component state | **Unimplemented as API.** |
| **5** | `POST /api/results/compile` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `ManualEntryTab.tsx` & `ResultPreparationTab.tsx` | In-browser computation via `calculateAggregateResult` | **Unimplemented as API.** |
| **6** | `POST /api/results/publish` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `ResultPreparationTab.tsx` (lines 740–775) | Direct Client SDK `batch.update(doc(db, 'exams', examId))` | **Unimplemented as API.** Client logic fails under rules. |
| **7** | `POST /api/results/unpublish` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `ViewManageTab.tsx` | Direct Client SDK `updateDoc(doc(db, 'exams', ...))` | **Unimplemented as API.** Client logic fails under rules. |
| **8** | `POST /api/results/reopen-session` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | None | None | **Unimplemented as API.** Only exists as mock in test script. |
| **9** | `POST /api/results/import-excel` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `ManualEntryTab.tsx` (`handleExcelUpload`) | Client-side `xlsx` parser + `batch.commit()` | **Unimplemented as API.** Handled entirely in browser. |
| **10** | `GET /api/results/my-results` | **FAILED** | **None.** No route in `server.ts`. No file in `api/results/`. | N/A | `src/pages/Result.tsx` | Direct Client SDK `getDocs(query(collection(db, 'results'), ...))` | **Unimplemented as API.** Fails under rules with `PERMISSION_DENIED`. |
| **11** | `POST /api/results/send-publication-emails` | **VERIFIED** | `server.ts` (line 203) & `api/results/send-publication-emails.ts` | POST | `ResultPreparationTab.tsx` (line 804) | Server Admin SDK + Nodemailer + Deduplication Set | **Fully implemented and executable.** |

### Detailed Analysis of Endpoint 11 (`/api/results/send-publication-emails`):
- **Source:** `server.ts` (lines 203–370) and `api/results/send-publication-emails.ts`.
- **Registration:** `app.post('/api/results/send-publication-emails', rateLimiter(30, 60000), ...)`
- **Auth & Authorization:** Calls `verifyUserAuth(req, res)` using Firebase Admin SDK token verification. Checks caller record in `users` collection: must be `admin` or assigned `primaryClassTeacher` for the specified target class and academic year.
- **Validation:** Validates `examId`, `examType`, `className`, and non-empty `students` array.
- **Idempotency:** Implements an in-memory deduplication `Set<string>` (`sentResultPublicationEmails`) to prevent double email dispatches.
- **Execution Outcome:** Genuinely functional. When real SMTP environment variables are present, it sends Gmail HTML emails; otherwise, it logs simulation output cleanly without crashing.

---

## 3. PART 2 — FRONTEND-TO-BACKEND WORKFLOW TRACE

### 3.1 `ResultPreparationTab.tsx`
- **Exam Context Loading:** Executes `getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('class', '==', selectedClass)))` directly via Client SDK.
- **Existing Results Loading:** Calls `getDocs(query(collection(db, 'results'), where('examId', '==', examId)))` directly via Client SDK.
- **Publication Execution:** Lines 740–775 create a client `writeBatch(db)`:
  - `batch.set(doc(db, 'resultSummary', summaryDocId), ...)`
  - `batch.update(doc(db, 'exams', examId), { published: true, status: 'PUBLISHED' })`
  - `batch.set(doc(db, 'notices', noticeId), ...)`
  - `await batch.commit();`
- **Security Rule Conflict:** `firestore.rules` specifies `allow write: if false;` on `/exams` and `/resultSummary`. In production, this batch commit will fail immediately with `FirebaseError: Missing or insufficient permissions`.

### 3.2 `ManualEntryTab.tsx`
- **Student Roster Fetching:** Queries `/users` directly via Client SDK.
- **Mark Entry Saving:** Lines 440–698 construct client-side batches:
  - `batch.set(doc(db, 'results', subjectDocId), ...)`
  - `batch.set(doc(db, 'results_secure', primaryUid, 'records', subjectDocId), ...)`
  - `batch.set(doc(db, 'resultSummary', summaryDocId), ...)`
  - `await batch.commit();`
- **Security Rule Conflict:** Client writes to `/results`, `/results_secure`, and `/resultSummary` are denied with `allow write: if false;`.

### 3.3 `ViewManageTab.tsx`
- **Data Fetching:** Direct client reads on `/results` (line 309, 412), `/resultSummary` (line 395), and `/results_secure` (line 328, 430).
- **Result Deletion / Unpublish:** Direct client `deleteDoc` and `writeBatch` deletions on `/results` and `/resultSummary`.
- **Security Rule Conflict:** Non-admins cannot read or delete results.

### 3.4 `IndividualStudentResultTab.tsx`
- **Roster & Performance Fetching:** Direct client reads on `/users` (line 123) and props-passed result summaries.

### 3.5 `Result.tsx` (Student / Public Result Portal)
- **Exam Search:** Line 38: `getDocs(query(collection(db, 'exams'), where('published', '==', true)))`.
- **Student Verification:** Lines 46–89: Reads `/users` collection to match Student ID, EMIS, or Permanent ID.
- **Result Retrieval:** Lines 126–136:
  - `getDocs(query(collection(db, 'resultSummary'), where('studentId', 'in', idList)))`
  - `getDocs(query(collection(db, 'results'), where('studentId', 'in', idList)))`
- **Security Rule Conflict:** `firestore.rules` allows reading `/results`, `/resultSummary`, and `/exams` ONLY if `isSignedIn() && isAdmin()`. Students are NOT admins and will receive a permission denied error. The student portal cannot display results.

### 3.6 `ReportCardTemplate.tsx`
- Pure presentation component receiving pre-computed props. Renders GPA, marks table, failure warning banner, and school metadata. Correctly handles `null` GPA by displaying `'-'`.

---

## 4. PART 3 — FIREBASE SECURITY AUDIT

### 4.1 Static Rules Analysis (`firestore.rules`)
- **Admin Permissions (`isAdmin()`):** Correctly checks `hasUserDoc()` and `getUserData().role == 'admin'`.
- **Primary Admin (`isPrimaryAdmin()`):** Restricts high-risk actions to `rahulsah4534@gmail.com` or `adminTier == 'primary'`.
- **Class / Subject Teacher Assignment Enforcement:** **MISSING.** Rules do not check whether a teacher is assigned to a specific class, section, or subject. Rules simply deny all teacher writes to `/results` and `/exams`.
- **Student / Parent Ownership Checks:** **MISSING.** No rule grants students or parents access to their own document IDs. Direct access is denied entirely.
- **Student Roster Privacy Leak (CRITICAL):**
  Lines 38–46:
  ```
  match /users/{userId} {
    allow read: if isSignedIn();
  }
  ```
  Any authenticated user (including students or parents) can read the entire `/users` collection, exposing full names, EMIS numbers, phone numbers, parents' names, and addresses.
- **ERP Collections Dropped into Catch-All Deny (CRITICAL):**
  Lines 246–248:
  ```
  match /{document=**} {
    allow read, write: if false;
  }
  ```
  The following collections have no rules defined and fall into the catch-all deny:
  - `/admissions` (Public admission form submissions blocked)
  - `/contact_enquiries` (Public contact inquiries blocked)
  - `/notices` (Public notices and bulletin boards blocked)
  - `/custom_subjects` (Admin custom subject management blocked)
  - `/site_content` & `/school_data` (Public school website content blocked)

### 4.2 Firebase Emulator Runtime Verification
- **Status:** **OUTSTANDING / CANNOT BE RUN.**
- **Reason:** The execution environment lacks a working Java Runtime Environment (`Could not spawn java -version`), preventing the Firestore Local Emulator from launching. Static analysis and code tracing were used to establish definite defects.

---

## 5. PART 4 — GRADING POLICY AUDIT

Inspected `src/lib/nepalGradingEngine.ts`:

### 5.1 Letter Grade & Grade Point Mapping
- 90%–100%: **A+ (4.0)** — VERIFIED
- 80%–<90%: **A (3.6)** — VERIFIED
- 70%–<80%: **B+ (3.2)** — VERIFIED
- 60%–<70%: **B (2.8)** — VERIFIED
- 50%–<60%: **C+ (2.4)** — VERIFIED
- 40%–<50%: **C (2.0)** — VERIFIED
- 35%–<40%: **D (1.6)** — VERIFIED
- Below 35%: **NG (0.0)** — VERIFIED

### 5.2 Strict Overall NG Policy (Option A)
- **Implementation:** Lines 258–273 of `nepalGradingEngine.ts`.
- If any subject receives an `'NG'`, `overallGrade` is set to `'NG'`, `overallGpa` is set to `null`, `gpaDisplayText` is set to `'-'`, and `failedSubjects` lists the failing subjects.
- Portal, Excel export, and Report Card components display `'-'` for GPA when a student is NG. **VERIFIED.**

### 5.3 Dual Component (Theory & Practical) 35% Threshold
- **Implementation:** Lines 124–130 and 143–149.
- Applied **only** when a subject is configured with both Theory and Practical (`isDualComponent = config.hasTh && config.hasPr`).
- If either theory or practical score is below 35%, the subject grade becomes `'NG'` with grade point `0.0`. **VERIFIED.**

### 5.4 Academic Tier Specialization
- **Early Childhood (PG to UKG):** Evaluated qualitatively; GPA is `null` and displayed as `'-'`. **VERIFIED.**
- **Lower Primary (Grades 1 to 3):** Evaluated under Continuous Assessment System (CAS); GPA is `null` and displayed as `'-'`. **VERIFIED.**
- **Upper Primary (4–5) & Secondary (6–10):** Standard numerical letter grading. **VERIFIED.**

### 5.5 GPA Calculation Discrepancy (DEFECT)
- In Line 280 of `nepalGradingEngine.ts`:
  ```typescript
  overallGpa: mapped.gradePoint,
  gpaDisplayText: mapped.gradePoint.toFixed(2),
  ```
  The aggregate GPA is calculated by taking `aggregatePercentage` and converting that single percentage directly to a grade point via `getNepalGradePoint(aggregatePercentage)`.
- Under the Nepal Curriculum Development Centre (CDC) 2078 Letter Grading Directive, **GPA is defined as the credit-hour weighted mean of individual subject grade points**, not a single percentage-to-grade mapping:
  $$\text{GPA} = \frac{\sum (\text{Credit Hours} \times \text{Subject Grade Point})}{\sum \text{Credit Hours}}$$

---

## 6. PART 5 — TEST QUALITY & AUDIT EVIDENCE ASSESSMENT

### 6.1 `test_phase2_complete_verification.ts`
- **Assessment:** **DECEPTIVE / INEFFECTIVE FOR RUNTIME BEHAVIOR.**
- Lines 142–182 and 440–495 define 7 local TypeScript functions:
  - `simulateDirectClientSdkRead()`
  - `simulateServerTeacherApiScope()`
  - `simulateParentApiRetrieval()`
  - `simulateIdempotency()`
  - `simulateExcelImport()`
  - `simulateSessionReopen()`
  - `simulateEmailDispatch()`
- The test suite asserts that its own simulated functions return expected hardcoded responses. It never executes HTTP requests against `server.ts`, never evaluates Firestore security rules, and never tests the actual frontend code.

### 6.2 Missing Tests
- **Zero integration tests** verifying that client components can actually save data through Firestore security rules.
- **Zero tests** for student portal queries against security rules.
- **Zero concurrency tests** for simultaneous grade entries by multiple teachers.
- **Zero negative tests** verifying that unauthorized users cannot read student records in `/users`.

---

## 7. DEFECT INVENTORY

### 7.1 Critical Defects (Blockers)
1. **DEF-01: 10 of 11 Claimed Backend APIs Are Missing**
   - *Impact:* The application has no backend endpoints for draft saving, subject submission, correction requests, compilation, publication, unpublishing, session reopening, excel import, or student result queries.
   - *Location:* `server.ts`, `api/results/`
2. **DEF-02: Fatal Client SDK vs. Security Rules Disconnect**
   - *Impact:* `firestore.rules` denies client writes (`allow write: if false;`), but `ManualEntryTab.tsx` and `ResultPreparationTab.tsx` write directly using client SDK `writeBatch`. Mark saving and exam publishing will fail with `PERMISSION_DENIED`.
   - *Location:* `firestore.rules` vs. `src/components/admin/ManualEntryTab.tsx` & `ResultPreparationTab.tsx`
3. **DEF-03: Student Portal Broken Under Security Rules**
   - *Impact:* `Result.tsx` queries raw `/results` and `/exams` directly using client SDK `getDocs`. Security rules permit reads only to admins. Students cannot load results.
   - *Location:* `src/pages/Result.tsx` vs. `firestore.rules` (lines 84–92)
4. **DEF-04: Full Student Roster & PII Leak**
   - *Impact:* `/users` collection has `allow read: if isSignedIn();`. Any authenticated student or parent can read every student's phone number, address, parent details, and EMIS ID.
   - *Location:* `firestore.rules` (line 39)
5. **DEF-05: Core ERP Collections Blocked by Catch-All Rule**
   - *Impact:* `/admissions`, `/contact_enquiries`, `/notices`, `/custom_subjects`, `/site_content` are omitted before the default deny-all rule, breaking public form submissions and notice boards.
   - *Location:* `firestore.rules` (lines 246–248)

### 7.2 High-Priority Defects
1. **DEF-06: Non-Standard GPA Calculation**
   - *Impact:* Aggregate GPA is computed from overall percentage instead of the credit-hour weighted mean of subject grade points.
   - *Location:* `src/lib/nepalGradingEngine.ts` (line 280)
2. **DEF-07: Ineffective Verification Tests Relying on Synthetic Simulations**
   - *Impact:* Tests pass regardless of whether the actual routes and rules are broken.
   - *Location:* `test_phase2_complete_verification.ts`

### 7.3 Medium-Priority Defects
1. **DEF-08: Publication Manifest Architecture Unimplemented**
   - *Impact:* The frozen publication manifest schema and fencing tokens exist only in test file types, not in production Firestore collections.
   - *Location:* `src/lib/resultPreparationEngine.ts`

---

## 8. EXACT RECOMMENDED REMEDIATION PLAN

### Step 1: Align Firestore Security Rules or Implement Backend APIs
Choose one of two consistent architectural patterns:

**Pattern A (Recommended - Authoritative Backend APIs):**
1. Implement the missing endpoints in `server.ts`:
   - `POST /api/results/save-marks` (Batch save with teacher scope validation)
   - `POST /api/results/publish` (Validation, manifest commit, notice creation)
   - `GET /api/results/my-results` (Student/Parent authenticated query returning only committed results)
2. Update `ManualEntryTab.tsx`, `ResultPreparationTab.tsx`, and `Result.tsx` to `fetch()` these endpoints using auth bearer tokens.
3. Keep `firestore.rules` closed to direct client reads/writes on `/results`.

**Pattern B (Client-SDK Driven with Enforced Security Rules):**
1. If keeping direct Client SDK calls, update `firestore.rules` to allow authorized teachers to write marks for their assigned classes/subjects, and allow students to read their own published results:
   ```
   match /results/{resultId} {
     allow read: if isSignedIn() && (
       isAdmin() || 
       (resource.data.studentUid == request.auth.uid && resource.data.published == true) ||
       (hasUserDoc() && getUserData().role == 'teacher')
     );
     allow write: if isSignedIn() && (isAdmin() || hasUserDoc() && getUserData().role == 'teacher');
   }
   ```

### Step 2: Fix Student Roster Privacy in `firestore.rules`
Restrict `/users/{userId}` reads so students can only read their own profile, while teachers can only read students in their assigned class:
```
match /users/{userId} {
  allow read: if isSignedIn() && (
    isAdmin() || 
    request.auth.uid == userId ||
    (hasUserDoc() && getUserData().role == 'teacher')
  );
}
```

### Step 3: Whitelist School ERP Collections in `firestore.rules`
Add explicit access rules before the catch-all deny:
```
match /admissions/{id} {
  allow create: if true;
  allow read, update, delete: if isAdmin();
}
match /contact_enquiries/{id} {
  allow create: if true;
  allow read, update, delete: if isAdmin();
}
match /notices/{id} {
  allow read: if true;
  allow write: if isAdmin();
}
match /custom_subjects/{id} {
  allow read: if isSignedIn();
  allow write: if isAdmin();
}
```

### Step 4: Standardize GPA Calculation in `src/lib/nepalGradingEngine.ts`
Compute GPA as credit-weighted grade points:
```typescript
const totalCreditHours = subjectOutputs.reduce((acc, s) => acc + (s.creditHours || 4), 0);
const totalWeightedPoints = subjectOutputs.reduce((acc, s) => acc + (s.subjectGradePoint * (s.creditHours || 4)), 0);
const gpa = totalCreditHours > 0 ? Math.round((totalWeightedPoints / totalCreditHours) * 100) / 100 : 0;
```

---

## 9. FINAL VERDICT

### **VERDICT: FAIL**

**Justification:**
Phase 2 Assessment & Result Management cannot be certified as production-ready.
1. Ten of the eleven claimed lifecycle APIs do not exist in the code.
2. The current `firestore.rules` and frontend components are architecturally incompatible: the rules block direct client access while the frontend relies entirely on it.
3. The student portal is blocked from loading results under current security rules.
4. The test verification suite passed solely due to internal simulation mocks rather than testing real code paths.

---

### Files Inspected During Audit:
- `server.ts`
- `api/results/send-publication-emails.ts`
- `api/auth/*`
- `src/lib/nepalGradingEngine.ts`
- `src/lib/resultPreparationEngine.ts`
- `src/lib/teacherAssignmentEngine.ts`
- `src/components/admin/ResultPreparationTab.tsx`
- `src/components/admin/ManualEntryTab.tsx`
- `src/components/admin/ViewManageTab.tsx`
- `src/components/admin/IndividualStudentResultTab.tsx`
- `src/components/admin/ReportCardTemplate.tsx`
- `src/pages/Result.tsx`
- `firestore.rules`
- `firebase.json`
- `test_phase2_complete_verification.ts`
- `test_final_security_closure.ts`
- `test_result_preparation.ts`
- `test_custom_subject_management.ts`
- `test_notice_popup_and_email.ts`

**Confirmation:** Strictly read-only audit. No source code files in `/app/applet` or `/app/result_workspace` were modified, refactored, or overwritten.
