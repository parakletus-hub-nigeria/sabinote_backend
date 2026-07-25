-- DropIndex
DROP INDEX "idx_general_curriculum_subject";

-- DropIndex
DROP INDEX "GeneralCurriculum_subject_classLevel_term_week_key";

-- AlterTable
ALTER TABLE "GeneralCurriculum" ADD COLUMN     "version" VARCHAR(255),
ADD COLUMN     "year" VARCHAR(255);

-- CreateIndex
CREATE INDEX "idx_general_curriculum_subject" ON "GeneralCurriculum"("subject", "classLevel", "year");

-- CreateIndex
CREATE UNIQUE INDEX "GeneralCurriculum_subject_classLevel_term_week_year_key" ON "GeneralCurriculum"("subject", "classLevel", "term", "week", "year");
