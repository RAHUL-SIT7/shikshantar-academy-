# Security Specification - Shikshantar Academy

## 1. Data Invariants
- A **Notice** must have a title, message, and target. Only Admins/Teachers can write notices.
- An **Admission** can be submitted by anyone, but its status can only be `Pending` on creation. Only Admins can read the full list and update status.
- **Results** are stored in a master document. This document is highly sensitive and MUST ONLY be readable by Admins.
- **Users** can only read their own profile. Only Admins can update roles.
- **Settings** (Admission Config, Home Content) are restricted to Admin writes.

## 2. The "Dirty Dozen" Payloads (Red Team Attack Vectors)

1. **Self-Promotion Attack**: Authenticated student attempts to update `/users/{uid}` with `{ "role": "admin" }`.
2. **PII Query Scraping**: Authenticated student attempts to `list` the `/admissions` collection to see other applicants' data.
3. **Draft Leakage**: Authenticated guest student attempts to read a notice where `status == "Draft"`.
4. **Master Result Theft**: Authenticated student attempts to `get` `/school_data/results` to see the entire school's marks.
5. **Notice Sabotage**: Authenticated student attempts to `delete` a notice from `/notices/{noticeId}`.
6. **Admission Status Hijack**: Guest user attempts to `create` an admission with `{ "status": "Approved" }`.
7. **Identity Spoofing**: User A attempts to `update` `/users/{UserB_UID}` to change their phone number.
8. **Config Poisoning**: Authenticated student attempts to `update` `/settings/admissionFormConfig` to remove required fields.
9. **Recursive Read Attack**: Malicious user attempts to query the `users` collection without filters hoping the rules delegate to client.
10. **Shadow ID Injection**: User attempts to create a notice with a 1MB string as the document ID.
11. **Impersonation**: User attempts to create a notice where `authorId` (if used) is set to an Admin's UID.
12. **Status Bypass**: Authenticated teacher attempts to delete an "Archived" notice that they didn't create.

## 3. Test Runner (Mock Tests)
- `it('should deny student from making themselves admin', ...)`
- `it('should deny unauthorized read of school_data/results', ...)`
- `it('should allow user to submit admission but force Pending status', ...)`
- `it('should only allow admin to read all users', ...)`
