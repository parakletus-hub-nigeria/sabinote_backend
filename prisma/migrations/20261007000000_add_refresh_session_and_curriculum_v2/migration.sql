-- CreateEnum
CREATE TYPE "CurriculumStage" AS ENUM ('early_years', 'primary', 'junior_secondary', 'senior_secondary');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('draft', 'published', 'superseded', 'archived');

-- AlterTable
ALTER TABLE "LessonNote" ADD COLUMN     "curriculumReleaseId" TEXT,
ADD COLUMN     "curriculumUnitId" TEXT;

-- CreateTable
CREATE TABLE "RefreshSession" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "familyId" VARCHAR(100) NOT NULL,
    "deviceInfo" VARCHAR(255),
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" VARCHAR(255),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "CurriculumSource" (
    "sourceId" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "authority" VARCHAR(150) NOT NULL,
    "jurisdiction" VARCHAR(100) NOT NULL DEFAULT 'National',
    "websiteUrl" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumSource_pkey" PRIMARY KEY ("sourceId")
);

-- CreateTable
CREATE TABLE "CurriculumRelease" (
    "releaseId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "releaseTag" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "stage" "CurriculumStage" NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'draft',
    "checksum" VARCHAR(64),
    "publishedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumRelease_pkey" PRIMARY KEY ("releaseId")
);

-- CreateTable
CREATE TABLE "CurriculumUnit" (
    "unitId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "stage" "CurriculumStage" NOT NULL,
    "classLevel" VARCHAR(30) NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "term" SMALLINT NOT NULL,
    "week" SMALLINT NOT NULL,
    "topic" VARCHAR(255) NOT NULL,
    "subTopics" TEXT[],
    "learningObjectives" TEXT[],
    "competencies" TEXT[],
    "teachingActivities" TEXT,
    "teachingAids" TEXT,
    "evaluationGuide" TEXT,
    "referenceMaterials" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumUnit_pkey" PRIMARY KEY ("unitId")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "idx_session_user_revoked" ON "RefreshSession"("userId", "isRevoked");

-- CreateIndex
CREATE INDEX "idx_session_family" ON "RefreshSession"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumSource_code_key" ON "CurriculumSource"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumRelease_releaseTag_key" ON "CurriculumRelease"("releaseTag");

-- CreateIndex
CREATE INDEX "idx_release_stage_status" ON "CurriculumRelease"("stage", "status");

-- CreateIndex
CREATE INDEX "idx_unit_lookup" ON "CurriculumUnit"("releaseId", "subject", "classLevel", "term", "week");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumUnit_releaseId_classLevel_subject_term_week_key" ON "CurriculumUnit"("releaseId", "classLevel", "subject", "term", "week");

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_curriculumReleaseId_fkey" FOREIGN KEY ("curriculumReleaseId") REFERENCES "CurriculumRelease"("releaseId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_curriculumUnitId_fkey" FOREIGN KEY ("curriculumUnitId") REFERENCES "CurriculumUnit"("unitId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumRelease" ADD CONSTRAINT "CurriculumRelease_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CurriculumSource"("sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumRelease" ADD CONSTRAINT "CurriculumRelease_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CurriculumRelease"("releaseId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumUnit" ADD CONSTRAINT "CurriculumUnit_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CurriculumRelease"("releaseId") ON DELETE CASCADE ON UPDATE CASCADE;

