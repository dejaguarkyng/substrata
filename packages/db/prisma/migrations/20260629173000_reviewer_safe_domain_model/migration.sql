-- CreateEnum
CREATE TYPE "DocumentOrigin" AS ENUM ('public', 'customer_provided', 'internal');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('private', 'organization', 'public_demo');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "FactValueType" AS ENUM ('directly_stated', 'inferred', 'normalized', 'calculated');

-- CreateEnum
CREATE TYPE "FactVerificationStatus" AS ENUM ('unreviewed', 'verified', 'corrected', 'rejected', 'suppressed');

-- CreateEnum
CREATE TYPE "FactIssueType" AS ENUM ('contradiction', 'duplicate', 'family_scope_warning', 'unverified_identifier', 'ambiguous_unit');

-- CreateEnum
CREATE TYPE "ReviewWorkflowState" AS ENUM ('draft_generated', 'awaiting_reviewer_assignment', 'in_technical_review', 'needs_additional_documentation', 'escalated', 'reviewer_conclusion_recorded', 'approved_for_internal_use', 'closed');

-- CreateEnum
CREATE TYPE "ReviewPathType" AS ENUM ('product_area', 'technical_risk', 'encryption_security', 'special_environment', 'military_space', 'general_fallback');

-- CreateEnum
CREATE TYPE "ReviewPathStatus" AS ENUM ('open', 'excluded_by_reviewer', 'needs_more_evidence', 'escalated', 'resolved');

-- CreateEnum
CREATE TYPE "RegulationSourceKind" AS ENUM ('primary_regulation', 'agency_guidance', 'internal_playbook', 'reviewer_note');

-- CreateEnum
CREATE TYPE "RegulationVerificationStatus" AS ENUM ('current', 'needs_verification', 'archived', 'superseded');

-- CreateEnum
CREATE TYPE "ECCNCandidateStatus" AS ENUM ('proposed', 'approved', 'rejected', 'modified', 'review_required');

-- CreateEnum
CREATE TYPE "ReviewerActionType" AS ENUM ('claim_review', 'assign_review', 'update_workflow', 'verify_fact', 'correct_fact', 'reject_fact', 'suppress_fact', 'update_review_path', 'update_eccn_candidate', 'record_conclusion', 'reopen_review', 'export_memo');

-- AlterTable
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "displayFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "documentType" TEXT,
  ADD COLUMN IF NOT EXISTS "manufacturer" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "versionLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "sha256" TEXT,
  ADD COLUMN IF NOT EXISTS "pageCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "extractionError" TEXT,
  ADD COLUMN IF NOT EXISTS "origin" "DocumentOrigin" NOT NULL DEFAULT 'customer_provided',
  ADD COLUMN IF NOT EXISTS "visibility" "DocumentVisibility" NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS "accessControl" JSONB;

UPDATE "Document"
SET
  "displayFileName" = "fileName",
  "extractionStatus" = 'completed',
  "origin" = CASE WHEN "sourceType" = 'seed' THEN 'public'::"DocumentOrigin" ELSE 'customer_provided'::"DocumentOrigin" END,
  "visibility" = CASE WHEN "sourceType" = 'seed' THEN 'organization'::"DocumentVisibility" ELSE 'private'::"DocumentVisibility" END
WHERE "displayFileName" IS NULL;

-- AlterTable
ALTER TABLE "ClassificationRun"
  ADD COLUMN IF NOT EXISTS "workflowState" "ReviewWorkflowState" NOT NULL DEFAULT 'draft_generated',
  ADD COLUMN IF NOT EXISTS "confidenceRationale" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewerAssignedUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewerClaimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalInternalRecommendation" TEXT,
  ADD COLUMN IF NOT EXISTS "conclusionDisclaimer" TEXT,
  ADD COLUMN IF NOT EXISTS "lastReviewerActionAt" TIMESTAMP(3);

UPDATE "ClassificationRun"
SET
  "workflowState" = CASE
    WHEN "status" = 'completed' THEN 'awaiting_reviewer_assignment'::"ReviewWorkflowState"
    WHEN "status" = 'failed' THEN 'draft_generated'::"ReviewWorkflowState"
    ELSE 'draft_generated'::"ReviewWorkflowState"
  END,
  "conclusionDisclaimer" = 'Classification support, not legal advice. Requires qualified reviewer confirmation.'
WHERE "conclusionDisclaimer" IS NULL;

