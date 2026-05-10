# SabiNote API Documentation

**Base URL:** `http://localhost:3000/api/v1` (dev) · `https://api.sabinote.ng/api/v1` (prod)

All protected endpoints require:
```
Authorization: Bearer <accessToken>
```

All responses follow this envelope:
```json
{ "success": true, "data": { ... } }
```

Errors return:
```json
{ "statusCode": 400, "message": "...", "error": "Bad Request" }
```

---

## 1. Authentication — `/auth`

### POST `/auth/register`
Register a new teacher account. Creates user, wallet (0 balance), and default settings atomically.

**Auth:** Public

**Body:**
```json
{
  "firstName": "Amaka",
  "lastName": "Obi",
  "email": "amaka@school.edu.ng",
  "password": "SecurePass123",
  "phoneNumber": "08012345678",   // optional
  "state": "Lagos"
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "uuid",
      "firstName": "Amaka",
      "lastName": "Obi",
      "email": "amaka@school.edu.ng",
      "state": "Lagos",
      "role": "teacher",
      "isVerified": false,
      "createdAt": "2026-05-10T10:00:00.000Z"
    },
    "wallet": { "walletId": "uuid", "balance": "0.00" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:** `409` email already exists · `400` validation failed

---

### POST `/auth/login`
Email and password login.

**Auth:** Public

**Body:**
```json
{ "email": "amaka@school.edu.ng", "password": "SecurePass123" }
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "user": { "userId": "uuid", "firstName": "Amaka", "email": "...", "state": "Lagos", "role": "teacher", "isVerified": false },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:** `401` invalid credentials

---

### POST `/auth/refresh`
Issue a new token pair using a valid refresh token. Send the refresh token in the request body.

**Auth:** Public (uses refresh token as Bearer + body)

**Headers:**
```
Authorization: Bearer <refreshToken>
```

**Body:**
```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:**
```json
{
  "success": true,
  "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." }
}
```

**Errors:** `401` invalid/expired refresh token

---

### POST `/auth/logout`
Stateless logout — client must discard both tokens after calling this.

**Auth:** Protected

**Response `200`:**
```json
{ "success": true, "message": "Logged out successfully" }
```

---

### GET `/auth/me`
Get the currently authenticated user's full profile, wallet, and settings.

**Auth:** Protected

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "firstName": "Amaka",
    "lastName": "Obi",
    "email": "amaka@school.edu.ng",
    "phoneNumber": "08012345678",
    "state": "Lagos",
    "role": "teacher",
    "isVerified": false,
    "createdAt": "2026-05-10T10:00:00.000Z",
    "wallet": { "walletId": "uuid", "balance": "85.00" },
    "settings": {
      "defaultState": "Lagos",
      "noteDifficultyLevel": "standard",
      "defaultSubject": null,
      "defaultClassLevel": null,
      "emailNotifications": true,
      "alwaysConfirmState": true
    }
  }
}
```

---

## 2. Users — `/users`

All endpoints require authentication.

### GET `/users/profile`
Full profile with wallet and settings. Identical shape to `GET /auth/me`.

---

### PATCH `/users/profile`
Update name, phone, or state. Send only the fields you want to change.

> **UX note:** When `state` changes, warn the user that curriculum context will change.

**Body (all optional):**
```json
{
  "firstName": "Amaka",
  "lastName": "Obi-Updated",
  "phoneNumber": "08099999999",
  "state": "Ogun"
}
```

**Response `200`:** Full updated profile (same shape as GET).

---

### GET `/users/settings`
Get user preference settings.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "settingId": "uuid",
    "userId": "uuid",
    "defaultState": "Lagos",
    "alwaysConfirmState": true,
    "noteDifficultyLevel": "standard",
    "defaultSubject": null,
    "defaultClassLevel": null,
    "emailNotifications": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### PATCH `/users/settings`
Update preferences. All fields optional.

**Body:**
```json
{
  "defaultState": "Lagos",
  "alwaysConfirmState": false,
  "noteDifficultyLevel": "advanced",   // "basic" | "standard" | "advanced"
  "defaultSubject": "Mathematics",
  "defaultClassLevel": "JSS1",
  "emailNotifications": true
}
```

