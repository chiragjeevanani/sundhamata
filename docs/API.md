# Sundhamata Mobile API (v1)

REST API behind the Sundhamata Mobile customer app and store admin panel.

- Base URL: `http://localhost:5000/api/v1` (configure the frontend with `VITE_API_URL`)
- Stack: Node.js, Express 5, MongoDB/Mongoose, Zod validation, JWT auth
- All request and response bodies are JSON.

## Contents

1. [Running locally](#running-locally)
2. [Conventions](#conventions)
3. [Authentication](#authentication)
4. [Customer auth endpoints](#customer-auth-endpoints)
5. [Admin auth endpoints](#admin-auth-endpoints)
6. [Customer endpoints](#customer-endpoints)
7. [Public store endpoint](#public-store-endpoint)
8. [Admin endpoints](#admin-endpoints)
9. [Business rules](#business-rules)
10. [Environment variables](#environment-variables)

---

## Running locally

```bash
# 1. MongoDB — either a replica set (full transactions, recommended):
cd backend
npm install
npm run db:dev            # starts a single-node replica set on 127.0.0.1:27018 (keep running)
# ...or any existing MongoDB (a standalone server works in development only, see "Atomicity").

# 2. Backend
cp .env.example .env      # set JWT_SECRET (≥ 32 chars) and MONGODB_URI
npm run seed              # development data (idempotent)
npm run dev               # http://localhost:5000

# 3. Frontend (customer app at /, admin panel at /admin)
cd ../frontend
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:5000/api/v1
npm run dev               # http://localhost:5173
```

**Development credentials (seed data only — never use in production)**

| Who | Login |
|---|---|
| Admin | `admin@sundhamatamobile.com` / `Admin@123` (or mobile `9829012345`) |
| Customer | any seeded mobile, e.g. `9876543210` (Rohit Sharma, 2,450 points); OTP `123456` |

The fixed OTP `123456` (`DEV_OTP_CODE`) is only accepted when `NODE_ENV` is not `production`. In development the OTP is also printed in the server log (`[DEV SMS] ...`).

Tests: `cd backend && npm test` (starts an in-memory MongoDB replica set; uses a local `mongod` if one is installed, otherwise downloads one).

---

## Conventions

### Success

```json
{ "success": true, "data": { }, "message": "OK" }
```

Lists are paginated:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
  },
  "message": "OK"
}
```

Common list query parameters: `page` (default 1), `limit` (default 20, max 100), `search`.

### Errors

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "pricing.discount", "message": "Discount cannot be greater than the purchase amount" }]
}
```

Some errors carry a `meta` object, e.g. `{ "reason": "otp_invalid", "attemptsRemaining": 3 }` or `{ "retryAfterSeconds": 27 }` (429 responses also send a `Retry-After` header). Stack traces are never returned when `NODE_ENV=production`.

| Status | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Malformed request (bad JSON), wrong or expired OTP |
| 401 | Missing, invalid or expired token; wrong admin credentials |
| 403 | Deactivated account, missing permission, or disallowed CORS origin |
| 404 | Not found — **also returned for resources owned by someone else** |
| 409 | Conflict: duplicate mobile / invoice number, purchase already cancelled |
| 422 | Validation failed (unknown fields are rejected, not ignored) |
| 429 | Rate limited, OTP cooldown / send limit / attempt limit |
| 500 | Unexpected server error (details are logged server-side) |

### Mobile numbers

Any common Indian format is accepted — `9876543210`, `+91 98765 43210`, `919876543210`, `09876543210` — and stored normalized as E.164 (`+919876543210`). All of these resolve to the same customer. Responses always return the E.164 form.

### Dates and money

Dates are ISO 8601 UTC strings. Reporting buckets (this month, trends, hourly sales) use store time, Asia/Kolkata. Amounts are rupees as numbers with up to 2 decimals.

---

## Authentication

Two independent JWT systems. Send tokens as `Authorization: Bearer <token>`.

| | Customer | Admin |
|---|---|---|
| Login | mobile + OTP | email or mobile + password |
| Token audience | `sundhamata:customer` | `sundhamata:admin` |
| Lifetime | `JWT_EXPIRES_IN` (default 7d) | `ADMIN_JWT_EXPIRES_IN` (default 12h) |
| Grants | `/customer/*` | `/admin/*` |

A customer token is rejected (401) by every admin route, and an admin token by every customer route. Accounts are re-checked on each request, so deactivating a customer or admin takes effect immediately.

**Logout is stateless.** There is no server-side token revocation; the client discards the token and it remains valid until it expires. Keep token lifetimes short accordingly.

**Admin roles** are `admin` and `manager`. Both currently hold every permission; permissions are declared per route and mapped to roles in `backend/src/config/permissions.js`, so they can be differentiated in one place later.

---

## Customer auth endpoints

Rate limited per client IP (OTP send/resend/register: 10 per 15 min; verify: 20 per 15 min; check: 30 per 15 min).

### `POST /auth/customer/check`

```json
// request
{ "mobile": "9876543210" }
// 200
{ "success": true, "data": { "exists": true, "isRegistered": true }, "message": "Customer found" }
```

No personal data is returned.

### `POST /auth/customer/send-otp`

Sends a login OTP to an **existing** customer.

```json
// request
{ "mobile": "9876543210" }
// 200
{ "success": true, "data": { "expiresInSeconds": 300, "resendAvailableInSeconds": 30 }, "message": "OTP sent" }
```

404 if no account exists, 403 if the account is deactivated, 429 during the resend cooldown or after the hourly send limit.

### `POST /auth/customer/register`

Starts registration of a **new** customer. Nothing is created yet: the details are held with the OTP challenge and the customer is created only after `verify-otp` succeeds.

```json
// request — name, mobile, interest required; budget optional
{ "name": "Rohit Sharma", "mobile": "9876543210", "interest": "Mobile", "budget": 50000 }
// 200
{ "success": true, "data": { "expiresInSeconds": 300, "resendAvailableInSeconds": 30, "otpSent": true }, "message": "Verification OTP sent. Your account will be created once the OTP is verified." }
```

`interest` is one of `Mobile`, `Accessories`, `Service`. 409 if the mobile is already registered.

### `POST /auth/customer/resend-otp`

Resends the OTP for whichever flow is in progress (login or registration, keeping the pending registration details). Same response as `send-otp`.

### `POST /auth/customer/verify-otp`

```json
// request
{ "mobile": "9876543210", "otp": "123456" }
// 200
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "expiresAt": "2026-10-01T12:18:31.000Z",
    "isNewUser": false,
    "customer": {
      "id": "6ab514fcb6310c16af7d7bd2",
      "customerCode": "CUS00001",
      "name": "Rohit Sharma",
      "mobile": "+919876543210",
      "interest": "Mobile",
      "budget": 50000,
      "email": "rohit@gmail.com",
      "address": "B-42, Malviya Nagar, Jaipur",
      "city": "Jaipur",
      "pincode": null,
      "profileImage": null,
      "loyaltyPoints": 2450,
      "loyaltyTier": { "key": "silver", "label": "Silver Member" },
      "memberSince": "2024-10-14T00:00:00.000Z",
      "isActive": true
    }
  },
  "message": "Signed in"
}
```

| Failure | Status | `meta.reason` |
|---|---|---|
| Wrong code | 400 | `otp_invalid` (+ `attemptsRemaining`) |
| Code expired | 400 | `otp_expired` |
| Too many wrong attempts (5) — even the right code is then refused | 429 | `otp_attempts_exceeded` |
| No active OTP / already used | 400 | — |

### OTP security

- 6 digits, random in production, fixed `DEV_OTP_CODE` otherwise.
- Stored only as an HMAC hash, never logged in production, never returned by the API.
- Expires after `OTP_EXPIRY_SECONDS` (300); single use (deleted on success).
- Max `OTP_MAX_ATTEMPTS` (5) verifications per code, counted atomically.
- Resend cooldown `OTP_RESEND_COOLDOWN_SECONDS` (30); max `OTP_MAX_SENDS_PER_HOUR` (5) per mobile.
- Delivery goes through `backend/src/services/sms/index.js`. Only a development `console` provider exists; in production it refuses to send. Add an MSG91 / Twilio / AWS SNS provider there (`sendOtp(mobile, code)`) and select it with `SMS_PROVIDER` — no controller changes are needed.

---

## Admin auth endpoints

### `POST /auth/admin/login`

```json
// request — identifier is an email or a mobile number (`email` / `mobile` keys also accepted)
{ "identifier": "admin@sundhamatamobile.com", "password": "Admin@123" }
// 200
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "expiresAt": "2026-09-25T00:18:30.000Z",
    "admin": {
      "id": "6ab514fcb6310c16af7d7bd1",
      "name": "Ramesh Patel",
      "email": "admin@sundhamatamobile.com",
      "mobile": "+919829012345",
      "role": "admin",
      "roleLabel": "Administrator",
      "avatarInitials": "RP",
      "lastLoginAt": "2026-09-24T12:18:30.089Z"
    }
  },
  "message": "Signed in"
}
```

401 `Invalid email/mobile or password` (identical for unknown users and wrong passwords); 403 for deactivated admins. Limited to 10 failed attempts per 15 minutes per IP.

### `GET /admin/me` — current admin profile (`data.admin`).

### `POST /auth/admin/logout` — acknowledges logout; returns `{ "serverSideInvalidation": false }` (see [Authentication](#authentication)).

---

## Customer endpoints

All require a customer token and only ever return the signed-in customer's own data. Requesting another customer's purchase or ledger entry returns the same 404 as a non-existent one.

### `GET /customer/me`

Returns `data.customer` (shape as in `verify-otp`).

### `PATCH /customer/me`

Updatable: `name`, `email`, `interest`, `budget`, `address`, `city`, `pincode`, `profileImage`. Empty strings clear a field. `mobile` and `loyaltyPoints` cannot be changed here (422).

```json
{ "email": "rohit@gmail.com", "city": "Jaipur", "pincode": "302019" }
```

### `GET /customer/purchases`

Query: `page`, `limit`, `search` (product, brand, variant, invoice, IMEI, serial), `category` (`all` | `phones` | `accessories` | `service`). Newest first.

### `GET /customer/purchases/:id`

```json
{
  "success": true,
  "data": {
    "purchase": {
      "id": "6ab515260601b811ce696874",
      "invoiceNumber": "SM-2026-000001",
      "customerId": "6ab514fcb6310c16af7d7bd2",
      "category": "phones",
      "product": {
        "name": "Samsung Galaxy S25 Ultra", "brand": "Samsung", "model": null,
        "variant": "12GB + 256GB", "color": "Titanium Black",
        "imei": "358921104829104", "serialNumber": null, "quantity": 1
      },
      "purchaseDate": "2026-09-24T12:18:46.000Z",
      "payment": { "method": "UPI", "status": "Paid" },
      "pricing": {
        "purchaseAmount": 124999, "discount": 0, "finalAmount": 124999,
        "taxRatePercent": 18, "taxAmount": 19067.64, "baseAmount": 105931.36
      },
      "loyalty": { "pointsEarned": 1249, "pointsReversed": 0, "reversalShortfall": 0 },
      "warranty": {
        "type": "1 Year Brand Manufacturer Warranty",
        "validUntil": "2027-09-24T12:18:46.000Z",
        "coverage": "Manufacturing defects covered at authorised brand service centres across India.",
        "status": "Active"
      },
      "notes": null,
      "bill": { "filename": "Samsung S25 bill.pdf", "contentType": "application/pdf", "size": 84213, "uploadedAt": "2026-09-24T12:20:00.000Z" },
      "status": "Purchased",
      "cancelReason": null,
      "cancelledAt": null,
      "billedBy": "Ramesh Patel",
      "createdAt": "2026-09-24T12:18:46.446Z",
      "updatedAt": "2026-09-24T12:18:46.446Z"
    }
  },
  "message": "OK"
}
```

`warranty.status` is `Active`, `Expired` or `Void` (cancelled purchase).

### `GET /customer/purchases/:id/bill`

Downloads the bill the store uploaded for this purchase (see [Purchase bills](#purchase-bills)). 404 when the purchase has no bill, or belongs to someone else.

### `GET /customer/loyalty`

Balance, tier, monthly summary and the 5 latest ledger entries.

```json
{
  "success": true,
  "data": {
    "balance": 3699,
    "tier": { "key": "gold", "label": "Gold Member" },
    "estimatedValue": 3699,
    "rupeeValuePerPoint": 1,
    "pointsPerHundredRupees": 1,
    "minRedeemPoints": 500,
    "expiryMonths": 12,
    "thisMonth": { "earned": 2548, "redeemed": 500, "net": 2048 },
    "lifetime": { "earned": 4199, "redeemed": 500 },
    "recentTransactions": [
      {
        "id": "6ab51526...", "type": "earned", "source": "purchase",
        "points": 1249, "direction": "credit",
        "title": "Purchase Reward", "description": "Samsung Galaxy S25 Ultra", "reason": null,
        "purchaseId": "6ab515260601b811ce696874", "invoiceNumber": "SM-2026-000001",
        "balanceAfter": 3699, "createdAt": "2026-09-24T12:18:46.460Z"
      }
    ]
  },
  "message": "OK"
}
```

### `GET /customer/loyalty/summary` — same as above without `recentTransactions`.

### `GET /customer/loyalty/transactions`

Query: `page`, `limit`, `type` (`earned` | `redeemed` | `adjustment` | `expired`), `source`, `direction` (`credit` | `debit`). `points` is signed (negative for debits).

### `GET /customer/loyalty/transactions/:id` — a single own ledger entry (`data.transaction`).

---

## Public store endpoint

### `GET /store` (no auth)

```json
{
  "success": true,
  "data": {
    "store": {
      "storeName": "Sundhamata Mobile", "tagline": "Smart Phones Smart People",
      "legalName": "Sundhamata Mobile & Electronics Pvt. Ltd.", "gstin": "08AABCS1429P1Z5",
      "address": "Shop No. 12-14, Ground Floor, Laxmi Complex, Chandan Nagar, New Sanganer Road",
      "city": "Jaipur", "state": "Rajasthan", "pincode": "302019",
      "contactNumber": "+91 98290 12345", "supportNumber": "+91 141 2894567",
      "whatsappNumber": "+91 98290 12345", "email": "care@sundhamatamobile.com",
      "workingHours": "Mon - Sun: 10:30 AM - 09:30 PM",
      "googleMapsUrl": "https://maps.google.com/?q=Chandan+Nagar+Jaipur",
      "loyalty": { "pointsPerHundredRupees": 1, "rupeeValuePerPoint": 1, "minRedeemPoints": 500, "expiryMonths": 12 }
    }
  },
  "message": "OK"
}
```

`GET /health` (no auth) reports API and database status.

---

## Admin endpoints

All require an admin token.

### Customers

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/customers` | `search` (name, mobile in any format, email, customer code), `status` (`all`/`active`/`inactive`), `sort` (`createdAt`, `name`, `loyaltyPoints`, prefix `-` for descending; default `-createdAt`), `page`, `limit` |
| POST | `/admin/customers` | `name`, `mobile`, `interest` required; optional `budget`, `email`, `address`, `city`, `pincode`. 409 on duplicate mobile |
| GET | `/admin/customers/:id` | Customer + `stats` |
| PATCH | `/admin/customers/:id` | Profile fields, `mobile` (409 if taken), `isActive`. Loyalty points are not editable here |
| GET | `/admin/customers/:id/purchases` | Same filters as `/admin/purchases` |
| GET | `/admin/customers/:id/loyalty` | `{ summary, transactions }` (paginated ledger) |

Admin customer objects add:

```json
{
  "mobileVerified": true,
  "lastLoginAt": "2026-09-24T12:18:31.211Z",
  "registrationSource": "self",
  "createdAt": "...", "updatedAt": "...",
  "stats": { "totalPurchases": 3, "totalSpent": 235297, "lastPurchaseDate": "2026-09-05T12:00:00.000Z" }
}
```

`stats` counts active (non-cancelled) purchases only.

### Purchases

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/purchases` | `search` (invoice, product, brand, IMEI, serial, customer name/mobile), `status` (`Purchased`/`Cancelled`), `paymentStatus`, `category`, `customerId`, `from`, `to` (purchase date), `sort` (`-purchaseDate` default), `page`, `limit` |
| GET | `/admin/purchases/:id` | Adds `customer { id, name, mobile, customerCode }` and `createdBy { id, name }` |
| POST | `/admin/purchases` | Record a purchase (below) |
| PATCH | `/admin/purchases/:id` | `payment.method`, `payment.status`, `notes`, `category`, product details. **Pricing cannot be changed** — cancel and re-record instead. Cancelled purchases cannot be edited (409) |
| POST | `/admin/purchases/:id/cancel` | `{ "reason": "Customer returned device" }` (optional) |
| POST | `/admin/purchases/:id/bill?filename=...` | Attach or replace the bill (raw file body, see [Purchase bills](#purchase-bills)) |
| GET | `/admin/purchases/:id/bill` | Download the bill |
| DELETE | `/admin/purchases/:id/bill` | Remove the bill |

#### `POST /admin/purchases`

```json
// request
{
  "customerId": "6ab514fcb6310c16af7d7bd2",
  "category": "phones",
  "product": {
    "name": "Samsung Galaxy S25 Ultra",
    "variant": "12GB + 256GB",
    "color": "Titanium Black",
    "imei": "358921104829104"
  },
  "purchaseDate": "2026-09-24T12:18:46.000Z",
  "payment": { "method": "UPI", "status": "Paid" },
  "pricing": { "purchaseAmount": 124999, "discount": 0 },
  "notes": "Screen guard applied"
}
// 201
{
  "success": true,
  "data": { "purchase": { "...": "as above", "loyalty": { "pointsEarned": 1249 } }, "customerLoyaltyBalance": 3699 },
  "message": "Purchase recorded. 1249 loyalty points credited."
}
```

- Required: `customerId`, `product.name`, `payment.method`, `pricing.purchaseAmount`.
- `category`: `phones` (default) | `accessories` | `service` (service purchases get no warranty).
- `payment.method`: `UPI`, `Cash`, `Card`, `Credit Card`, `Debit Card`, `EMI`, `Other`.
- `payment.status`: `Paid` (default), `Pending`, `Partially Paid`. (`Cancelled` is set only by the cancel endpoint.)
- `product.imei`: exactly 15 digits. `product.serialNumber`: 4–30 letters/digits/hyphens. `product.brand` is inferred from the name when omitted.
- `invoiceNumber` is optional; when omitted the server assigns the next `SM-<year>-<6 digits>`. A duplicate is rejected with 409.
- `purchaseDate` defaults to now and cannot be in the future.
- **`pointsEarned` / `loyalty` / `loyaltyPoints` are rejected (422)**: the server calculates loyalty.

Errors: 404 unknown customer, 422 inactive customer / invalid amounts / discount greater than amount, 409 duplicate invoice.

#### Cancel response

```json
{
  "success": true,
  "data": {
    "purchase": { "status": "Cancelled", "payment": { "status": "Cancelled" }, "loyalty": { "pointsEarned": 1249, "pointsReversed": 1249, "reversalShortfall": 0 } },
    "loyalty": { "pointsReversed": 1249, "reversalShortfall": 0 }
  },
  "message": "Purchase cancelled. 1249 points reversed."
}
```

409 if already cancelled.

### Purchase bills

A purchase can carry one bill file (invoice scan, photo, PDF, ...). The admin uploads it from the Record Purchase form or later from the invoice page; the customer downloads it from their purchase.

**Upload / replace** — `POST /admin/purchases/:id/bill?filename=Samsung%20bill.pdf`

The request body is the raw file (not multipart). Send the file name in the `filename` query parameter.

```bash
curl -X POST "$API/admin/purchases/$ID/bill?filename=bill.pdf"   -H "Authorization: Bearer $ADMIN_TOKEN"   -H "Content-Type: application/octet-stream"   --data-binary @bill.pdf
```

```json
// 200 — the purchase, now with bill metadata
{ "success": true, "data": { "purchase": { "bill": { "filename": "bill.pdf", "contentType": "application/pdf", "size": 84213, "uploadedAt": "2026-09-25T09:12:00.000Z" } } }, "message": "Bill uploaded" }
```

- Accepted: PDF; images (JPG, PNG, WebP, GIF, HEIC); Word (`.doc`, `.docx`); Excel (`.xls`, `.xlsx`). Maximum **10 MB**.
- The type is detected from the file's contents, not the name or `Content-Type`. A renamed executable, an HTML or SVG page (which can carry scripts) or any other format is refused with 422 `Unsupported file type`. The stored name gets the extension of the detected type.
- File names are sanitised (no path parts or control characters). Over 10 MB returns 413.
- Uploading again **replaces** the bill and deletes the previous file. Cancelled purchases cannot get, replace or lose a bill (409), but an existing bill can still be downloaded.
- `bill` is `null` on purchases without one; `fileId` is never exposed.

**Download** — `GET /admin/purchases/:id/bill` (admin) or `GET /customer/purchases/:id/bill` (the purchase's own customer). The response is the file itself with `Content-Disposition: attachment`, `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. Both endpoints need the bearer token, so a browser must fetch the file with the Authorization header and save the resulting blob — a plain link will not work.

**Remove** — `DELETE /admin/purchases/:id/bill` returns the purchase with `bill: null`.

Files are stored in MongoDB GridFS (`bills.files` / `bills.chunks`), so they survive redeploys on hosts with an ephemeral disk. On an Atlas free (M0) cluster mind the 512 MB storage cap.

### Loyalty

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/loyalty/transactions` | `customerId`, `type`, `source`, `direction`, `page`, `limit`; entries include `customer` and `createdBy` |
| GET | `/admin/loyalty/summary` | Totals, tier distribution, issued-points trends, recent activity |
| POST | `/admin/loyalty/adjust` | Manual add / deduct |

#### `POST /admin/loyalty/adjust`

```json
// request — points must be a positive whole number, reason is required
{ "customerId": "6ab514fcb6310c16af7d7bd2", "type": "deduct", "points": 200, "reason": "Redeemed at counter" }
// 201
{
  "success": true,
  "data": {
    "transaction": { "type": "adjustment", "source": "admin_adjustment", "points": -200, "direction": "debit", "balanceAfter": 3499, "reason": "Redeemed at counter" },
    "balance": 3499
  },
  "message": "Loyalty points adjusted"
}
```

A deduction larger than the balance is refused with 422 (`Customer has only N points; cannot deduct M`).

#### `GET /admin/loyalty/summary`

```json
{
  "totalPointsIssued": 5575,
  "totalPointsDebited": 1799,
  "pointsRedeemed": 500,
  "pointsOutstanding": 3776,
  "customersWithPoints": 4,
  "totalCustomers": 5,
  "tierDistribution": [{ "key": "bronze", "label": "Bronze Member", "minPoints": 0, "color": "#B45309", "customers": 4 }],
  "issuedTrend": { "30d": [{ "label": "Week 1", "value": 0, "count": 0 }], "6m": [], "1y": [] },
  "recentActivity": []
}
```

### Settings

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/settings` | Full store settings, including `tax.gstRatePercent` |
| PATCH | `/admin/settings` | Partial update |

```json
// PATCH body — any subset
{
  "storeName": "Sundhamata Mobile",
  "tagline": "Smart Phones Smart People",
  "address": "Shop No. 12-14, Laxmi Complex, Chandan Nagar",
  "contactNumber": "+91 98290 12345",
  "gstin": "08AABCS1429P1Z5",
  "loyalty": { "pointsPerHundredRupees": 1.5 }
}
```

Also accepted: `legalName`, `city`, `state`, `pincode`, `supportNumber`, `whatsappNumber`, `email`, `workingHours`, `loyalty.rupeeValuePerPoint`, `loyalty.minRedeemPoints`, `loyalty.expiryMonths`. Changing the loyalty rate affects future purchases only; each purchase stores the rate it was billed with.

### Dashboard, activity and reports

#### `GET /admin/dashboard`

```json
{
  "customers": { "total": 5, "newThisMonth": 1 },
  "purchases": { "total": 7, "thisMonth": 2, "cancelled": 1 },
  "sales": { "total": 363194, "thisMonth": 70199 },
  "loyaltyPointsIssued": { "total": 5575, "thisMonth": 2550, "outstanding": 3776 },
  "revenueTrend": { "30d": [], "6m": [{ "label": "Sep", "start": "...", "value": 70199, "count": 2 }], "1y": [] },
  "categoryDistribution": [{ "key": "phones", "label": "Smartphones", "value": 267997, "count": 4 }],
  "sparklines": { "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"], "customers": [], "purchases": [], "sales": [], "loyaltyPoints": [] },
  "recentPurchases": [],
  "recentActivity": [{ "id": "purchase:...", "type": "purchase", "title": "Purchase Recorded", "message": "...", "occurredAt": "...", "link": "/admin/purchases/..." }],
  "generatedAt": "2026-09-24T12:19:15.000Z",
  "timezone": "Asia/Kolkata"
}
```

Cancelled purchases are excluded from sales and purchase totals. Trends: `30d` = four 7-day weeks, `6m` = six calendar months, `1y` = four calendar quarters.

#### `GET /admin/activity?limit=20`

Merged feed of recent purchases, cancellations, new customers and manual loyalty adjustments (used for admin notifications).

#### `GET /admin/reports/summary`

```json
{
  "totals": { "totalOrders": 7, "cancelledOrders": 1, "totalSales": 363194, "totalDiscount": 2500, "totalCustomers": 5, "pointsIssued": 5575, "averageOrderValue": 51884.86 },
  "revenueTrend": { "30d": [], "6m": [], "1y": [] },
  "brandShare": [{ "key": "Apple", "label": "Apple", "value": 149898, "count": 3 }],
  "categoryShare": [],
  "paymentMethodShare": [],
  "hourlySales": [{ "label": "6 PM", "value": 197998, "count": 2 }]
}
```

---

## Business rules

### Loyalty calculation

`points = floor(finalAmount / 100 × pointsPerHundredRupees)`, where `finalAmount = purchaseAmount − discount`, always rounded **down**. With the default 1 point per ₹100, ₹1,24,999 earns 1,249 points. The rate comes from store settings at the moment of billing (never hardcoded, never taken from the client) and is stored on the purchase. Zero-point purchases create no ledger entry.

### Ledger

`LoyaltyTransaction` is the append-only source of truth. Every balance change creates an entry with signed `points` and the resulting `balanceAfter`; `Customer.loyaltyPoints` is a cached copy that is only changed together with a ledger entry. Invariant: cached balance = sum of the ledger = latest `balanceAfter`.

| Event | `type` | `source` | points |
|---|---|---|---|
| Purchase | `earned` | `purchase` | + |
| Admin add / deduct | `adjustment` | `admin_adjustment` | + / − |
| Purchase cancellation | `adjustment` | `purchase_cancellation` | − |
| Redemption (seed/import) | `redeemed` | `redemption` | − |

Balances can never go negative: debits use a conditional atomic update, so concurrent deductions cannot overdraw. A purchase can be rewarded once and reversed once (unique index).

### Cancellation

Purchases are never deleted. Cancelling sets `status: "Cancelled"`, payment status `Cancelled`, and reverses the purchase's points. If the customer has already spent some of those points, only the available balance is reversed and the difference is recorded as `loyalty.reversalShortfall` on the purchase and reported in the response message.

### Atomicity

Recording a purchase (purchase + ledger entry + balance), manual adjustments and cancellations run inside a MongoDB transaction on replica sets / Atlas. If any step fails, nothing is written. On a standalone `mongod` (local development only) the same workflows use compensating rollbacks and the server logs a warning at startup. **With `NODE_ENV=production` the server refuses to start without transaction support.**

### Loyalty tiers

Derived from the current balance: Bronze (0+), Silver (1,000+), Gold (2,500+), Platinum Elite (10,000+). Thresholds live in `backend/src/utils/loyalty.js`.

---

## Environment variables

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` disables the dev OTP and requires transactions |
| `PORT` | `5000` | HTTP port |
| `MONGODB_URI` | — (required) | MongoDB connection string |
| `JWT_SECRET` | — (required, ≥ 32 chars) | Signs JWTs and hashes OTPs |
| `JWT_EXPIRES_IN` | `7d` | Customer token lifetime |
| `ADMIN_JWT_EXPIRES_IN` | `12h` | Admin token lifetime |
| `CUSTOMER_FRONTEND_URL`, `ADMIN_FRONTEND_URL` | — | Allowed CORS origins (comma-separated lists allowed) |
| `LOYALTY_POINTS_PER_100` | `1` | Initial loyalty rate when settings are first created |
| `OTP_EXPIRY_SECONDS` | `300` | OTP lifetime |
| `OTP_MAX_ATTEMPTS` | `5` | Verification attempts per OTP |
| `OTP_RESEND_COOLDOWN_SECONDS` | `30` | Minimum gap between sends |
| `OTP_MAX_SENDS_PER_HOUR` | `5` | Sends per mobile per hour |
| `DEV_OTP_CODE` | `123456` | Fixed OTP outside production |
| `SMS_PROVIDER` | `console` | OTP delivery provider |
| `BCRYPT_ROUNDS` | `12` | Admin password hashing cost |
| `RATE_LIMIT_ENABLED` | `true` | Per-IP rate limiting |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the API |
| `LOG_LEVEL` | by environment | pino log level |

Frontend (`frontend/.env`): `VITE_API_URL` — API base URL, e.g. `http://localhost:5000/api/v1`.