-- AlterTable
ALTER TABLE "ExtractedSpec"
  ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT,
  ADD COLUMN IF NOT EXISTS "label" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceText" TEXT,
  ADD COLUMN IF NOT EXISTS "sourcePageFrom" INTEGER,
  ADD COLUMN IF NOT EXISTS "sourcePageTo" INTEGER,
  ADD COLUMN IF NOT EXISTS "boundingBoxes" JSONB,
  ADD COLUMN IF NOT EXISTS "extractionRationale" TEXT,
  ADD COLUMN IF NOT EXISTS "confidenceLevel" TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'product_identity',
  ADD COLUMN IF NOT EXISTS "valueType" "FactValueType" NOT NULL DEFAULT 'directly_stated',
  ADD COLUMN IF NOT EXISTS "extractionMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "extractionMethodVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "reviewerStatus" "FactVerificationStatus" NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS "reviewerNote" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewerCorrectedValue" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewerCorrectedUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "suppressFromMemo" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ExtractedSpec" spec
SET
  "organizationId" = run."organizationId",
  "sourceDocumentId" = run."documentId",
  "label" = replace(spec."name", '_', ' '),
  "sourceText" = spec."sourceSnippet",
  "extractionRationale" = 'Captured from worker extraction output.'
FROM "ClassificationRun" run
WHERE run."id" = spec."classificationRunId"
  AND spec."organizationId" IS NULL;

ALTER TABLE "ExtractedSpec"
  ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ECCNCandidate"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "confidenceRationale" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "ECCNCandidateStatus" NOT NULL DEFAULT 'review_required',
  ADD COLUMN IF NOT EXISTS "officialTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "regulationSourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "regulationVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "paragraphReference" TEXT,
  ADD COLUMN IF NOT EXISTS "controlCriteria" JSONB,
  ADD COLUMN IF NOT EXISTS "mayApplyReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "mayNotApplyReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "alternativeCandidates" JSONB,
  ADD COLUMN IF NOT EXISTS "reviewerDisposition" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewerDispositionRationale" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewPathId" TEXT,
  ADD COLUMN IF NOT EXISTS "isSpecificEccn" BOOLEAN NOT NULL DEFAULT true;

UPDATE "ECCNCandidate" candidate
SET
  "organizationId" = run."organizationId",
  "officialTitle" = candidate."title",
  "confidenceRationale" = 'Migrated legacy candidate. Reviewer confirmation is required.',
  "mayApplyReasons" = ARRAY[candidate."whyItMayApply"],
  "mayNotApplyReasons" = ARRAY[candidate."whyItMayNotApply"]
FROM "ClassificationRun" run
WHERE run."id" = candidate."classificationRunId"
  AND candidate."organizationId" IS NULL;

ALTER TABLE "ECCNCandidate"
  ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Citation"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewPathId" TEXT,
  ADD COLUMN IF NOT EXISTS "regulationSourceId" TEXT;

UPDATE "Citation" citation
SET "organizationId" = run."organizationId"
FROM "ClassificationRun" run
WHERE run."id" = citation."classificationRunId"
  AND citation."organizationId" IS NULL;

ALTER TABLE "Citation"
  ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ReviewMemo"
  ADD COLUMN IF NOT EXISTS "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "reviewStateSnapshot" "ReviewWorkflowState" NOT NULL DEFAULT 'draft_generated',
  ADD COLUMN IF NOT EXISTS "reviewerStatusSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "disclaimer" TEXT;

-- AlterTable
ALTER TABLE "HumanReview"
  ADD COLUMN IF NOT EXISTS "workflowState" "ReviewWorkflowState" NOT NULL DEFAULT 'awaiting_reviewer_assignment',
  ADD COLUMN IF NOT EXISTS "approvalScope" TEXT,
  ADD COLUMN IF NOT EXISTS "finalInternalRecommendation" TEXT,
  ADD COLUMN IF NOT EXISTS "caveats" TEXT,
  ADD COLUMN IF NOT EXISTS "assumptions" TEXT,
  ADD COLUMN IF NOT EXISTS "missingInformation" TEXT,
  ADD COLUMN IF NOT EXISTS "conclusionRecordedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3);