---

### DELETE `/users/account`
Permanently delete the user's account. Cascades to wallet and settings.

**Response `200`:**
```json
{ "success": true, "message": "Account deleted" }
```

---

## 3. Wallet & Payments — `/wallet`

### GET `/wallet/packages`
List available Parats top-up packages. Fetch this to render the top-up UI — never hardcode prices in the frontend.

**Auth:** Protected

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "packages": [
      { "id": "pkg_50",  "parats": 50,  "priceNGN": 250  },
      { "id": "pkg_100", "parats": 100, "priceNGN": 500  },
      { "id": "pkg_500", "parats": 500, "priceNGN": 2000 }
    ]
  }
}
```

---

### GET `/wallet`
Get current wallet balance.

**Auth:** Protected

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "walletId": "uuid",
    "userId": "uuid",
    "balance": "85.00",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### GET `/wallet/transactions`
Paginated transaction history for the current user.

**Query params:** `page` (default: 1) · `limit` (default: 20)

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transactionId": "uuid",
        "type": "debit",
        "amountDeducted": "8.00",
        "amountAdded": "0.00",
        "balanceBefore": "93.00",
        "balanceAfter": "85.00",
        "purpose": "lesson_plan_generation",
        "status": "success",
        "description": "Lesson plan: Whole Numbers — Multiplication",
        "createdAt": "..."
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 5 }
  }
}
```

---

### POST `/wallet/topup/initiate`
Create a Paystack payment intent. Send only the `packageId` — the backend resolves the correct Parats and price from server config. Returns the Paystack checkout URL.

**Auth:** Protected

**Body:**
```json
{ "packageId": "pkg_100" }
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/abc123",
    "reference": "sabi_1234567890_abc12345",
    "transactionId": "uuid",
    "package": { "id": "pkg_100", "parats": 100, "priceNGN": 500 }
  }
}
```

**Frontend flow:**
1. Call `GET /wallet/packages` to render the package picker
2. User selects a package → call this endpoint with its `id`
3. Redirect user to `authorizationUrl` (new tab or same window)
4. Paystack redirects back to `PAYSTACK_CALLBACK_URL` (set in backend `.env`) with `?reference=...`
5. On the callback page, call `POST /wallet/topup/verify` with that reference as a fallback
6. The webhook fires automatically in the background — wallet is credited regardless

**Errors:** `400` unknown packageId

---

### POST `/wallet/topup/verify`
Manual fallback — call this on the Paystack callback page to confirm payment immediately, without waiting for the webhook. Safe to call even if the webhook already processed it (idempotent).

**Auth:** Protected

**Body:**
```json
{ "reference": "sabi_1234567890_abc12345" }
```

**Response `200`:**
```json
{ "success": true, "data": { "credited": true, "reference": "sabi_..." } }
```

**Errors:** `400` payment not yet successful · `404` reference not found for this user

---

### POST `/wallet/webhook`
Paystack server-to-server webhook. **Do not call from the frontend.** Validates HMAC-SHA512 signature and credits wallet on `charge.success`.

**Auth:** Public (signature-validated)

---

## 4. Curriculum — `/curriculum`

All endpoints require authentication. Use these to power your dropdowns before generation.

### GET `/curriculum/states`
List all states with curriculum data.

**Response `200`:**
```json
{
  "success": true,
  "data": { "states": ["Anambra", "Kano", "Lagos", "Ogun"] }
}
```

---

### GET `/curriculum/subjects`
List subjects available for a state and class level.

**Query params:** `state` · `classLevel`

**Example:** `GET /curriculum/subjects?state=Lagos&classLevel=JSS1`

**Response `200`:**
```json
{
  "success": true,
  "data": { "subjects": ["Basic Science", "Civic Education", "English Language", "Mathematics"] }
}
```

---

### GET `/curriculum/weeks`
List all weeks (with topics) for a given context. Use to populate the week picker.

**Query params:** `state` · `subject` · `classLevel` · `term`

