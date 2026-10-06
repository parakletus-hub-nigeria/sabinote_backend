# SabiNote Backend Changelog

All notable changes to the SabiNote backend service are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.2] - 2026-10-06
### Added
- **Pedagogical Grounding & Classroom Pacing Engine**:
  - Educational stage classification (Early Years, Primary, JSS, SSS).
  - Bloom's taxonomy domain classification (Cognitive, Affective, Psychomotor).
  - Proportional classroom period pacing engine (30–80 mins).
  - Differentiated instruction & anticipated pupil misconceptions generator.
- **Reliability & Concurrency Hotfixes**:
  - ARCH-005 concurrency grace window (10s) in `auth.service.ts` to protect sessions against in-flight refresh collisions.
  - Auto-provisioning default wallet (24.00 Parats) on `getBalance` and `initiateTopup` in `wallet.service.ts`.
  - Public packages endpoint (`GET /api/v1/wallet/packages`) without authentication lock.

---

## [2.0.1] - 2026-10-06
### Added
- **Dual-Read Curriculum Engine (ARCH-007)**:
  - `CurriculumService` prioritizes querying versioned, published `CurriculumUnit` releases before falling back gracefully to legacy rows (`GeneralCurriculum` and `CurriculumWeek`).
  - Added unit resolver `getUnitById(id)` for direct grounding.
- **2025 Scheme of Work Data Baseline (6,182 Canonical Units)**:
  - Junior Secondary (JSS 1-3): 1,107 units across all national subjects.
  - Senior Secondary (SSS 1-3): 2,219 units across 26 verified subjects.
  - Primary (Primary 1-6): 2,103 units across 1Core subjects.
  - Early Childhood Education: 753 units across Pre-Nursery and Nursery 1-3.
- **Curriculum Releases & Units API Endpoints**:
  - `GET /api/v1/curriculum/releases`: Browse curriculum releases with stage and status filters.
  - `POST /api/v1/curriculum/releases`: Admin creation of versioned curriculum releases with auto-provisioned sources.
  - `POST /api/v1/curriculum/releases/:id/units`: Bulk import and upsert of canonical units.
  - `GET /api/v1/curriculum/releases/:id/units`: Query units by class level, subject, term, and week.
- **Lesson Note Generation Grounding**:
  - `NotesService.generate()` links generated lesson plans and notes directly to `curriculumReleaseId` and `curriculumUnitId`.
- **System Release & Version API**:
  - `GET /api/v1/system/version`: Returns active release metadata, codename, environment, and curriculum baseline statistics.
  - `GET /api/v1/system/releases`: Full platform release history.
  - Updated `GET /` and `GET /health` with dynamic versioning from `release.manifest.ts`.
- **Automated Seed & Backfill CLI Tooling**:
  - `npm run curriculum:seed`: Seeds 6,182 units from canonical 2025 scheme JSON files.
  - `npm run curriculum:backfill`: Backfills historical unlinked lesson notes into the `LEGACY-COMPATIBILITY-2024` release.

### Changed
- Bumped package version from `0.0.1` to `2.0.1`.
- Synchronized release manifest with `release.manifest.json`.

---

## [2.0.0] - 2026-09-28
### Added
- **Revocable Refresh Token Sessions (ARCH-005)**:
  - Secure PostgreSQL token persistence with SHA-256 hash storage.
  - Immediate session invalidation on logout and password reset.
- **Traceability & Correlation Tracking (ARCH-014)**:
  - `CorrelationIdMiddleware` assigns and echoes `X-Correlation-ID` across all HTTP request/response flows.
  - Integrated with NestJS logger and `HttpExceptionFilter`.
- **Automated Swagger/OpenAPI Contract**:
  - Interactive API documentation live at `/api-docs`.

---

## [1.0.0] - 2026-08-15
### Added
- Initial release of SabiNote Backend API.
- Authentication with JWT, user registration, and wallet management with Paystack.
- AI-driven lesson note generation engine.
