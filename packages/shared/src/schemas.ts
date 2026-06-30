import { z } from 'zod';

export const confidenceLevelSchema = z.enum(['high', 'medium', 'low']);
export const membershipRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'REVIEWER',
  'ANALYST',
  'VIEWER',
]);

export const uncertaintyFlagSchema = z.enum([
  'missing_key_specs',
  'ambiguous_datasheet_language',
  'multiple_plausible_eccns',
  'limited_regulatory_coverage',
  'requires_engineering_confirmation',
  'family_level_source_requires_device_specific_confirmation',
  'crypto_relevance_requires_qualified_review',
  'conflicting_source_values',
  'missing_regulatory_mapping',
]);

export const reviewWorkflowStateSchema = z.enum([
  'draft_generated',
  'awaiting_reviewer_assignment',
  'in_technical_review',
  'needs_additional_documentation',
  'escalated',
  'reviewer_conclusion_recorded',
  'approved_for_internal_use',
  'closed',
]);

export const reviewPathStatusSchema = z.enum([
  'open',
  'excluded_by_reviewer',
  'needs_more_evidence',
  'escalated',
  'resolved',
]);

export const reviewPathTypeSchema = z.enum([
  'product_area',
  'technical_risk',
  'encryption_security',
  'special_environment',
  'military_space',
  'general_fallback',
]);

export const factValueTypeSchema = z.enum([
  'directly_stated',
  'inferred',
  'normalized',
  'calculated',
]);

export const factVerificationStatusSchema = z.enum([
  'unreviewed',
  'verified',
  'corrected',
  'rejected',
  'suppressed',
]);

export const factIssueTypeSchema = z.enum([
  'contradiction',
  'duplicate',
  'family_scope_warning',
  'unverified_identifier',
  'ambiguous_unit',
]);

export const regulationSourceKindSchema = z.enum([
  'primary_regulation',
  'agency_guidance',
  'internal_playbook',
  'reviewer_note',
]);

export const regulationVerificationStatusSchema = z.enum([
  'current',
  'needs_verification',
  'archived',
  'superseded',
]);

export const eccnCandidateStatusSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
  'modified',
  'review_required',
]);

export const reviewSubmissionStatusSchema = z.enum([
  'pending_review',
  'reviewed',
  'needs_more_information',
  'approved',
  'rejected',
]);

export const documentCreateSchema = z.object({
  title: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  storagePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  rawText: z.string().optional(),
  sourceType: z.enum(['upload', 'seed', 'manual']).default('upload'),
  documentType: z.string().trim().max(120).optional().or(z.literal('')),
  manufacturer: z.string().trim().max(255).optional().or(z.literal('')),
  sourceUrl: z.string().trim().url().max(2000).optional().or(z.literal('')),
  versionLabel: z.string().trim().max(120).optional().or(z.literal('')),
  sha256: z.string().trim().length(64).optional().or(z.literal('')),
  pageCount: z.number().int().positive().optional(),
  extractionStatus: z.enum(['pending', 'completed', 'failed']).default('completed'),
  origin: z.enum(['public', 'customer_provided', 'internal']).default('customer_provided'),
  visibility: z.enum(['private', 'organization', 'public_demo']).default('private'),
});

export const classificationRunCreateSchema = z.object({
  trigger: z.enum(['manual', 'api', 'reprocess']).default('manual'),
});

export const reviewSubmissionSchema = z.object({
  status: reviewSubmissionStatusSchema,
  workflowState: reviewWorkflowStateSchema.default('in_technical_review'),
  note: z.string().trim().max(4000).optional().default(''),
  approvalScope: z.string().trim().max(255).optional().or(z.literal('')),
  finalInternalRecommendation: z.string().trim().max(4000).optional().or(z.literal('')),
  caveats: z.string().trim().max(4000).optional().or(z.literal('')),
  assumptions: z.string().trim().max(4000).optional().or(z.literal('')),
  missingInformation: z.string().trim().max(4000).optional().or(z.literal('')),
});

export const publicDemoPublishSchema = z.object({
  confirmation: z.literal(true),
  publicTitle: z.string().trim().max(160).optional().or(z.literal('')),
  publicSummary: z.string().trim().max(600).optional().or(z.literal('')),
  sourceDocumentDisplayName: z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal('')),
});

export const factReviewUpdateSchema = z.object({
  reviewerStatus: factVerificationStatusSchema,
  reviewerNote: z.string().trim().max(4000).optional().or(z.literal('')),
  reviewerCorrectedValue: z.string().trim().max(1000).optional().or(z.literal('')),
  reviewerCorrectedUnit: z.string().trim().max(120).optional().or(z.literal('')),
  suppressFromMemo: z.boolean().optional().default(false),
});