**Example:** `GET /curriculum/weeks?state=Lagos&subject=Mathematics&classLevel=JSS1&term=1`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "weeks": [
      { "curriculumWeekId": "uuid", "week": 1, "topic": "Whole Numbers — Place Value" },
      { "curriculumWeekId": "uuid", "week": 2, "topic": "Whole Numbers — Addition and Subtraction" },
      { "curriculumWeekId": "uuid", "week": 3, "topic": "Whole Numbers — Multiplication and Division" }
    ]
  }
}
```

---

### GET `/curriculum/week`
Get the full content of a single curriculum week. Used internally before generation.

**Query params:** `state` · `subject` · `classLevel` · `term` · `week`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "curriculumWeekId": "uuid",
    "state": "Lagos",
    "subject": "Mathematics",
    "classLevel": "JSS1",
    "term": 1,
    "week": 3,
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

**Errors:** `404` week not found

---

### POST `/curriculum/seed`
Bulk upsert curriculum weeks. Also available at `POST /admin/curriculum/seed` (admin only).

**Body:**
```json
{
  "weeks": [
    {
      "state": "Lagos",
      "subject": "Mathematics",
      "classLevel": "JSS1",
      "term": 1,
      "week": 1,
      "topic": "Whole Numbers — Place Value",
      "subTopics": ["Units, tens, hundreds", "Expanded notation"],
      "objectives": ["Identify place values up to millions"],
      "teachingActivities": "Use place value charts...",
      "teachingAids": "Place value chart",
      "evaluation": "Write 3,045,267 in words",
      "referenceText": "New General Mathematics JSS1 p.1"
    }
  ]
}
```

**Response `200`:**
```json
{ "success": true, "data": { "upserted": 1, "total": 1 } }
```

---

## 5. Generation — `/generate`

This is the core feature. Two-phase flow: **Plan → Note**.

> **AI provider:** OpenRouter (`OPENROUTER_API_KEY` + `OPENROUTER_MODEL` env vars). Default model: `anthropic/claude-sonnet-4`.

> **Response format:** All AI-generated content is returned as **structured JSON objects** (not markdown strings). Each section is independently addressable so the frontend canvas can render and edit sections individually.

> **Cost:** Each generation deducts Parats from the wallet atomically. If AI generation fails, no Parats are deducted.

Current costs (configurable via env):
| Operation | Cost |
|---|---|
| Lesson Plan (Phase 1) | 8 Parats |
| Lesson Note (Phase 2) | 12 Parats |
| Regenerate | 5 Parats |

---

### POST `/generate/lesson-plan`
Phase 1. Fetches the state curriculum week, calls the AI, saves the structured plan, debits the wallet.

**Auth:** Protected

**Body:**
```json
{
  "curriculumWeekId": "uuid",
  "durationMinutes": 40,
  "resourceId": "uuid"   // optional — user's uploaded textbook
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "noteId": "uuid",
    "lessonPlan": {
      "metadata": {
        "subject": "Mathematics",
        "classLevel": "JSS1",
        "topic": "Whole Numbers — Multiplication and Division",
        "subTopics": ["Multiplication of 4-digit numbers", "Long division"],
        "term": 1,
        "week": 3,
        "duration": 40,
        "state": "Lagos",
        "session": "2025/2026"
      },
      "objectives": [
        "Multiply 4-digit numbers by 2-digit numbers without a calculator",
        "Apply long division to solve problems involving up to 4-digit dividends"
      ],
      "entryBehaviour": "Students can multiply 2-digit numbers and are familiar with basic division facts",
      "instructionalMaterials": ["Multiplication chart", "Counters", "Whiteboard"],
      "referenceMaterials": ["New General Mathematics JSS1 p.44"],
      "introduction": {
        "setInduction": "Teacher asks students to recall times tables and reviews with a quick 2-minute quiz on 2×2-digit multiplication.",
        "duration": "5 minutes"
      },
      "development": [
        {
          "step": 1,
          "teacherActivity": "Demonstrates 4-digit × 2-digit multiplication using the standard algorithm on the board with a worked example: 3,456 × 24.",
          "studentActivity": "Students copy the example and try a similar problem: 2,134 × 32.",
          "duration": "10 minutes"
        },
        {
          "step": 2,
          "teacherActivity": "Introduces long division with a step-by-step breakdown: 7,848 ÷ 12.",
          "studentActivity": "Students attempt 5,616 ÷ 16 in pairs.",
          "duration": "12 minutes"
        },
        {
          "step": 3,
          "teacherActivity": "Presents two word problems that require both operations.",
          "studentActivity": "Students solve word problems individually and share answers.",
          "duration": "8 minutes"
        }
      ],
      "evaluation": [
        "Calculate 4,372 × 23.",
        "Divide 6,552 by 18 and verify your answer.",
        "A school has 36 classrooms each with 48 students. How many students are there in total?"
      ],
      "conclusion": "Teacher recaps the steps for multiplication and division, emphasising the importance of place value at each stage.",
      "assignment": "Complete exercises 4a–4f on page 47 of New General Mathematics JSS1."
    },
    "walletBalance": 85,
    "parratsCost": 8
  }
}
```

**Errors:** `402` insufficient balance · `404` curriculum week not found · `503` AI unavailable

---

### POST `/generate/lesson-note`
Phase 2. Takes the (optionally edited) lesson plan JSON and generates the full teacher note.

**Auth:** Protected

**Body:**
```json
{
  "noteId": "uuid",
  "editedLessonPlan": { }   // optional — full LessonPlan JSON object if teacher edited the plan
}
```

> `editedLessonPlan` is optional. If omitted, the stored plan from Phase 1 is used as-is.  
> This is the **human-in-the-loop (HITL)** step — teachers can refine the plan before committing to note generation.  
> If provided, send the **complete** lesson plan JSON object (same shape as the `lessonPlan` object returned by Phase 1, not a partial patch).

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "noteId": "uuid",
    "lessonNote": {
      "metadata": {
        "subject": "Mathematics",
        "classLevel": "JSS1",
        "topic": "Whole Numbers — Multiplication and Division",
        "subTopics": ["Multiplication of 4-digit numbers", "Long division"],
        "term": 1,
        "week": 3,
        "duration": 40,
        "state": "Lagos",
        "session": "2025/2026"
      },
      "introduction": {
        "narrative": "Good morning class! Today we are going to explore how to multiply large numbers and divide them efficiently. Who can tell me what 12 × 12 is? ...",
        "priorKnowledge": "Teacher asks 3 quick mental math questions on 2-digit multiplication to activate prior knowledge. Students respond chorally.",
        "duration": "5 minutes"
      },
      "body": [
        {
          "subTopic": "Multiplication of 4-digit numbers",
          "explanation": "To multiply a 4-digit number by a 2-digit number, we use the standard long multiplication algorithm. We multiply by the units digit first, then by the tens digit (shifting one place to the left), and add the partial products.",
          "teacherNarrative": "Now watch carefully as I write 3,456 × 24 on the board. First, I multiply 3,456 by 4 — the units digit of 24. 6 × 4 = 24, write 4 carry 2 ...",
          "workedExamples": [
            {
              "problem": "Calculate 3,456 × 24",
              "solution": "Step 1: 3,456 × 4 = 13,824\nStep 2: 3,456 × 20 = 69,120\nStep 3: 13,824 + 69,120 = 82,944"
            }
          ],
          "boardSummary": [
            "Multiply by units digit first",
            "Multiply by tens digit, shift one place left",
            "Add both partial products"
          ]
        }
      ],
      "misconceptions": [
        {
          "misconception": "Students forget to shift one place left when multiplying by the tens digit.",
          "correction": "Remind students that multiplying by 20 is the same as multiplying by 2 and then by 10 — write a zero placeholder in the units column."
        }
      ],
      "differentiation": {
        "slowerLearners": "Provide a multiplication grid for reference. Start with 3-digit × 1-digit problems before progressing to the full 4-digit × 2-digit algorithm.",
        "fasterLearners": "Challenge students to multiply 5-digit numbers by 2-digit numbers and explore mental estimation strategies using rounding."
      },
      "formativeAssessment": [
        {
          "question": "What do you write in the units column when starting the second row of long multiplication?",
          "expectedAnswer": "A zero (0) placeholder, because we are multiplying by the tens digit."
        },
        {
          "question": "Calculate 2,134 × 32.",
          "expectedAnswer": "68,288"
        },
        {
          "question": "A factory produces 1,245 items per day. How many items does it produce in 22 days?",
          "expectedAnswer": "27,390 items"
        }
      ],
      "conclusion": "Teacher asks students to summarise the two algorithms in their own words. Emphasises that checking by estimation (rounding to nearest hundred) is always good practice. Reviews the assignment.",
      "assignment": [
        "Calculate 5,678 × 34.",
        "Divide 8,748 by 12 and verify your answer by multiplying back.",
        "A school bus carries 48 students per trip. How many students can it carry in 125 trips?"
      ]
    },
    "walletBalance": 73,
    "parratsCost": 12
  }
}
```

