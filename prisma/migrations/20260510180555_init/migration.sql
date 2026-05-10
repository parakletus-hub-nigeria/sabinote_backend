-- CreateEnum
CREATE TYPE "Role" AS ENUM ('teacher', 'admin');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('basic', 'standard', 'advanced');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "TransactionPurpose" AS ENUM ('topup', 'lesson_plan_generation', 'lesson_note_generation', 'refund');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('textbook', 'scheme_supplement', 'past_question', 'other');

-- CreateEnum
CREATE TYPE "PromptPhase" AS ENUM ('plan', 'note');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('success', 'failed', 'timeout');

-- CreateEnum
CREATE TYPE "NotePhase" AS ENUM ('plan_only', 'complete');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('draft', 'finalised');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('wallet_topup', 'generation_complete', 'generation_failed', 'system');

-- CreateEnum
CREATE TYPE "ConfigType" AS ENUM ('number', 'boolean', 'string');

-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255),
    "googleId" VARCHAR(255),
    "phoneNumber" VARCHAR(20),
    "state" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'teacher',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "settingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultState" VARCHAR(100),
    "alwaysConfirmState" BOOLEAN NOT NULL DEFAULT true,
    "noteDifficultyLevel" "DifficultyLevel" NOT NULL DEFAULT 'standard',
    "defaultSubject" VARCHAR(100),
    "defaultClassLevel" VARCHAR(20),
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("settingId")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("walletId")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "transactionId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountAdded" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "amountDeducted" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "balanceBefore" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "purpose" "TransactionPurpose",
    "paystackReference" VARCHAR(255),
    "description" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "CurriculumWeek" (
    "curriculumWeekId" TEXT NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "classLevel" VARCHAR(20) NOT NULL,
    "term" SMALLINT NOT NULL,
    "week" SMALLINT NOT NULL,
    "topic" VARCHAR(255) NOT NULL,
    "subTopics" TEXT[],
    "objectives" TEXT[],
    "teachingActivities" TEXT,
    "teachingAids" TEXT,
    "evaluation" TEXT,
    "referenceText" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumWeek_pkey" PRIMARY KEY ("curriculumWeekId")
);

-- CreateTable
CREATE TABLE "UserResource" (
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceName" VARCHAR(255) NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "subject" VARCHAR(150),
    "classLevel" VARCHAR(20),
    "state" VARCHAR(100),
    "fileUrl" TEXT,
    "fileKey" TEXT,
    "fileSizeBytes" INTEGER,
    "mimeType" VARCHAR(50),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserResource_pkey" PRIMARY KEY ("resourceId")
);

-- CreateTable
CREATE TABLE "LessonNote" (
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumWeekId" TEXT,
    "transactionId" TEXT,
    "resourceId" TEXT,
    "name" VARCHAR(255),
    "subjectName" VARCHAR(150) NOT NULL,
    "topic" VARCHAR(255) NOT NULL,
    "classLevel" VARCHAR(20) NOT NULL,
    "term" SMALLINT,
    "week" SMALLINT,
    "session" VARCHAR(20),
    "state" VARCHAR(100),
    "lessonPlanContent" JSONB,
    "lessonNoteContent" JSONB,
    "parratCostPlan" DECIMAL(5,2),
    "parratCostNote" DECIMAL(5,2),
    "phase" "NotePhase" NOT NULL DEFAULT 'plan_only',
    "status" "NoteStatus" NOT NULL DEFAULT 'draft',
    "isExported" BOOLEAN NOT NULL DEFAULT false,
    "exportCount" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonNote_pkey" PRIMARY KEY ("noteId")
);

-- CreateTable
CREATE TABLE "UserPrompt" (
    "promptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT,
    "phase" "PromptPhase" NOT NULL,
    "promptText" TEXT NOT NULL,
    "modelUsed" VARCHAR(100),
    "tokensUsed" INTEGER,
    "responseStatus" "ResponseStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPrompt_pkey" PRIMARY KEY ("promptId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255),
    "body" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("notificationId")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "type" "ConfigType" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "idx_curriculum_lookup" ON "CurriculumWeek"("state", "subject", "classLevel", "term", "week");

-- CreateIndex
CREATE INDEX "idx_curriculum_state_subject" ON "CurriculumWeek"("state", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumWeek_state_subject_classLevel_term_week_key" ON "CurriculumWeek"("state", "subject", "classLevel", "term", "week");

-- CreateIndex
CREATE INDEX "idx_resource_state_subject" ON "UserResource"("state", "subject", "classLevel");

-- CreateIndex
CREATE INDEX "idx_lessonnote_user" ON "LessonNote"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_lessonnote_subject" ON "LessonNote"("userId", "subjectName", "classLevel");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResource" ADD CONSTRAINT "UserResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResource" ADD CONSTRAINT "UserResource_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_curriculumWeekId_fkey" FOREIGN KEY ("curriculumWeekId") REFERENCES "CurriculumWeek"("curriculumWeekId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("transactionId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "UserResource"("resourceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrompt" ADD CONSTRAINT "UserPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrompt" ADD CONSTRAINT "UserPrompt_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LessonNote"("noteId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
