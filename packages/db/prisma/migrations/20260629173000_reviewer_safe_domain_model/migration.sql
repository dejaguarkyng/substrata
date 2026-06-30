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
  ADD COLUMN "displayFileName" TEXT,
  ADD COLUMN "documentType" TEXT,
  ADD COLUMN "manufacturer" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourceDate" TIMESTAMP(3),
  ADD COLUMN "versionLabel" TEXT,
  ADD COLUMN "sha256" TEXT,
  ADD COLUMN "pageCount" INTEGER,
  ADD COLUMN "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "extractionError" TEXT,
  ADD COLUMN "origin" "DocumentOrigin" NOT NULL DEFAULT 'customer_provided',
  ADD COLUMN "visibility" "DocumentVisibility" NOT NULL DEFAULT 'private',
  ADD COLUMN "accessControl" JSONB;

UPDATE "Document"
SET
  "displayFileName" = "fileName",
  "extractionStatus" = 'completed',
  "origin" = CASE WHEN "sourceType" = 'seed' THEN 'public'::"DocumentOrigin" ELSE 'customer_provided'::"DocumentOrigin" END,
  "visibility" = CASE WHEN "sourceType" = 'seed' THEN 'organization'::"DocumentVisibility" ELSE 'private'::"DocumentVisibility" END
WHERE "displayFileName" IS NULL;

-- AlterTable
ALTER TABLE "ClassificationRun"
  ADD COLUMN "workflowState" "ReviewWorkflowState" NOT NULL DEFAULT 'draft_generated',
  ADD COLUMN "confidenceRationale" TEXT,
  ADD COLUMN "reviewerAssignedUserId" TEXT,
  ADD COLUMN "reviewerClaimedAt" TIMESTAMP(3),
  ADD COLUMN "finalInternalRecommendation" TEXT,
  ADD COLUMN "conclusionDisclaimer" TEXT,
  ADD COLUMN "lastReviewerActionAt" TIMESTAMP(3);

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
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "sourceDocumentId" TEXT,
  ADD COLUMN "label" TEXT,
  ADD COLUMN "sourceText" TEXT,
  ADD COLUMN "sourcePageFrom" INTEGER,
  ADD COLUMN "sourcePageTo" INTEGER,
  ADD COLUMN "boundingBoxes" JSONB,
  ADD COLUMN "extractionRationale" TEXT,
  ADD COLUMN "confidenceLevel" TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'product_identity',
  ADD COLUMN "valueType" "FactValueType" NOT NULL DEFAULT 'directly_stated',
  ADD COLUMN "extractionMethod" TEXT,
  ADD COLUMN "extractionMethodVersion" TEXT,
  ADD COLUMN "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reviewerStatus" "FactVerificationStatus" NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN "reviewerNote" TEXT,
  ADD COLUMN "reviewerCorrectedValue" TEXT,
  ADD COLUMN "reviewerCorrectedUnit" TEXT,
  ADD COLUMN "suppressFromMemo" BOOLEAN NOT NULL DEFAULT false;

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
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "confidenceRationale" TEXT,
  ADD COLUMN "status" "ECCNCandidateStatus" NOT NULL DEFAULT 'review_required',
  ADD COLUMN "officialTitle" TEXT,
  ADD COLUMN "regulationSourceId" TEXT,
  ADD COLUMN "regulationVersion" TEXT,
  ADD COLUMN "paragraphReference" TEXT,
  ADD COLUMN "controlCriteria" JSONB,
  ADD COLUMN "mayApplyReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mayNotApplyReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "alternativeCandidates" JSONB,
  ADD COLUMN "reviewerDisposition" TEXT,
  ADD COLUMN "reviewerDispositionRationale" TEXT,
  ADD COLUMN "reviewPathId" TEXT,
  ADD COLUMN "isSpecificEccn" BOOLEAN NOT NULL DEFAULT true;

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
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "reviewPathId" TEXT,
  ADD COLUMN "regulationSourceId" TEXT;