**Errors:** `402` insufficient balance · `400` note is already complete · `403` note belongs to another user · `503` AI unavailable

---

### POST `/generate/regenerate`
Regenerate either phase of an existing note. Overwrites the stored content for that phase.

**Auth:** Protected

**Body:**
```json
{
  "noteId": "uuid",
  "phase": "plan",   // "plan" | "note"
  "additionalInstructions": "Make it more interactive and include group activities"
}
```

> `additionalInstructions` is optional. If provided, it is appended to the AI prompt so the regenerated content reflects the teacher's specific feedback.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "noteId": "uuid",
    "content": { },   // LessonPlan object if phase="plan", LessonNote object if phase="note"
    "walletBalance": 68,
    "parratsCost": 5
  }
}
```

**Errors:** `402` insufficient balance · `403` note belongs to another user · `404` note not found · `503` AI unavailable

---

## 6. Notes Library — `/notes`

CRUD for lesson notes. Notes are generated by `/generate` endpoints and stored here.

### GET `/notes`
Paginated list of the current user's notes.

**Auth:** Protected

**Query params:** `page` · `limit` · `subject` · `classLevel`

**Example:** `GET /notes?page=1&limit=20&subject=Mathematics&classLevel=JSS1`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "notes": [
      {
        "noteId": "uuid",
        "name": "JSS1 Mathematics Wk3 T1",
        "subjectName": "Mathematics",
        "topic": "Whole Numbers — Multiplication and Division",
        "classLevel": "JSS1",
        "term": 1,
        "week": 3,
        "phase": "complete",
        "status": "draft",
        "isExported": false,
        "createdAt": "2026-05-10T10:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 12 }
  }
}
```