UPDATE "HumanReview"
SET
  "workflowState" = CASE
    WHEN "status" = 'approved' THEN 'approved_for_internal_use'::"ReviewWorkflowState"
    WHEN "status" = 'reviewed' THEN 'reviewer_conclusion_recorded'::"ReviewWorkflowState"
    WHEN "status" = 'rejected' THEN 'escalated'::"ReviewWorkflowState"
    WHEN "status" = 'needs_more_information' THEN 'needs_additional_documentation'::"ReviewWorkflowState"
    ELSE 'awaiting_reviewer_assignment'::"ReviewWorkflowState"
  END,
  "conclusionRecordedAt" = CASE WHEN "status" IN ('approved', 'reviewed', 'rejected') THEN COALESCE("reviewedAt", CURRENT_TIMESTAMP) ELSE NULL END;

-- CreateTable
CREATE TABLE "ReviewMemoVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "classificationRunId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "contentMarkdown" TEXT NOT NULL,
  "reviewStateSnapshot" "ReviewWorkflowState" NOT NULL,
  "reviewerStatusSnapshot" TEXT,
  "disclaimer" TEXT,
  "generatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewMemoVersion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ReviewMemoVersion" (
  "id",
  "organizationId",
  "classificationRunId",
  "versionNumber",
  "contentMarkdown",
  "reviewStateSnapshot",
  "reviewerStatusSnapshot",
  "disclaimer",
  "generatedBy",
  "createdAt"
)
SELECT
  'memover_' || md5("id"),
  "organizationId",
  "classificationRunId",
  "versionNumber",
  "contentMarkdown",
  "reviewStateSnapshot",
  "reviewerStatusSnapshot",
  "disclaimer",
  "generatedBy",
  "createdAt"
FROM "ReviewMemo";

-- CreateTable
CREATE TABLE "ReviewPath" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "classificationRunId" TEXT NOT NULL,
  "type" "ReviewPathType" NOT NULL,
  "status" "ReviewPathStatus" NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "whyTriggered" TEXT NOT NULL,
  "technicalRiskArea" TEXT,
  "missingInformation" TEXT[],
  "reviewerQuestions" TEXT[],
  "reviewerNotes" TEXT,
  "decisionRationale" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewPathFact" (
  "id" TEXT NOT NULL,
  "reviewPathId" TEXT NOT NULL,
  "extractedSpecId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewPathFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulationSource" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "authority" TEXT NOT NULL,
  "regulationTitle" TEXT NOT NULL,
  "regulationVersion" TEXT,
  "citationText" TEXT NOT NULL,
  "citationUrl" TEXT,
  "sourceIdentifier" TEXT,
  "section" TEXT,
  "paragraph" TEXT,
  "kind" "RegulationSourceKind" NOT NULL,
  "lastVerifiedAt" TIMESTAMP(3),
  "verificationStatus" "RegulationVerificationStatus" NOT NULL DEFAULT 'needs_verification',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegulationSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateFactMapping" (
  "id" TEXT NOT NULL,
  "eccnCandidateId" TEXT NOT NULL,
  "extractedSpecId" TEXT NOT NULL,
  "criterionLabel" TEXT NOT NULL,
  "matchedValue" TEXT NOT NULL,
  "comparisonResult" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateFactMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactIssue" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "classificationRunId" TEXT NOT NULL,
  "primaryFactId" TEXT,
  "relatedFactId" TEXT,
  "issueType" "FactIssueType" NOT NULL,
  "summary" TEXT NOT NULL,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FactIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewerAction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "classificationRunId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actionType" "ReviewerActionType" NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewerAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtractedSpec_organizationId_createdAt_idx" ON "ExtractedSpec"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ExtractedSpec_classificationRunId_idx" ON "ExtractedSpec"("classificationRunId");