UPDATE "Citation" citation
SET "organizationId" = run."organizationId"
FROM "ClassificationRun" run
WHERE run."id" = citation."classificationRunId"
  AND citation."organizationId" IS NULL;

ALTER TABLE "Citation"
  ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ReviewMemo"
  ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reviewStateSnapshot" "ReviewWorkflowState" NOT NULL DEFAULT 'draft_generated',
  ADD COLUMN "reviewerStatusSnapshot" TEXT,
  ADD COLUMN "disclaimer" TEXT;

-- AlterTable
ALTER TABLE "HumanReview"
  ADD COLUMN "workflowState" "ReviewWorkflowState" NOT NULL DEFAULT 'awaiting_reviewer_assignment',
  ADD COLUMN "approvalScope" TEXT,
  ADD COLUMN "finalInternalRecommendation" TEXT,
  ADD COLUMN "caveats" TEXT,
  ADD COLUMN "assumptions" TEXT,
  ADD COLUMN "missingInformation" TEXT,
  ADD COLUMN "conclusionRecordedAt" TIMESTAMP(3),
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "reopenedAt" TIMESTAMP(3);

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
CREATE INDEX "ExtractedSpec_organizationId_createdAt_idx" ON "ExtractedSpec"("organizationId", "createdAt");
CREATE INDEX "ExtractedSpec_classificationRunId_idx" ON "ExtractedSpec"("classificationRunId");
CREATE INDEX "ECCNCandidate_organizationId_createdAt_idx" ON "ECCNCandidate"("organizationId", "createdAt");
CREATE INDEX "ECCNCandidate_classificationRunId_idx" ON "ECCNCandidate"("classificationRunId");
CREATE INDEX "Citation_organizationId_createdAt_idx" ON "Citation"("organizationId", "createdAt");
CREATE INDEX "Citation_classificationRunId_idx" ON "Citation"("classificationRunId");
CREATE UNIQUE INDEX "ReviewMemoVersion_classificationRunId_versionNumber_key" ON "ReviewMemoVersion"("classificationRunId", "versionNumber");
CREATE INDEX "ReviewMemoVersion_organizationId_createdAt_idx" ON "ReviewMemoVersion"("organizationId", "createdAt");
CREATE INDEX "ReviewPath_organizationId_createdAt_idx" ON "ReviewPath"("organizationId", "createdAt");
CREATE INDEX "ReviewPath_classificationRunId_status_idx" ON "ReviewPath"("classificationRunId", "status");
CREATE UNIQUE INDEX "ReviewPathFact_reviewPathId_extractedSpecId_key" ON "ReviewPathFact"("reviewPathId", "extractedSpecId");
CREATE INDEX "RegulationSource_organizationId_createdAt_idx" ON "RegulationSource"("organizationId", "createdAt");
CREATE UNIQUE INDEX "CandidateFactMapping_eccnCandidateId_extractedSpecId_criterionLabel_key" ON "CandidateFactMapping"("eccnCandidateId", "extractedSpecId", "criterionLabel");
CREATE INDEX "FactIssue_organizationId_createdAt_idx" ON "FactIssue"("organizationId", "createdAt");
CREATE INDEX "FactIssue_classificationRunId_issueType_idx" ON "FactIssue"("classificationRunId", "issueType");
CREATE INDEX "ReviewerAction_organizationId_createdAt_idx" ON "ReviewerAction"("organizationId", "createdAt");
CREATE INDEX "ReviewerAction_classificationRunId_createdAt_idx" ON "ReviewerAction"("classificationRunId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExtractedSpec" ADD CONSTRAINT "ExtractedSpec_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtractedSpec" ADD CONSTRAINT "ExtractedSpec_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ECCNCandidate" ADD CONSTRAINT "ECCNCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ECCNCandidate" ADD CONSTRAINT "ECCNCandidate_regulationSourceId_fkey" FOREIGN KEY ("regulationSourceId") REFERENCES "RegulationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ECCNCandidate" ADD CONSTRAINT "ECCNCandidate_reviewPathId_fkey" FOREIGN KEY ("reviewPathId") REFERENCES "ReviewPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
