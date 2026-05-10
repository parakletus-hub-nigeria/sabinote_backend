# SabiNote v1.0 — Backend Architecture & API Blueprint

> **Stack Assumption (Prototype):** Node.js + Express, PostgreSQL, Prisma ORM, Claude API (Anthropic), Paystack, Google OAuth.  
> Adjust as needed — the design is framework-agnostic.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Curriculum Storage Strategy](#2-curriculum-storage-strategy)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
5. [AI Generation Pipeline](#5-ai-generation-pipeline)
6. [Paystack Webhook Flow](#6-paystack-webhook-flow)
7. [Recommended Additional Features](#7-recommended-additional-features)
8. [Environment Variables Checklist](#8-environment-variables-checklist)

---

## 1. Architecture Overview

```
Client (React/Next.js)
       │
       ▼
  REST API (Express)
       │
  ┌────┴─────────────────────────┐
  │                              │
PostgreSQL DB            External Services
  │                       ├── Anthropic Claude API
  ├── Users               ├── Paystack (payments)
  ├── Wallets             ├── Google OAuth
  ├── Transactions        └── File Storage (e.g. Cloudinary / S3)
  ├── LessonNotes                      (for UserResources)
  ├── CurriculumWeeks  ◄── Core RAG source
  ├── UserResources
  ├── UserSettings
  ├── UserPrompts
  └── Notifications
```

**Key design principles:**
- Curriculum is **pre-indexed by week** — no full-document reads at generation time.
- AI is called with a **single targeted week chunk** as context, not the whole curriculum.
- Wallet deductions are **atomic** with generation triggers — no generation without verified balance.
- All AI outputs are stored **immediately** before returning to client (crash recovery).

---

## 2. Curriculum Storage Strategy

### The Problem

Storing an entire state curriculum as a single blob means:
- **Every generation request reads megabytes** of irrelevant content.
- The AI model receives an oversized context window, increasing cost and degrading output quality.
- No efficient indexing is possible.

### Recommended Approach: Weekly Chunk Rows

Split the curriculum so that **one database row = one week of one subject** for a given state, class, and term.

**Why this works:**
- A generation request resolves to a **single deterministic query**: `WHERE state = ? AND subject = ? AND classLevel = ? AND term = ? AND week = ?`
- The AI receives **only the relevant week's objectives, topics, and sub-topics** — a few hundred tokens at most.
- You can pre-load and **cache** popular curriculum rows (e.g., JSS 1 Mathematics Term 1) in Redis/memory with a long TTL since curriculum data changes at most once a year.
- Future vector search (for fuzzy topic matching) can be added **per row** by embedding only that row's content — not the whole curriculum.

### Curriculum Row Structure (see `CurriculumWeek` table below)

```
state: "Lagos"
subject: "Mathematics"
classLevel: "JSS1"
term: 1
week: 3
topic: "Whole Numbers — Multiplication and Division"
subTopics: ["Multiplication of 4-digit numbers", "Long division", "Word problems"]
objectives: ["Multiply 4-digit numbers by 2-digit numbers", "Solve long division problems"]
teachingActivities: "..."
teachingAids: "Charts, counters"
evaluation: "..."
```

### Caching Layer (Recommended from day 1)

```
Cache Key: curriculum:{state}:{subject}:{classLevel}:{term}:{week}
TTL: 7 days (curriculum is static within a session year)
```

Use Node.js `node-cache` for prototype or Redis for production. On a cache hit, skip the DB query entirely.

---

## 3. Database Schema

### 3.1 User

```sql
Table: User
─────────────────────────────────────────
userId          UUID PRIMARY KEY DEFAULT gen_random_uuid()
firstName       VARCHAR(100) NOT NULL
lastName        VARCHAR(100) NOT NULL
email           VARCHAR(255) UNIQUE NOT NULL
passwordHash    VARCHAR(255)              -- NULL for OAuth-only users
googleId        VARCHAR(255) UNIQUE       -- NULL for email/password users
phoneNumber     VARCHAR(20)
state           VARCHAR(100) NOT NULL     -- e.g. "Lagos", "Kano" — drives curriculum lookup
role            ENUM('teacher','admin') DEFAULT 'teacher'
isVerified      BOOLEAN DEFAULT FALSE
createdAt       TIMESTAMP DEFAULT NOW()
updatedAt       TIMESTAMP DEFAULT NOW()
```

> **Note:** `state` on the User table is the single source of truth for which state curriculum to fetch. Capture this at registration.

---

### 3.2 UserSettings

```sql
Table: UserSettings
─────────────────────────────────────────
settingId             UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId                UUID UNIQUE NOT NULL REFERENCES User(userId) ON DELETE CASCADE
defaultState          VARCHAR(100)             -- mirrors User.state, overridable
alwaysConfirmState    BOOLEAN DEFAULT TRUE      -- prompt user to confirm state before generation
noteDifficultyLevel   ENUM('basic','standard','advanced') DEFAULT 'standard'
defaultSubject        VARCHAR(100)             -- pre-fill Phase 1 form
defaultClassLevel     VARCHAR(20)             -- pre-fill Phase 1 form
emailNotifications    BOOLEAN DEFAULT TRUE
createdAt             TIMESTAMP DEFAULT NOW()
updatedAt             TIMESTAMP DEFAULT NOW()
```

---

### 3.3 Wallet

```sql
Table: Wallet
─────────────────────────────────────────
walletId      UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId        UUID UNIQUE NOT NULL REFERENCES User(userId) ON DELETE CASCADE
balance       DECIMAL(10,2) DEFAULT 0.00    -- in $Parats
createdAt     TIMESTAMP DEFAULT NOW()
updatedAt     TIMESTAMP DEFAULT NOW()
```

---

### 3.4 Transaction

```sql
Table: Transaction
─────────────────────────────────────────
transactionId     UUID PRIMARY KEY DEFAULT gen_random_uuid()
walletId          UUID NOT NULL REFERENCES Wallet(walletId)
userId            UUID NOT NULL REFERENCES User(userId)
type              ENUM('credit','debit') NOT NULL
amountAdded       DECIMAL(10,2) DEFAULT 0.00
amountDeducted    DECIMAL(10,2) DEFAULT 0.00
balanceBefore     DECIMAL(10,2) NOT NULL     -- snapshot for auditability
balanceAfter      DECIMAL(10,2) NOT NULL     -- snapshot for auditability
purpose           ENUM('topup','lesson_plan_generation','lesson_note_generation','refund')
paystackReference VARCHAR(255)               -- for topup transactions; NULL for debits
description       TEXT
status            ENUM('pending','success','failed') DEFAULT 'pending'
createdAt         TIMESTAMP DEFAULT NOW()
```

> **Why `balanceBefore` and `balanceAfter`?** If a wallet balance ever looks wrong, you can reconstruct the full history from these snapshots without complex recalculation.

---

### 3.5 CurriculumWeek *(replaces `StateCurriculum` blob)*

```sql
Table: CurriculumWeek
─────────────────────────────────────────
curriculumWeekId    UUID PRIMARY KEY DEFAULT gen_random_uuid()
state               VARCHAR(100) NOT NULL     -- e.g. "Lagos"
subject             VARCHAR(150) NOT NULL     -- e.g. "Mathematics"
classLevel          VARCHAR(20)  NOT NULL     -- e.g. "JSS1", "SSS3"
term                SMALLINT NOT NULL         -- 1, 2, or 3
week                SMALLINT NOT NULL         -- 1–13
topic               VARCHAR(255) NOT NULL
subTopics           TEXT[]                    -- array of sub-topic strings
objectives          TEXT[]                    -- learning objectives
teachingActivities  TEXT
teachingAids        TEXT
evaluation          TEXT
referenceText       VARCHAR(255)              -- e.g. "New General Mathematics JSS1 p.44"
createdAt           TIMESTAMP DEFAULT NOW()
updatedAt           TIMESTAMP DEFAULT NOW()

UNIQUE (state, subject, classLevel, term, week)

-- Indexes for fast lookups
CREATE INDEX idx_curriculum_lookup ON CurriculumWeek(state, subject, classLevel, term, week);
CREATE INDEX idx_curriculum_state_subject ON CurriculumWeek(state, subject);
```

> **Seeding:** Curriculum data should be seeded from structured JSON/CSV files per state. A one-time admin import endpoint (protected) handles this.

---

### 3.6 LessonNote

```sql
Table: LessonNote
─────────────────────────────────────────
noteId              UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId              UUID NOT NULL REFERENCES User(userId)
curriculumWeekId    UUID REFERENCES CurriculumWeek(curriculumWeekId)
promptId            UUID REFERENCES UserPrompts(promptId)
transactionId       UUID REFERENCES Transaction(transactionId)  -- the debit that paid for this
resourceId          UUID REFERENCES UserResource(resourceId)    -- textbook used (if any)

-- Lesson metadata
name                VARCHAR(255)              -- auto-generated e.g. "JSS1 Maths Wk3 T1"
subjectName         VARCHAR(150) NOT NULL
topic               VARCHAR(255) NOT NULL
classLevel          VARCHAR(20)  NOT NULL
term                SMALLINT
week                SMALLINT
session             VARCHAR(20)               -- e.g. "2025/2026"
state               VARCHAR(100)              -- state at time of generation

-- Content
lessonPlanContent   TEXT                      -- Phase 1 output (may be edited by user)
lessonNoteContent   TEXT                      -- Phase 2 output
parratCostPlan      DECIMAL(5,2)              -- cost of Phase 1
parratCostNote      DECIMAL(5,2)              -- cost of Phase 2

-- Status
phase               ENUM('plan_only','complete') DEFAULT 'plan_only'
status              ENUM('draft','finalised') DEFAULT 'draft'
isExported          BOOLEAN DEFAULT FALSE
exportCount         SMALLINT DEFAULT 0

createdAt           TIMESTAMP DEFAULT NOW()
updatedAt           TIMESTAMP DEFAULT NOW()

-- Index for user's note library
CREATE INDEX idx_lessonnote_user ON LessonNote(userId, createdAt DESC);
CREATE INDEX idx_lessonnote_subject ON LessonNote(userId, subjectName, classLevel);
```

---

### 3.7 UserResource *(Textbooks / Reference Materials)*

```sql
Table: UserResource
─────────────────────────────────────────
resourceId      UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId          UUID NOT NULL REFERENCES User(userId)
resourceName    VARCHAR(255) NOT NULL     -- e.g. "New General Mathematics JSS1"
resourceType    ENUM('textbook','scheme_supplement','past_question','other')
subject         VARCHAR(150)
classLevel      VARCHAR(20)
state           VARCHAR(100)              -- NULL = available to all states
fileUrl         TEXT                      -- Cloudinary / S3 URL
fileKey         TEXT                      -- storage key for deletion
fileSizeBytes   INTEGER
mimeType        VARCHAR(50)               -- e.g. "application/pdf"
isPublic        BOOLEAN DEFAULT FALSE     -- TRUE = visible to all users (admin-uploaded)
uploadedBy      UUID REFERENCES User(userId)
createdAt       TIMESTAMP DEFAULT NOW()

CREATE INDEX idx_resource_state_subject ON UserResource(state, subject, classLevel);
```

> **Recommended:** Admin-uploaded resources (official NERDC textbooks) have `isPublic = TRUE`. Teachers can upload private supplements. When generating a note, the API checks for a matching `isPublic` resource first, then the user's private resources.

---

### 3.8 UserPrompts

```sql
Table: UserPrompts
─────────────────────────────────────────
promptId        UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId          UUID NOT NULL REFERENCES User(userId)
noteId          UUID REFERENCES LessonNote(noteId)
phase           ENUM('plan','note') NOT NULL
promptText      TEXT NOT NULL             -- the full prompt sent to the AI
modelUsed       VARCHAR(100)              -- e.g. "claude-sonnet-4-20250514"
tokensUsed      INTEGER
responseStatus  ENUM('success','failed','timeout')
createdAt       TIMESTAMP DEFAULT NOW()
```

> **Why store prompts?** Debugging AI quality issues, auditing generation costs, and later fine-tuning or caching.

---

### 3.9 Notifications

```sql
Table: Notifications
─────────────────────────────────────────
notificationId  UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId          UUID NOT NULL REFERENCES User(userId)
type            ENUM('wallet_topup','generation_complete','generation_failed','system')
title           VARCHAR(255)
body            TEXT
isRead          BOOLEAN DEFAULT FALSE
metadata        JSONB                     -- e.g. { noteId, amount, etc. }
createdAt       TIMESTAMP DEFAULT NOW()
```

---

## 4. API Endpoints

### Base URL: `/api/v1`

All protected routes require: `Authorization: Bearer <JWT>`

---

### 4.1 Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | Public | Email/password registration |
| `POST` | `/auth/login` | Public | Email/password login |
| `GET` | `/auth/google` | Public | Initiate Google OAuth |
| `GET` | `/auth/google/callback` | Public | Google OAuth callback |
| `POST` | `/auth/logout` | Protected | Invalidate session/token |
| `POST` | `/auth/refresh` | Public | Refresh JWT access token |
| `POST` | `/auth/forgot-password` | Public | Send password reset email |
| `POST` | `/auth/reset-password` | Public | Confirm password reset |
| `GET` | `/auth/me` | Protected | Get current user profile |

**`POST /auth/register` Request Body:**
```json
{
  "firstName": "Amaka",
  "lastName": "Obi",
  "email": "amaka@school.edu.ng",
  "password": "SecurePass123",
  "phoneNumber": "08012345678",
  "state": "Lagos"
}
```

**`POST /auth/register` Response `201`:**
```json
{
  "success": true,
  "data": {
    "user": { "userId": "uuid", "firstName": "Amaka", "state": "Lagos" },
    "wallet": { "walletId": "uuid", "balance": 0 },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

### 4.2 User & Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users/profile` | Protected | Get full profile + settings |
| `PATCH` | `/users/profile` | Protected | Update name, phone, state |
| `GET` | `/users/settings` | Protected | Get user settings |
| `PATCH` | `/users/settings` | Protected | Update settings |
| `DELETE` | `/users/account` | Protected | Soft-delete account |

**`PATCH /users/profile` Request Body:**
```json
{
  "firstName": "Amaka",
  "state": "Ogun"
}
```

> **Important:** When `state` is updated, the frontend should warn the user that their curriculum context will change.

---

### 4.3 Wallet & Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/wallet` | Protected | Get wallet balance |
| `GET` | `/wallet/transactions` | Protected | Paginated transaction history |
| `POST` | `/wallet/topup/initiate` | Protected | Create Paystack payment intent |
| `POST` | `/wallet/topup/verify` | Protected | Manual verify (fallback) |
| `POST` | `/wallet/webhook` | Public (IP-whitelisted) | Paystack webhook handler |

**`POST /wallet/topup/initiate` Request Body:**
```json
{
  "packageId": "pkg_100",
  "parats": 100,
  "amountNGN": 500
}
```

**`POST /wallet/topup/initiate` Response `200`:**
```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/abc123",
    "reference": "sabi_1234567890",
    "transactionId": "uuid"
  }
}
```

**`POST /wallet/webhook` — Paystack Event Handler:**
- Validates `x-paystack-signature` header using HMAC-SHA512.
- On `charge.success`: Credits wallet, updates Transaction status, fires Notification.
- Idempotent — checks `paystackReference` before processing to prevent double credits.

---

### 4.4 Curriculum

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/curriculum/states` | Protected | List all available states |
| `GET` | `/curriculum/subjects` | Protected | List subjects for a state/class |
| `GET` | `/curriculum/weeks` | Protected | Get week list for a state/subject/class/term |
| `GET` | `/curriculum/week` | Protected | Get a single week's full content |
| `POST` | `/curriculum/seed` | Admin only | Seed curriculum data (JSON upload) |

**`GET /curriculum/subjects?state=Lagos&classLevel=JSS1` Response:**
```json
{
  "success": true,
  "data": {
    "subjects": ["Mathematics", "English Language", "Basic Science", "Civic Education"]
  }
}
```

**`GET /curriculum/weeks?state=Lagos&subject=Mathematics&classLevel=JSS1&term=1` Response:**
```json
{
  "success": true,
  "data": {
    "weeks": [
      { "week": 1, "topic": "Whole Numbers — Place Value" },
      { "week": 2, "topic": "Whole Numbers — Addition and Subtraction" },
      { "week": 3, "topic": "Whole Numbers — Multiplication and Division" }
    ]
  }
}
```

**`GET /curriculum/week?state=Lagos&subject=Mathematics&classLevel=JSS1&term=1&week=3` Response:**
```json
{
  "success": true,
  "data": {
    "curriculumWeekId": "uuid",
    "topic": "Whole Numbers — Multiplication and Division",
    "subTopics": ["Multiplication of 4-digit numbers", "Long division", "Word problems"],
    "objectives": ["Multiply 4-digit numbers by 2-digit numbers", "Solve long division"],
    "teachingActivities": "...",
    "teachingAids": "Charts, counters",
    "evaluation": "...",
    "referenceText": "New General Mathematics JSS1 p.44"
  }
}
```

> **Frontend UX Tip:** Use `GET /curriculum/weeks` to populate a dropdown so users can select their week rather than typing freehand. This eliminates the "topic not found" error entirely.

---

### 4.5 Generation (Core Feature)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/generate/lesson-plan` | Protected | Phase 1: Generate lesson plan |
| `POST` | `/generate/lesson-note` | Protected | Phase 2: Generate lesson note |
| `POST` | `/generate/regenerate` | Protected | Retry failed generation |

---

**`POST /generate/lesson-plan` Request Body:**
```json
{
  "curriculumWeekId": "uuid",
  "durationMinutes": 40,
  "resourceId": "uuid-optional"
}
```

**`POST /generate/lesson-plan` — Server Logic:**

```
1. Authenticate user & check wallet balance >= PLAN_COST
2. Fetch CurriculumWeek by curriculumWeekId (cache-first)
3. Fetch matching UserResource (if resourceId provided or auto-match)
4. Lock balance (optimistic deduction before AI call)
5. Build prompt (see AI Pipeline section)
6. Call Claude API
7. On success:
   a. Create LessonNote record (phase = 'plan_only')
   b. Create Transaction record (debit)
   c. Create UserPrompts record
   d. Return generated plan
8. On failure:
   a. Reverse wallet deduction (refund Transaction)
   b. Return error with retry option
```

**`POST /generate/lesson-plan` Response `201`:**
```json
{
  "success": true,
  "data": {
    "noteId": "uuid",
    "lessonPlanContent": "## Lesson Plan\n**Subject:** Mathematics...",
    "walletBalance": 92.00,
    "parratsCost": 8
  }
}
```

---

**`POST /generate/lesson-note` Request Body:**
```json
{
  "noteId": "uuid",
  "editedLessonPlan": "## Lesson Plan\n**Subject:** Mathematics (human-edited content)"
}
```

**`POST /generate/lesson-note` — Server Logic:**

```
1. Verify noteId belongs to authenticated user
2. Verify note is in phase 'plan_only' (prevent double-generation)
3. Check wallet balance >= NOTE_COST
4. Update LessonNote.lessonPlanContent with edited version (HITL)
5. Call Claude API with edited plan as context
6. On success:
   a. Update LessonNote (lessonNoteContent, phase = 'complete')
   b. Create Transaction record (debit)
   c. Create UserPrompts record
   d. Return generated note
```

**`POST /generate/lesson-note` Response `200`:**
```json
{
  "success": true,
  "data": {
    "noteId": "uuid",
    "lessonNoteContent": "## Lesson Note\n### Introduction...",
    "walletBalance": 80.00,
    "parratsCost": 12
  }
}
```

---

**`POST /generate/regenerate` Request Body:**
```json
{
  "noteId": "uuid",
  "phase": "plan",
  "additionalInstructions": "Make it more interactive"
}
```

> Regeneration deducts a reduced cost (configurable). The old content is overwritten after user confirmation.

---

### 4.6 Notes Library

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notes` | Protected | Paginated list of user's notes |
| `GET` | `/notes/:noteId` | Protected | Get a single note's full content |
| `PATCH` | `/notes/:noteId` | Protected | Auto-save canvas edits |
| `DELETE` | `/notes/:noteId` | Protected | Delete a note |
| `GET` | `/notes/search` | Protected | Search notes by subject/topic/date |

**`GET /notes?page=1&limit=20&subject=Mathematics&classLevel=JSS1` Response:**
```json
{
  "success": true,
  "data": {
    "notes": [
      {
        "noteId": "uuid",
        "name": "JSS1 Maths — Multiplication and Division",
        "subjectName": "Mathematics",
        "topic": "Whole Numbers — Multiplication and Division",
        "classLevel": "JSS1",
        "term": 1,
        "week": 3,
        "phase": "complete",
        "createdAt": "2026-04-24T08:30:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 47 }
  }
}
```

**`PATCH /notes/:noteId` (Auto-save):**
```json
{
  "lessonPlanContent": "...",
  "lessonNoteContent": "..."
}
```
> Auto-save should be called with debounce (e.g., 2s after user stops typing). Returns `{ "savedAt": "2026-04-24T08:31:22Z" }`.

---

### 4.7 Export

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/export/:noteId/pdf` | Protected | Export note as PDF |
| `POST` | `/export/:noteId/docx` | Protected | Export note as DOCX |

**`POST /export/:noteId/pdf` Response `200`:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="Multiplication_and_Division_20260424_0830.pdf"

[Binary PDF stream]
```

**File Naming Convention:**
```
{sanitized_topic}_{YYYYMMDD}_{HHmm}.{ext}
e.g. Multiplication_and_Division_20260424_0830.pdf
```

**Server Logic:**
- Use `puppeteer` (headless Chrome) or `pdfkit` for PDF generation.
- Use `docx` npm package for DOCX generation.
- Increment `LessonNote.exportCount` on each export.
- Update `LessonNote.isExported = true`.

---

### 4.8 Resources

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/resources` | Protected | List accessible resources (public + user's) |
| `POST` | `/resources/upload` | Protected | Upload a resource file |
| `DELETE` | `/resources/:resourceId` | Protected | Delete own resource |
| `GET` | `/resources/match` | Protected | Auto-match resource to a curriculum context |

**`GET /resources/match?state=Lagos&subject=Mathematics&classLevel=JSS1` Response:**
```json
{
  "success": true,
  "data": {
    "matched": {
      "resourceId": "uuid",
      "resourceName": "New General Mathematics JSS1",
      "resourceType": "textbook",
      "isPublic": true,
      "fileUrl": "https://cdn.sabinote.ng/resources/..."
    }
  }
}
```

---

### 4.9 Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications` | Protected | Get all notifications (paginated) |
| `PATCH` | `/notifications/:id/read` | Protected | Mark one as read |
| `PATCH` | `/notifications/read-all` | Protected | Mark all as read |

---

### 4.10 Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/admin/users` | Admin | List all users |
| `GET` | `/admin/stats` | Admin | Platform stats (users, generations, revenue) |
| `POST` | `/admin/curriculum/seed` | Admin | Seed curriculum data from JSON |
| `POST` | `/admin/resources/upload` | Admin | Upload public resources (textbooks) |
| `POST` | `/admin/credit` | Admin | Manually credit a user's wallet |
| `GET` | `/admin/transactions` | Admin | All transactions |

---

## 5. AI Generation Pipeline

### 5.1 Prompt Construction Strategy

**Phase 1 — Lesson Plan Prompt:**

```
SYSTEM:
You are an expert Nigerian secondary school curriculum specialist.
Generate a structured Lesson Plan strictly compliant with NERDC standards for {state} State.
Respond in clean Markdown. Do not include any preamble or explanation.

USER:
Generate a Lesson Plan using the following curriculum details:

CURRICULUM CONTEXT:
- State: {state}
- Subject: {subject}
- Class Level: {classLevel}
- Term: {term}, Week: {week}
- Topic: {topic}
- Sub-topics: {subTopics}
- Learning Objectives: {objectives}
- Teaching Activities: {teachingActivities}
- Teaching Aids: {teachingAids}
- Reference Text: {referenceText}
- Lesson Duration: {durationMinutes} minutes
- Difficulty Level: {noteDifficultyLevel}

{if resourceId}
REFERENCE TEXTBOOK CONTEXT (use where relevant, do not copy verbatim):
{resourceExcerpt}
{/if}

Produce a Lesson Plan with the following sections:
1. Basic Information (Subject, Class, Topic, Duration, Date)
2. Behavioural Objectives (3-5, measurable)
3. Entry Behaviour / Prior Knowledge
4. Instructional Materials / Teaching Aids
5. Reference Materials
6. Introduction / Set Induction (with step-by-step teacher activities)
7. Development / Presentation (min. 3 steps, teacher & student activities)
8. Evaluation / Assessment (3-5 questions)
9. Conclusion / Assignment
```

**Phase 2 — Lesson Note Prompt:**

```
SYSTEM:
You are an expert Nigerian secondary school teacher.
Generate a comprehensive Lesson Note from the approved Lesson Plan.
The note is for the teacher's use. Write in clear, professional English.
Respond in clean Markdown.

USER:
Generate a comprehensive Lesson Note from this approved Lesson Plan:

{editedLessonPlanContent}

ORIGINAL CURRICULUM CONTEXT:
- State: {state}, Subject: {subject}, Class: {classLevel}
- Term: {term}, Week: {week}
- Objectives: {objectives}

The Lesson Note must include:
1. Full explanation of each sub-topic (as a teacher would narrate to students)
2. Worked examples with step-by-step solutions
3. Board summary / key points
4. Common misconceptions and how to address them
5. Differentiation tips (for slower vs faster learners)
6. Formative assessment questions with answers
7. Assignment (3-5 questions)
```

---

### 5.2 Cost Configuration (configurable via env or DB config table)

```
PLAN_COST_PARATS = 8
NOTE_COST_PARATS = 12
REGENERATE_COST_PARATS = 5
```

Store these in a `SystemConfig` key-value table (or `.env`) so they can be updated without code changes.

---

### 5.3 Error Handling for AI Calls

| Error | Action |
|-------|--------|
| Curriculum week not found | Return 404, prompt user to verify selection |
| Wallet insufficient | Return 402, redirect to Wallet |
| Claude API timeout | Rollback deduction, return 503 with retry option |
| Claude API returns empty/malformed | Rollback deduction, log prompt, return 500 |
| Topic genuinely out of scope | Return with warning flag, still show partial result |

---

## 6. Paystack Webhook Flow

```
Paystack Server
     │
     │ POST /api/v1/wallet/webhook
     │ Header: x-paystack-signature: HMAC-SHA512(secret, body)
     ▼
Express Webhook Handler
     │
     ├── 1. Verify HMAC signature (reject if invalid → 401)
     ├── 2. Parse event type
     │
     ├── event: "charge.success"
     │       ├── Check Transaction by paystackReference (idempotency)
     │       ├── If already processed → return 200 (no-op)
     │       ├── Credit Wallet (UPDATE balance + balanceAfter)
     │       ├── Update Transaction status = 'success'
     │       ├── Create Notification for user
     │       └── Return 200
     │
     └── Other events → log and return 200
```

> **Critical:** The webhook endpoint must be excluded from JWT middleware. Validate only via Paystack signature.

---

## 7. Recommended Additional Features

The following features are not in the v1.0 PRD but are strongly recommended based on the product's user needs:

### 7.1 Note Versioning (High Priority)
**Why:** Teachers edit their notes extensively. They need the ability to roll back to the AI-generated version if they make a mistake.

- Add `LessonNoteVersion` table: `(versionId, noteId, content, phase, savedAt, isAiGenerated)`
- Create a version snapshot every time the note is saved or AI output is received.
- Expose `GET /notes/:noteId/versions` and `POST /notes/:noteId/versions/:versionId/restore`.

---

### 7.2 Note Templates (Medium Priority)
**Why:** Some teachers may want to lock in a specific Lesson Plan structure their school administration requires.

- Add `NoteTemplate` table with a custom structure/scaffold.
- Allow template selection in Phase 1 configuration.
- Template overrides the default AI prompt structure.

---

### 7.3 Scheme of Work Auto-Planner (High Priority)
**Why:** Instead of generating one note at a time, a teacher could plan all 13 weeks of a term at once.

- `POST /generate/term-planner` — Takes state/subject/classLevel/term, returns all 13 week topics pre-listed.
- Teacher can then click into any week to generate a full note.
- This becomes the primary navigation model for the app.

---

### 7.4 Class Management (Medium Priority)
**Why:** Teachers handle multiple classes. Notes should be organizable by class.

- Add `Class` table: `(classId, userId, name, subject, classLevel, academicSession)`
- `LessonNote` gets a nullable `classId` FK.
- Dashboard view changes to "My Classes" with notes per class.

---

### 7.5 Usage Analytics for Teachers (Low Priority for v1, High for retention)
**Why:** Teachers want to see their productivity — how many notes generated, subjects covered, $Parats spent.

- `GET /users/analytics` — Returns: notes generated this month, most-used subjects, Parats consumed, export count.
- Surface as a simple stats card on the dashboard.

---

### 7.6 Shared/Public Resource Library (Medium Priority)
**Why:** Admin-uploaded NERDC textbooks are useful for all users. This drives generation quality significantly.

- Textbooks stored in `UserResource` with `isPublic = TRUE` and `uploadedBy = adminId`.
- Auto-matched by `(state, subject, classLevel)` before each generation.
- Teachers don't have to upload anything — it just works.

---

### 7.7 SystemConfig Table (High Priority — operational)
**Why:** Allows changing Parats costs, model names, and feature flags without deploying code.

```sql
Table: SystemConfig
──────────────────────────────
key     VARCHAR(100) PRIMARY KEY   -- e.g. "PLAN_COST_PARATS"
value   TEXT NOT NULL              -- e.g. "8"
type    ENUM('number','boolean','string')
updatedAt TIMESTAMP DEFAULT NOW()
```

---

### 7.8 Email Notifications (Medium Priority)
- Send email on: wallet top-up success, generation failure, new public resource added.
- Use Nodemailer + a transactional email service (Resend, Brevo).

---

## 8. Environment Variables Checklist

```env
# App
NODE_ENV=development
PORT=3000
APP_URL=https://api.sabinote.ng

# Database
DATABASE_URL=postgresql://user:password@host:5432/sabinote

# Auth
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

# Paystack
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Storage (for UserResources)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Cache (optional for prototype, recommended for production)
REDIS_URL=redis://localhost:6379

# Generation Costs
PLAN_COST_PARATS=8
NOTE_COST_PARATS=12
REGENERATE_COST_PARATS=5

# Parats Packages (JSON)
PARATS_PACKAGES=[{"id":"pkg_50","parats":50,"priceNGN":250},{"id":"pkg_100","parats":100,"priceNGN":500},{"id":"pkg_500","parats":500,"priceNGN":2000}]
```

---

## Appendix: Suggested Project Structure

```
sabinote-api/
├── src/
│   ├── config/           # env, db, logger
│   ├── middleware/        # auth, rateLimit, errorHandler
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── wallet/
│   │   ├── curriculum/
│   │   ├── generation/
│   │   ├── notes/
│   │   ├── export/
│   │   ├── resources/
│   │   ├── notifications/
│   │   └── admin/
│   ├── services/
│   │   ├── anthropic.service.ts   # AI call wrapper
│   │   ├── paystack.service.ts    # Paystack wrapper
│   │   ├── cache.service.ts       # curriculum caching
│   │   └── export.service.ts      # PDF/DOCX generation
│   ├── prisma/
│   │   └── schema.prisma
│   └── app.ts
├── seeds/
│   └── curriculum/
│       ├── lagos/
│       │   ├── mathematics_jss1.json
│       │   └── ...
│       └── kano/
│           └── ...
├── .env
└── package.json
```

---

*Document Version: 1.0 | SabiNote Backend Blueprint | Ready for Claude Code prototyping*
