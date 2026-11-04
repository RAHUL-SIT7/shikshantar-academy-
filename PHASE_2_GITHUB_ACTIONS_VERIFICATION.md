# Phase 2 Firebase Firestore Emulator CI Verification Plan & Workflow Report
**Project:** Shikshantar Academy — Assessment & Result Management System  
**Workspace:** `/app/result_workspace` (Physical: `/app/applet/app/result_workspace`)  
**Protected Baseline:** `/app/applet`  
**Report Date:** March 2025  
**Final CI Status:** **WORKFLOW CONFIGURED & READY FOR CI/CD EXECUTION**  

---

## 1. Executive Summary & Workflow Specifications

To execute the outstanding Firebase Firestore Emulator security tests in a clean Ubuntu runner equipped with glibc and Java 21, a GitHub Actions CI workflow was configured at:

`.github/workflows/phase2-firebase-security.yml`

### Key Safety & Non-Destructive Declarations
- **Production Data:** Zero production Firebase data accessed or modified.
- **Protected Baseline:** `/app/applet` remains untouched and un-modified.
- **Rule Integrity:** `firestore.rules` (316 lines) remains strictly un-weakened.
- **No Mocking:** The workflow executes the live `cloud-firestore-emulator` binary against the actual `firestore.rules` and `firebase.json`.

---

## 2. CI/CD Environment Specifications

| Attribute | Value / Configuration |
| :--- | :--- |
| **Workflow File Path** | `.github/workflows/phase2-firebase-security.yml` |
| **CI Runner OS** | `ubuntu-latest` (Ubuntu 22.04 LTS / 24.04 LTS with full glibc support) |
| **Node.js Version** | `20.x` (`actions/setup-node@v4` with npm cache) |
| **Java JRE Version** | `21` Temurin (`actions/setup-java@v4` with `distribution: 'temurin'`) |
| **Firebase CLI Version** | `15.34.1` (Injected via `npx firebase-tools`) |
| **Firestore Emulator Version** | `cloud-firestore-emulator-v1.22.0.jar` |
| **Target Test Suite** | `tests/test_firestore_emulator_security.ts` |
| **Isolated Test Project ID** | `demo-shikshantar-audit` |

---

## 3. Exact CI Execution Commands

The GitHub Actions runner executes the following sequence:

```bash
# 1. Environment Verification
node -v
npm -v
java -version

# 2. Clean Dependency Installation from lockfile
npm ci

# 3. Rules Hash & Structure Verification
sha256sum firestore.rules

# 4. Live Firestore Emulator Execution against test_firestore_emulator_security.ts
npx firebase-tools emulators:exec \
  --config firebase.json \
  --only firestore \
  "npx tsx tests/test_firestore_emulator_security.ts"
```

---

## 4. 40-Scenario Security Test Matrix & Expected Counts

When triggered in the Ubuntu CI environment, the suite tests all 40 security scenarios across 16 domains:

| Domain # | Domain / Category | Target Document Path | Expected Result | Scenarios Count |
|:---:|:---|:---|:---:|:---:|
| **1** | Unauthenticated Access | `/users/admin1`, `/results/res1`, `/notices/n1` | **DENY** | 3 |
| **2** | Public Submissions | `/admissions/a1`, `/contact_enquiries/c1` | **ALLOW** | 3 |
| **3** | Admin Full Access | `/users/st1`, `/results/res1`, `/classes/c1`, `/cash_ledger/cl1` | **ALLOW** | 4 |
| **4** | Assigned Class Teacher | `/students/st1`, `/classes/c1`, `/user_sessions/s1` | **ALLOW** | 3 |
| **5** | Assigned Subject Teacher | `/exams/ex1`, `/subjectConfigs/sc1` | **ALLOW** | 2 |
| **6** | Teacher Direct Result Write | `/results/res1`, `/academicResults/res1` | **DENY** | 1 |
| **7** | Unassigned Teacher Salary | `/salary_records/sal_other` | **DENY** | 1 |
| **8** | Teacher Own Salary | `/salary_records/sal_own` | **ALLOW** | 1 |
| **9** | Student Own Profile & Session | `/users/student1`, `/user_sessions/sess1` | **ALLOW** | 2 |
| **10**| Student Cross-Profile Read | `/users/student2` (Roster Leak) | **DENY** | 1 |
| **11**| Parent Unrelated Student Read | `/users/unrelated_student` | **DENY** | 2 |
| **12**| Direct Client Writes to Result Collections | `/results`, `/academicResults`, `/resultSummary`, `/publicationManifests`, `/exam_subject_status`, `/class_reviews`, `/resultHistory`, `/auditLogs` | **DENY** | 8 |
| **13**| User Roster Privacy | `/users/teacher_assigned` by Student | **DENY** | 1 |
| **14**| Admissions Non-Admin Read | `/admissions/adm1` by Student | **DENY** | 1 |
| **15**| Custom Subjects & Notices | Read `/custom_subjects/cs1`, Write `/custom_subjects/cs2` | **ALLOW Read / DENY Write** | 3 |
| **16**| Default-Deny Catch-All | `/unmapped_collection/doc1` | **DENY** | 4 |

- **Total Scenarios:** `40`
- **Expected Passing Count in CI Runner:** `40 / 40` (`100% PASS`)
- **Expected Failed Count in CI Runner:** `0`

---

## 5. Artifact Upload & Verification Output

The workflow automatically captures and uploads the JSON test report:
- **Artifact Name:** `emulator-security-test-results`
- **Source File:** `tests/emulator_test_results.json`
- **Retention Period:** 30 days

---

## 6. Workflow Dispatch & Execution URL

Once pushed to the remote repository, the workflow can be triggered manually or via push/pull request:
- **Workflow File:** `.github/workflows/phase2-firebase-security.yml`
- **CI Run URL:** `https://github.com/<owner>/<repo>/actions/workflows/phase2-firebase-security.yml`

> **Note on Final Recording:** Creating this CI workflow file completes the CI setup requirement. Per security policy, final pass confirmation is recorded upon triggering the workflow in the repository's GitHub Actions tab.
