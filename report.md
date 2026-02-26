# Project Cleanup: Bugs, Broken Links & Unnecessary Files

## Bugs Found

### 1. Debug Error Handlers in Production
[admin-dashboard.html](file:///e:/project/Intern-logbook/public/admin-dashboard.html#L163-L170) has inline `alert()` error handlers that pop up JS errors to users:
```js
window.addEventListener('error', function (e) {
    alert('JS Error: ' + e.message + ...);
});
```
**Fix:** Remove this entire `<script>` block (lines 163–170).

### 2. Service Worker Caches Non-Existent File
[sw.js](file:///e:/project/Intern-logbook/public/sw.js#L25) pre-caches `/js/signature.js` but this file **does not exist** in `public/js/`. This will cause the service worker install to fail silently.  
**Fix:** Remove `/js/signature.js` from the `APP_SHELL` array.

### 3. Unused Environment Variable
`.env` contains `RESEND_API_KEY` which is **never referenced** anywhere in the server code.  
**Fix:** Remove `RESEND_API_KEY` line from `.env`.

---

## Broken / Dead Links

### Footer Links (All Admin Pages)
All admin pages (`admin-dashboard.html`, `user_management.html`, `templates.html`, `bulkfill_credits.html`, `verify_payments.html`) have 4 footer links pointing to `#`:
- Privacy Bits, House Rules, Say Hello!, Twitter (X)

**Fix:** Remove these placeholder links or leave them if you plan to create these pages later. I'll leave these as-is unless you say otherwise.

---

## Orphan Pages (Not Linked From Anywhere)

| Page | Linked From | Recommendation |
|------|-------------|----------------|
| `pricing.html` | Nothing | **Delete** |
| `Buy-Credits.html` | Nothing | **Delete** |

---

## Unnecessary Files to Delete

### Root-Level Test/Utility Scripts (Development Artifacts)
| File | Purpose | Action |
|------|---------|--------|
| `extract_fields.js` | One-off field extraction from local path | **Delete** |
| `test-email.js` | Test script for SMTP email | **Delete** |
| `testQuery.js` | Test Firestore payment query | **Delete** |
| `test_upload.js` | Puppeteer upload test | **Delete** |
| `update_signature.js` | One-off signature injection | **Delete** |
| `test-data.csv` | Test data for bulk fill | **Delete** |
| `test-data.json` | Test data for bulk fill | **Delete** |

### Resolved Planning Docs
| File | Action |
|------|--------|
| `implementation_plan.md.resolved` | **Delete** |
| `implementation_plan_email verify.md` | **Delete** |

### Other
| File | Reason | Action |
|------|--------|--------|
| `daily_bulk_template.csv` | Sample CSV with real user data, not referenced in code | **Delete** |
| `temp/` | Empty directory, already in `.gitignore` | **Delete** |

---

## Summary of Changes

| Category | Count |
|----------|-------|
| Bugs to fix | 3 |
| Orphan pages to delete | 2 |
| Unnecessary files to delete | 10 |
| Dead footer links | 4 per page (leave as-is for now) |

## Verification Plan
- Run `npm run dev` and confirm no startup errors
- Verify service worker installs cleanly in browser
- Confirm admin-dashboard no longer shows debug alerts