---

### GET `/notes/search`
Full-text search across topic, subject name, and note name.

**Query params:** `q` (required) · `subject` · `classLevel`

**Example:** `GET /notes/search?q=multiplication&classLevel=JSS1`

**Response `200`:** Same shape as list but without pagination (max 50 results).

---

### GET `/notes/:noteId`
Get a single note's full content including lesson plan and lesson note JSON objects.

**Auth:** Protected

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "noteId": "uuid",
    "name": "JSS1 Mathematics Wk3 T1",
    "subjectName": "Mathematics",
    "topic": "Whole Numbers — Multiplication and Division",
    "classLevel": "JSS1",
    "term": 1,
    "week": 3,
    "state": "Lagos",
    "session": "2025/2026",
    "lessonPlanContent": { },   // full LessonPlan JSON object (null if not yet generated)
    "lessonNoteContent": { },   // full LessonNote JSON object (null if phase is plan_only)
    "phase": "complete",        // "plan_only" | "complete"
    "status": "draft",          // "draft" | "finalised"
    "isExported": false,
    "exportCount": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors:** `404` not found · `403` note belongs to another user

---

### PATCH `/notes/:noteId`
Auto-save canvas edits. Send the updated JSON object for whichever section was edited. Call with debounce (e.g., 2 seconds after the user stops typing).

**Auth:** Protected