export const reviewPathUpdateSchema = z.object({
  status: reviewPathStatusSchema,
  reviewerNotes: z.string().trim().max(4000).optional().or(z.literal('')),
  decisionRationale: z.string().trim().max(4000).optional().or(z.literal('')),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
  reviewerQuestions: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
});

export const eccnCandidateUpdateSchema = z.object({
  status: eccnCandidateStatusSchema,
  reviewerDisposition: z.string().trim().max(255).optional().or(z.literal('')),
  reviewerDispositionRationale: z.string().trim().max(4000).optional().or(z.literal('')),
  confidenceRationale: z.string().trim().max(4000).optional().or(z.literal('')),
  alternativeCandidates: z
    .array(
      z.object({
        eccn: z.string().trim().min(1).max(32),
        title: z.string().trim().min(1).max(255),
        status: z.enum(['considered', 'excluded', 'open']),
        rationale: z.string().trim().min(1).max(1000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
});

const passwordSchema = z.string().min(12).max(256);

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    password: passwordSchema,
    confirmPassword: z.string().max(256),
    inviteToken: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

export const signInSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().max(256),
  inviteToken: z.string().trim().optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
    password: passwordSchema,
    confirmPassword: z.string().max(256),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(256),
    newPassword: passwordSchema,
    confirmPassword: z.string().max(256),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

export const onboardingSchema = z.object({
  organizationName: z.string().trim().min(1).max(120),
  industry: z.string().trim().max(120).optional().or(z.literal('')),
});

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  industry: z.string().trim().max(120).optional().or(z.literal('')),
});

export const inviteCreateSchema = z.object({
  email: z.string().trim().email().max(320),
  role: membershipRoleSchema.default('REVIEWER'),
});

export const inviteAcceptSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const regulatorySourceSchema = z.object({
  authority: z.string().trim().min(1).max(255),
  regulationTitle: z.string().trim().min(1).max(255),
  regulationVersion: z.string().trim().max(120).optional().nullable(),
  citationText: z.string().trim().min(1).max(4000),
  citationUrl: z.string().trim().url().max(2000).optional().nullable(),
  sourceIdentifier: z.string().trim().max(255).optional().nullable(),
  section: z.string().trim().max(255).optional().nullable(),
  paragraph: z.string().trim().max(255).optional().nullable(),
  kind: regulationSourceKindSchema,
  lastVerifiedAt: z.string().datetime().optional().nullable(),
  verificationStatus: regulationVerificationStatusSchema,
});

export const citationSchema = z.object({
  citationLabel: z.string().trim().min(1).max(255),
  citationText: z.string().trim().min(1).max(4000),
  source: z.string().trim().min(1).max(500),
  relevance: z.string().trim().min(1).max(2000),
  regulationSource: regulatorySourceSchema,
});

export const extractedFactSchema = z.object({
  name: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  value: z.string().trim().min(1).max(1000),
  unit: z.string().trim().max(120).optional().nullable(),
  category: z.string().trim().min(1).max(255),
  sourceSnippet: z.string().trim().min(1).max(4000),
  sourceText: z.string().trim().min(1).max(4000).optional().nullable(),
  sourcePageFrom: z.number().int().nonnegative().optional().nullable(),
  sourcePageTo: z.number().int().nonnegative().optional().nullable(),
  boundingBoxes: z.array(z.record(z.string(), z.number())).optional().nullable(),
  importance: z.string().trim().min(1).max(2000),
  confidence: confidenceLevelSchema,
  extractionRationale: z.string().trim().min(1).max(2000),
  valueType: factValueTypeSchema,
  extractionMethod: z.string().trim().min(1).max(255),
  extractionMethodVersion: z.string().trim().min(1).max(255),
});

export const factIssueSchema = z.object({
  issueType: factIssueTypeSchema,
  summary: z.string().trim().min(1).max(500),
  details: z.string().trim().max(4000).optional().nullable(),
  primaryFactName: z.string().trim().max(255).optional().nullable(),
  relatedFactName: z.string().trim().max(255).optional().nullable(),
});

export const reviewPathSchema = z.object({
  pathKey: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  scope: z.string().trim().min(1).max(1000),
  type: reviewPathTypeSchema,
  status: reviewPathStatusSchema.default('open'),
  whyTriggered: z.string().trim().min(1).max(2000),
  technicalRiskArea: z.string().trim().max(255).optional().nullable(),
  triggeredFactNames: z.array(z.string().trim().min(1).max(255)).max(30),
  regulatoryCitations: z.array(citationSchema),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(20),
  reviewerQuestions: z.array(z.string().trim().min(1).max(500)).max(20),
  reviewerNotes: z.string().trim().max(4000).optional().nullable(),
  decisionRationale: z.string().trim().max(4000).optional().nullable(),
});

export const candidateFactMappingSchema = z.object({
  factName: z.string().trim().min(1).max(255),
  criterionLabel: z.string().trim().min(1).max(255),
  matchedValue: z.string().trim().min(1).max(1000),
  comparisonResult: z.string().trim().min(1).max(1000),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const alternativeCandidateSchema = z.object({
  eccn: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(255),
  status: z.enum(['considered', 'excluded', 'open']),
  rationale: z.string().trim().min(1).max(1000),
});

export const eccnCandidateSchema = z.object({
  eccn: z
    .string()
    .trim()
    .regex(/^[0-9][A-Z][0-9]{3}[a-zA-Z0-9]*$/)
    .max(32),
  title: z.string().trim().min(1).max(255),
  officialTitle: z.string().trim().min(1).max(255),
  confidence: confidenceLevelSchema,
  confidenceRationale: z.string().trim().min(1).max(2000),
  status: eccnCandidateStatusSchema.default('review_required'),
  regulationSource: regulatorySourceSchema.refine(
    (value) => value.kind === 'primary_regulation' || value.kind === 'agency_guidance',
    'ECCN candidates require an official regulation source.',
  ),
  paragraphReference: z.string().trim().max(255).optional().nullable(),
  controlCriteria: z.array(z.string().trim().min(1).max(1000)).max(20),
  factMappings: z.array(candidateFactMappingSchema).min(1).max(30),
  matchedTechnicalFacts: z.array(z.string().trim().min(1).max(1000)).max(30),
  whyItMayApply: z.string().trim().min(1).max(2000),
  whyItMayNotApply: z.string().trim().min(1).max(2000),
  mayApplyReasons: z.array(z.string().trim().min(1).max(1000)).max(20),
  mayNotApplyReasons: z.array(z.string().trim().min(1).max(1000)).max(20),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(20),
  uncertaintyFlags: z.array(uncertaintyFlagSchema).max(20),
  reviewerQuestions: z.array(z.string().trim().min(1).max(500)).max(20),
  alternativeCandidates: z.array(alternativeCandidateSchema).max(10),
  reviewPathKey: z.string().trim().max(255).optional().nullable(),
});

export const workerOutputSchema = z
  .object({
    documentId: z.string(),
    organizationId: z.string(),
    requiresHumanReview: z.literal(true),
    confidence: z.number().min(0).max(1),
    confidenceRationale: z.string().trim().min(1).max(2000),
    uncertaintyFlags: z.array(uncertaintyFlagSchema),
    extractedSpecs: z.array(extractedFactSchema),
    factIssues: z.array(factIssueSchema).default([]),
    reviewPaths: z.array(reviewPathSchema).default([]),
    eccnCandidates: z.array(eccnCandidateSchema).default([]),
    memoMarkdown: z.string(),
    artifacts: z.object({
      extractedTextPath: z.string(),
      structuredOutputPath: z.string(),
      memoPath: z.string(),
    }),
    runMetadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const hasCryptoFacts = value.extractedSpecs.some(
      (fact) =>
        fact.category === 'security_cryptography' ||
        /crypto|cryptograph|encrypt|secure boot|key management|secure element/i.test(
          `${fact.name} ${fact.displayName} ${fact.value} ${fact.sourceSnippet}`,
        ),
    );

    if (hasCryptoFacts) {
      const wronglyDenied = value.reviewPaths.some(
        (path) =>
          /crypt/i.test(path.title) &&
          /not found/i.test(path.whyTriggered),
      );
      if (wronglyDenied) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'If cryptographic capabilities are extracted, review paths cannot say crypto features were not found.',
          path: ['reviewPaths'],
        });
      }
    }
  });

export const workerCliOutputSchema = z.object({
  document_id: z.string(),
  organization_id: z.string(),
  requires_human_review: z.literal(true),
  confidence: z.number().min(0).max(1),
  confidence_rationale: z.string(),
  uncertainty_flags: z.array(uncertaintyFlagSchema),
  extracted_specs: z.array(
    z.object({
      name: z.string(),
      display_name: z.string(),
      value: z.string(),
      unit: z.string().nullable().optional(),
      category: z.string(),
      source_snippet: z.string(),
      source_text: z.string().nullable().optional(),
      source_page_from: z.number().int().nonnegative().nullable().optional(),
      source_page_to: z.number().int().nonnegative().nullable().optional(),
      bounding_boxes: z.array(z.record(z.string(), z.number())).nullable().optional(),
      importance: z.string(),
      confidence: confidenceLevelSchema,
      extraction_rationale: z.string(),
      value_type: factValueTypeSchema,
      extraction_method: z.string(),
      extraction_method_version: z.string(),
    }),
  ),
  fact_issues: z.array(
    z.object({
      issue_type: factIssueTypeSchema,
      summary: z.string(),
      details: z.string().nullable().optional(),
      primary_fact_name: z.string().nullable().optional(),
      related_fact_name: z.string().nullable().optional(),
    }),
  ),
  review_paths: z.array(
    z.object({
      path_key: z.string(),
      title: z.string(),
      scope: z.string(),
      type: reviewPathTypeSchema,
      status: reviewPathStatusSchema,
      why_triggered: z.string(),
      technical_risk_area: z.string().nullable().optional(),
      triggered_fact_names: z.array(z.string()),
      regulatory_citations: z.array(
        z.object({
          citation_label: z.string(),
          citation_text: z.string(),
          source: z.string(),
          relevance: z.string(),
          regulation_source: z.object({
            authority: z.string(),
            regulation_title: z.string(),
            regulation_version: z.string().nullable().optional(),
            citation_text: z.string(),
            citation_url: z.string().nullable().optional(),
            source_identifier: z.string().nullable().optional(),
            section: z.string().nullable().optional(),
            paragraph: z.string().nullable().optional(),
            kind: regulationSourceKindSchema,
            last_verified_at: z.string().nullable().optional(),
            verification_status: regulationVerificationStatusSchema,
          }),
        }),
      ),
      missing_information: z.array(z.string()),
      reviewer_questions: z.array(z.string()),
      reviewer_notes: z.string().nullable().optional(),
      decision_rationale: z.string().nullable().optional(),
    }),
  ),
  eccn_candidates: z.array(
    z.object({
      eccn: z.string(),
      title: z.string(),
      official_title: z.string(),
      confidence: confidenceLevelSchema,
      confidence_rationale: z.string(),
      status: eccnCandidateStatusSchema,
      regulation_source: z.object({
        authority: z.string(),
        regulation_title: z.string(),
        regulation_version: z.string().nullable().optional(),
        citation_text: z.string(),
        citation_url: z.string().nullable().optional(),
        source_identifier: z.string().nullable().optional(),
        section: z.string().nullable().optional(),
        paragraph: z.string().nullable().optional(),
        kind: regulationSourceKindSchema,
        last_verified_at: z.string().nullable().optional(),
        verification_status: regulationVerificationStatusSchema,
      }),
      paragraph_reference: z.string().nullable().optional(),
      control_criteria: z.array(z.string()),
      fact_mappings: z.array(
        z.object({
          fact_name: z.string(),
          criterion_label: z.string(),
          matched_value: z.string(),
          comparison_result: z.string(),
          notes: z.string().nullable().optional(),
        }),
      ),
      matched_technical_facts: z.array(z.string()),
      why_it_may_apply: z.string(),
      why_it_may_not_apply: z.string(),
      may_apply_reasons: z.array(z.string()),
      may_not_apply_reasons: z.array(z.string()),
      missing_information: z.array(z.string()),
      uncertainty_flags: z.array(uncertaintyFlagSchema),
      reviewer_questions: z.array(z.string()),
      alternative_candidates: z.array(
        z.object({
          eccn: z.string(),
          title: z.string(),
          status: z.enum(['considered', 'excluded', 'open']),
          rationale: z.string(),
        }),
      ),
      review_path_key: z.string().nullable().optional(),
    }),
  ),
  memo_markdown: z.string(),
  artifacts: z.object({
    extracted_text_path: z.string(),
    structured_output_path: z.string(),
    memo_path: z.string(),
  }),
  run_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;
export type ClassificationRunCreateInput = z.infer<typeof classificationRunCreateSchema>;
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;
export type PublicDemoPublishInput = z.infer<typeof publicDemoPublishSchema>;
export type FactReviewUpdateInput = z.infer<typeof factReviewUpdateSchema>;
export type ReviewPathUpdateInput = z.infer<typeof reviewPathUpdateSchema>;
export type ECCNCandidateUpdateInput = z.infer<typeof eccnCandidateUpdateSchema>;
export type WorkerOutput = z.infer<typeof workerOutputSchema>;
export type WorkerCliOutput = z.infer<typeof workerCliOutputSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
