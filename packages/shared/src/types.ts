export type ClassificationStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export type ReviewWorkflowState =
  | 'draft_generated'
  | 'awaiting_reviewer_assignment'
  | 'in_technical_review'
  | 'needs_additional_documentation'
  | 'escalated'
  | 'reviewer_conclusion_recorded'
  | 'approved_for_internal_use'
  | 'closed';

export type ReviewStatus =
  | 'pending_review'
  | 'reviewed'
  | 'needs_more_information'
  | 'in_review'
  | 'approved'
  | 'rejected';

export type UncertaintyFlag =
  | 'missing_key_specs'
  | 'ambiguous_datasheet_language'
  | 'multiple_plausible_eccns'
  | 'limited_regulatory_coverage'
  | 'requires_engineering_confirmation'
  | 'family_level_source_requires_device_specific_confirmation'
  | 'crypto_relevance_requires_qualified_review'
  | 'conflicting_source_values'
  | 'missing_regulatory_mapping';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type MembershipRole = 'OWNER' | 'ADMIN' | 'REVIEWER' | 'ANALYST' | 'VIEWER';

export type FactValueType =
  | 'directly_stated'
  | 'inferred'
  | 'normalized'
  | 'calculated';

export type FactVerificationStatus =
  | 'unreviewed'
  | 'verified'
  | 'corrected'
  | 'rejected'
  | 'suppressed';

export type ReviewPathType =
  | 'product_area'
  | 'technical_risk'
  | 'encryption_security'
  | 'special_environment'
  | 'military_space'
  | 'general_fallback';

export type ReviewPathStatus =
  | 'open'
  | 'excluded_by_reviewer'
  | 'needs_more_evidence'
  | 'escalated'
  | 'resolved';

export type RegulationVerificationStatus =
  | 'current'
  | 'needs_verification'
  | 'archived'
  | 'superseded';

export type RegulationSourceKind =
  | 'primary_regulation'
  | 'agency_guidance'
  | 'internal_playbook'
  | 'reviewer_note';

export type ECCNCandidateStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'review_required';