**Body (all optional — send only what changed):**
```json
{
  "lessonPlanContent": { },   // complete LessonPlan JSON object
  "lessonNoteContent": { }    // complete LessonNote JSON object
}
```

> Send the **full section object**, not a partial patch. The backend replaces the entire field.

**Response `200`:**
```json
{ "success": true, "data": { "savedAt": "2026-05-10T10:31:22.000Z" } }
```

---

### DELETE `/notes/:noteId`
Permanently delete a note.

**Response `200`:**
```json
{ "success": true, "message": "Note deleted" }
```

---

## 7. Notifications — `/notifications`

### GET `/notifications`
Paginated list of the user's notifications, newest first.

**Query params:** `page` · `limit`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "notificationId": "uuid",
        "type": "wallet_topup",
        "title": "Wallet Topped Up",
        "body": "Your wallet has been credited with 100 Parats.",
        "isRead": false,
        "metadata": { "reference": "sabi_...", "parats": 100 },
        "createdAt": "..."
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 3 }
  }
}
```

**Notification types:** `wallet_topup` · `generation_complete` · `generation_failed` · `system`

---

### PATCH `/notifications/read-all`
Mark all unread notifications as read.

**Response `200`:**
```json
{ "success": true, "message": "All notifications marked as read" }
```

---

### PATCH `/notifications/:id/read`
Mark a single notification as read.

**Response `200`:** Returns the updated notification object.

---

## 8. Resources — `/resources`

Textbooks and reference materials used during generation.

### GET `/resources`
List all resources the user can access: their own private uploads plus all public (admin-uploaded) resources.

**Query params (all optional):** `state` · `subject` · `classLevel`

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "resourceId": "uuid",
      "resourceName": "New General Mathematics JSS1",
      "resourceType": "textbook",
      "subject": "Mathematics",
      "classLevel": "JSS1",
      "state": "Lagos",
      "fileUrl": "https://res.cloudinary.com/...",
      "mimeType": "application/pdf",
      "isPublic": true
    }
  ]
}
```

**Resource types:** `textbook` · `scheme_supplement` · `past_question` · `other`

---

### POST `/resources/upload`
Upload a personal resource (PDF, etc.). Use `multipart/form-data`.

**Auth:** Protected

**Form fields:**
| Field | Type | Required |
|---|---|---|
| `file` | File (max 10 MB) | Yes |
| `resourceName` | string | Yes |
| `resourceType` | `textbook` \| `scheme_supplement` \| `past_question` \| `other` | Yes |
| `subject` | string | No |
| `classLevel` | string | No |
| `state` | string | No |

**Response `201`:** Returns the created resource object.

---

### DELETE `/resources/:resourceId`
Delete a resource you own. Also deletes the file from Cloudinary.

**Response `200`:**
```json
{ "success": true, "message": "Resource deleted" }
```

---

### GET `/resources/match`
Auto-match a public resource for a given curriculum context. Used internally before generation to suggest a textbook.

**Query params:** `state` · `subject` · `classLevel`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "matched": {
      "resourceId": "uuid",
      "resourceName": "New General Mathematics JSS1",
      "resourceType": "textbook",
      "isPublic": true,
      "fileUrl": "https://res.cloudinary.com/..."
    }
  }
}
```

`matched` is `null` if no resource is found.

---

## 9. Export — `/export`

### POST `/export/:noteId/pdf`
Download the note as a PDF file.

**Auth:** Protected

**Response `200`:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="Multiplication_20260510.pdf"

[Binary PDF stream]
```

Handle this as a file download (e.g., `window.open(url)` or `<a>` with `download`). Include the `Authorization` header.

**Errors:** `404` not found · `403` wrong user

---

### POST `/export/:noteId/docx`
Download the note as a Word document.

**Response `200`:**
```
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="Multiplication_20260510.docx"
```

---

## 10. Admin — `/admin`

All admin endpoints require a user with `role: "admin"`. Returns `403` for non-admin users.

### GET `/admin/users`
Paginated list of all users with wallet balances.

**Query params:** `page` · `limit`

---