CREATE INDEX IF NOT EXISTS "ECCNCandidate_organizationId_createdAt_idx" ON "ECCNCandidate"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ECCNCandidate_classificationRunId_idx" ON "ECCNCandidate"("classificationRunId");
CREATE INDEX IF NOT EXISTS "Citation_organizationId_createdAt_idx" ON "Citation"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Citation_classificationRunId_idx" ON "Citation"("classificationRunId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewMemoVersion_classificationRunId_versionNumber_key" ON "ReviewMemoVersion"("classificationRunId", "versionNumber");
CREATE INDEX IF NOT EXISTS "ReviewMemoVersion_organizationId_createdAt_idx" ON "ReviewMemoVersion"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewPath_organizationId_createdAt_idx" ON "ReviewPath"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewPath_classificationRunId_status_idx" ON "ReviewPath"("classificationRunId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewPathFact_reviewPathId_extractedSpecId_key" ON "ReviewPathFact"("reviewPathId", "extractedSpecId");
CREATE INDEX IF NOT EXISTS "RegulationSource_organizationId_createdAt_idx" ON "RegulationSource"("organizationId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CandidateFactMapping_eccnCandidateId_extractedSpecId_criterionLabel_key" ON "CandidateFactMapping"("eccnCandidateId", "extractedSpecId", "criterionLabel");
CREATE INDEX IF NOT EXISTS "FactIssue_organizationId_createdAt_idx" ON "FactIssue"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "FactIssue_classificationRunId_issueType_idx" ON "FactIssue"("classificationRunId", "issueType");
CREATE INDEX IF NOT EXISTS "ReviewerAction_organizationId_createdAt_idx" ON "ReviewerAction"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewerAction_classificationRunId_createdAt_idx" ON "ReviewerAction"("classificationRunId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ExtractedSpec_organizationId_fkey'
      AND conrelid = '"ExtractedSpec"'::regclass
  ) THEN
    ALTER TABLE "ExtractedSpec"
      ADD CONSTRAINT "ExtractedSpec_organizationId_fkey"
      FOREIGN KEY ("organizationId")
      REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "ExtractedSpec" ADD CONSTRAINT "ExtractedSpec_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ECCNCandidate_organizationId_fkey'
      AND conrelid = '"ECCNCandidate"'::regclass
  ) THEN
    ALTER TABLE "ECCNCandidate"
      ADD CONSTRAINT "ECCNCandidate_organizationId_fkey"
      FOREIGN KEY ("organizationId")
      REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "ECCNCandidate" ADD CONSTRAINT "ECCNCandidate_regulationSourceId_fkey" FOREIGN KEY ("regulationSourceId") REFERENCES "RegulationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ECCNCandidate" ADD CONSTRAINT "ECCNCandidate_reviewPathId_fkey" FOREIGN KEY ("reviewPathId") REFERENCES "ReviewPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Citation_organizationId_fkey'
      AND conrelid = '"Citation"'::regclass
  ) THEN
    ALTER TABLE "Citation"
      ADD CONSTRAINT "Citation_organizationId_fkey"
      FOREIGN KEY ("organizationId")
      REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_reviewPathId_fkey" FOREIGN KEY ("reviewPathId") REFERENCES "ReviewPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_regulationSourceId_fkey" FOREIGN KEY ("regulationSourceId") REFERENCES "RegulationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewMemoVersion" ADD CONSTRAINT "ReviewMemoVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewMemoVersion" ADD CONSTRAINT "ReviewMemoVersion_classificationRunId_fkey" FOREIGN KEY ("classificationRunId") REFERENCES "ClassificationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewPath" ADD CONSTRAINT "ReviewPath_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewPath" ADD CONSTRAINT "ReviewPath_classificationRunId_fkey" FOREIGN KEY ("classificationRunId") REFERENCES "ClassificationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewPathFact" ADD CONSTRAINT "ReviewPathFact_reviewPathId_fkey" FOREIGN KEY ("reviewPathId") REFERENCES "ReviewPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewPathFact" ADD CONSTRAINT "ReviewPathFact_extractedSpecId_fkey" FOREIGN KEY ("extractedSpecId") REFERENCES "ExtractedSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegulationSource" ADD CONSTRAINT "RegulationSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateFactMapping" ADD CONSTRAINT "CandidateFactMapping_eccnCandidateId_fkey" FOREIGN KEY ("eccnCandidateId") REFERENCES "ECCNCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateFactMapping" ADD CONSTRAINT "CandidateFactMapping_extractedSpecId_fkey" FOREIGN KEY ("extractedSpecId") REFERENCES "ExtractedSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactIssue" ADD CONSTRAINT "FactIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactIssue" ADD CONSTRAINT "FactIssue_classificationRunId_fkey" FOREIGN KEY ("classificationRunId") REFERENCES "ClassificationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactIssue" ADD CONSTRAINT "FactIssue_primaryFactId_fkey" FOREIGN KEY ("primaryFactId") REFERENCES "ExtractedSpec"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FactIssue" ADD CONSTRAINT "FactIssue_relatedFactId_fkey" FOREIGN KEY ("relatedFactId") REFERENCES "ExtractedSpec"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewerAction" ADD CONSTRAINT "ReviewerAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewerAction" ADD CONSTRAINT "ReviewerAction_classificationRunId_fkey" FOREIGN KEY ("classificationRunId") REFERENCES "ClassificationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewerAction" ADD CONSTRAINT "ReviewerAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
