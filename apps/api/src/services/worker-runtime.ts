import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  type WorkerCliOutput,
  type WorkerOutput,
  workerCliOutputSchema,
} from '@substrata/shared';
import { HttpError } from '../lib/errors';
import { getLocalStorageRoot, workerEntryPoint } from '../lib/paths';

const execFileAsync = promisify(execFile);

function logWorkerStderr(documentId: string, stderr?: string) {
  const trimmed = stderr?.trim();
  if (!trimmed) {
    return;
  }

  console.log('Classification worker diagnostic log', {
    documentId,
    stderr: trimmed
      .split('\n')
      .filter(Boolean)
      .slice(-80),
  });
}

function mapCliOutput(output: WorkerCliOutput): WorkerOutput {
  return {
    documentId: output.document_id,
    organizationId: output.organization_id,
    requiresHumanReview: output.requires_human_review,
    confidence: output.confidence,
    confidenceRationale: output.confidence_rationale,
    uncertaintyFlags: output.uncertainty_flags,
    extractedSpecs: output.extracted_specs.map((spec) => ({
      name: spec.name,
      displayName: spec.display_name,
      value: spec.value,
      unit: spec.unit ?? null,
      sourceSnippet: spec.source_snippet,
      sourceText: spec.source_text ?? null,
      sourcePageFrom: spec.source_page_from ?? null,
      sourcePageTo: spec.source_page_to ?? null,
      boundingBoxes: spec.bounding_boxes ?? null,
      importance: spec.importance,
      category: spec.category,
      confidence: spec.confidence,
      extractionRationale: spec.extraction_rationale,
      valueType: spec.value_type,
      extractionMethod: spec.extraction_method,
      extractionMethodVersion: spec.extraction_method_version,
    })),
    factIssues: output.fact_issues.map((issue) => ({
      issueType: issue.issue_type,
      summary: issue.summary,
      details: issue.details ?? null,
      primaryFactName: issue.primary_fact_name ?? null,
      relatedFactName: issue.related_fact_name ?? null,
    })),
    reviewPaths: output.review_paths.map((path) => ({
      pathKey: path.path_key,
      title: path.title,
      scope: path.scope,
      type: path.type,
      status: path.status,
      whyTriggered: path.why_triggered,
      technicalRiskArea: path.technical_risk_area ?? null,
      triggeredFactNames: path.triggered_fact_names,
      regulatoryCitations: path.regulatory_citations.map((citation) => ({
        citationLabel: citation.citation_label,
        citationText: citation.citation_text,
        source: citation.source,
        relevance: citation.relevance,
        regulationSource: {
          authority: citation.regulation_source.authority,
          regulationTitle: citation.regulation_source.regulation_title,
          regulationVersion: citation.regulation_source.regulation_version ?? null,
          citationText: citation.regulation_source.citation_text,
          citationUrl: citation.regulation_source.citation_url ?? null,
          sourceIdentifier: citation.regulation_source.source_identifier ?? null,
          section: citation.regulation_source.section ?? null,
          paragraph: citation.regulation_source.paragraph ?? null,
          kind: citation.regulation_source.kind,
          lastVerifiedAt: citation.regulation_source.last_verified_at ?? null,
          verificationStatus: citation.regulation_source.verification_status,
        },
      })),
      missingInformation: path.missing_information,
      reviewerQuestions: path.reviewer_questions,
      reviewerNotes: path.reviewer_notes ?? null,
      decisionRationale: path.decision_rationale ?? null,
    })),
    eccnCandidates: output.eccn_candidates.map((candidate) => ({
      eccn: candidate.eccn,
      title: candidate.title,
      officialTitle: candidate.official_title,
      confidence: candidate.confidence,
      confidenceRationale: candidate.confidence_rationale,
      status: candidate.status,
      regulationSource: {
        authority: candidate.regulation_source.authority,
        regulationTitle: candidate.regulation_source.regulation_title,
        regulationVersion: candidate.regulation_source.regulation_version ?? null,
        citationText: candidate.regulation_source.citation_text,
        citationUrl: candidate.regulation_source.citation_url ?? null,
        sourceIdentifier: candidate.regulation_source.source_identifier ?? null,
        section: candidate.regulation_source.section ?? null,
        paragraph: candidate.regulation_source.paragraph ?? null,
        kind: candidate.regulation_source.kind,
        lastVerifiedAt: candidate.regulation_source.last_verified_at ?? null,
        verificationStatus: candidate.regulation_source.verification_status,
      },
      paragraphReference: candidate.paragraph_reference ?? null,
      controlCriteria: candidate.control_criteria,
      factMappings: candidate.fact_mappings.map((mapping) => ({
        factName: mapping.fact_name,
        criterionLabel: mapping.criterion_label,
        matchedValue: mapping.matched_value,
        comparisonResult: mapping.comparison_result,
        notes: mapping.notes ?? null,
      })),
      matchedTechnicalFacts: candidate.matched_technical_facts,
      regulatoryCitations: [],
      whyItMayApply: candidate.why_it_may_apply,
      whyItMayNotApply: candidate.why_it_may_not_apply,
      mayApplyReasons: candidate.may_apply_reasons,
      mayNotApplyReasons: candidate.may_not_apply_reasons,
      missingInformation: candidate.missing_information,
      uncertaintyFlags: candidate.uncertainty_flags,
      reviewerQuestions: candidate.reviewer_questions,
      alternativeCandidates: candidate.alternative_candidates,
      reviewPathKey: candidate.review_path_key ?? null,
    })),
    memoMarkdown: output.memo_markdown,
    artifacts: {
      extractedTextPath: output.artifacts.extracted_text_path,
      structuredOutputPath: output.artifacts.structured_output_path,
      memoPath: output.artifacts.memo_path,
    },
    runMetadata: output.run_metadata ?? null,
  };
}

export async function runLocalWorker(input: {
  documentId: string;
  organizationId: string;
  sourceText: string;
  documentTitle: string;
  documentMetadata: {
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
    sourceType: string;
  };
}) {
  const runDir = path.join(
    getLocalStorageRoot(),
    'worker-inputs',
    input.documentId,
  );
  await fs.mkdir(runDir, { recursive: true });

  const textPath = path.join(runDir, 'document.txt');
  const payloadPath = path.join(runDir, 'payload.json');

  await fs.writeFile(textPath, input.sourceText, 'utf8');
  await fs.writeFile(
    payloadPath,
    JSON.stringify(
      {
        document_id: input.documentId,
        document_title: input.documentTitle,
        file_path: textPath,
        organization_id: input.organizationId,
        document_metadata: input.documentMetadata,
      },
      null,
      2,
    ),
    'utf8',
  );

  try {
    const { stdout, stderr } = await execFileAsync('python3', [workerEntryPoint, payloadPath], {
      maxBuffer: 1024 * 1024 * 4,
    });
    logWorkerStderr(input.documentId, stderr);

    const parsed = workerCliOutputSchema.parse(JSON.parse(stdout));
    return mapCliOutput(parsed);
  } catch (error) {
    const stderr =
      typeof error === 'object' &&
      error !== null &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? error.stderr
        : undefined;
    logWorkerStderr(input.documentId, stderr);
    const message =
      error instanceof Error ? error.message : 'Local worker execution did not complete.';
    throw new HttpError(500, 'Classification worker did not complete.', { message });
  }
}