### GET `/admin/stats`
Platform-level statistics.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 1204,
    "totalNotes": 8932,
    "notesThisMonth": 423,
    "totalTopups": 890,
    "totalRevenueNGN": "445000.00"
  }
}
```

---

### POST `/admin/curriculum/seed`
Bulk upsert curriculum weeks. Same body as `POST /curriculum/seed`. Idempotent — safe to run multiple times.

---

### POST `/admin/resources/upload`
Upload a public resource (NERDC textbook) accessible to all users. Uses `multipart/form-data`. Same fields as `POST /resources/upload`. Uploaded resources are automatically set to `isPublic: true`.

---

### POST `/admin/credit`
Manually credit a user's wallet.

**Body:**
```json
{
  "userId": "uuid",
  "amount": 50,
  "reason": "Compensation for failed generation"
}
```

**Response `200`:**
```json
{ "success": true, "data": { "newBalance": 135 } }
```

---

### GET `/admin/transactions`
All platform transactions with user details.

**Query params:** `page` · `limit`

---

## Error Reference

| Status | Meaning |
|---|---|
| `400` | Validation failed — check the `message` field |
| `401` | Missing or invalid/expired access token |
| `402` | Insufficient Parats balance |
| `403` | Authenticated but not authorised (wrong user or not admin) |
| `404` | Resource not found |
| `409` | Conflict (e.g., email already registered) |
| `503` | AI service unavailable — retry |

---

## Token Lifecycle

```
Register/Login → { accessToken (15m), refreshToken (7d) }
    ↓
Use accessToken for all protected requests
    ↓
accessToken expires → POST /auth/refresh with refreshToken in Authorization header + body
    ↓
New { accessToken, refreshToken } pair issued
    ↓
Logout → discard both tokens client-side
```

Store tokens securely (HttpOnly cookies recommended for web, SecureStore for React Native).

---

## Two-Phase Generation Flow

```
1. GET /curriculum/weeks?state=Lagos&subject=Mathematics&classLevel=JSS1&term=1
   → populate week picker

2. User selects week → store curriculumWeekId

3. POST /generate/lesson-plan  { curriculumWeekId, durationMinutes }
   → returns { noteId, lessonPlan: { metadata, objectives, development, ... } }
   → render each JSON section as an editable canvas block

4. Teacher reviews and optionally edits the plan canvas blocks
   → auto-save: PATCH /notes/:noteId { lessonPlanContent: <edited JSON> }

5. Teacher clicks "Generate Note"
   → POST /generate/lesson-note { noteId, editedLessonPlan: <current plan JSON> }
   → returns { noteId, lessonNote: { metadata, introduction, body, ... } }
   → render each JSON section as editable canvas blocks

6. Teacher edits note sections
   → auto-save: PATCH /notes/:noteId { lessonNoteContent: <edited JSON> }

7. Export: POST /export/:noteId/pdf  or  /docx
   → AI-structured sections rendered into a formatted NERDC-compliant document
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Access token signing secret |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token signing secret |
| `JWT_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `OPENROUTER_API_KEY` | Yes | — | OpenRouter API key |
| `OPENROUTER_MODEL` | No | `anthropic/claude-sonnet-4` | Model to use via OpenRouter |
| `PAYSTACK_SECRET_KEY` | Yes | — | Paystack secret key |
| `PAYSTACK_WEBHOOK_SECRET` | Yes | — | Paystack webhook signing secret |
| `PAYSTACK_CALLBACK_URL` | Yes | — | Frontend URL Paystack redirects to after payment |
| `CLOUDINARY_CLOUD_NAME` | Yes | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | — | Cloudinary API secret |
| `PLAN_COST_PARATS` | No | `8` | Parats deducted for lesson plan generation |
| `NOTE_COST_PARATS` | No | `12` | Parats deducted for lesson note generation |
| `REGENERATE_COST_PARATS` | No | `5` | Parats deducted per regeneration |
| `PARATS_PACKAGES` | No | See `.env` | JSON array of top-up packages: `[{"id":"pkg_50","parats":50,"priceNGN":250}]` |
