from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

SUPPORTED_PRODUCT_PROFILES = {
    "adc_dac_converter",
    "rf_transceiver",
    "mcu_processor_soc",
    "fpga_programmable_logic_soc",
    "crypto_security_device",
    "generic_electronics",
}

CONFIDENCE_LEVELS = {"high", "medium", "low"}


@dataclass
class WorkerInput:
    document_id: str
    document_title: str
    file_path: str
    organization_id: str
    document_metadata: dict[str, Any]


@dataclass
class ExtractedSpec:
    name: str
    value: str
    unit: str | None
    source_snippet: str
    importance: str
    category: str
    confidence: str
    display_name: str | None = None
    source_text: str | None = None
    source_page_from: int | None = None
    source_page_to: int | None = None
    bounding_boxes: list[dict[str, float]] | None = None
    extraction_rationale: str = "Captured from source-backed technical text."
    value_type: str = "directly_stated"
    extraction_method: str = "python_worker"
    extraction_method_version: str = "v4"


@dataclass
class RegulationSource:
    authority: str
    regulation_title: str
    citation_text: str
    kind: str
    verification_status: str
    regulation_version: str | None = None
    citation_url: str | None = None
    source_identifier: str | None = None
    section: str | None = None
    paragraph: str | None = None
    last_verified_at: str | None = None


@dataclass
class RegulatoryCitation:
    citation_label: str
    citation_text: str
    source: str
    relevance: str
    regulation_source: RegulationSource | None = None


@dataclass
class FactIssue:
    issue_type: str
    summary: str
    details: str | None = None
    primary_fact_name: str | None = None
    related_fact_name: str | None = None


@dataclass
class CandidateFactMapping:
    fact_name: str
    criterion_label: str
    matched_value: str
    comparison_result: str
    notes: str | None = None


@dataclass
class ReviewPath:
    path_key: str
    title: str
    scope: str
    type: str
    status: str
    why_triggered: str
    triggered_fact_names: list[str]
    regulatory_citations: list[RegulatoryCitation]
    missing_information: list[str]
    reviewer_questions: list[str]
    technical_risk_area: str | None = None
    reviewer_notes: str | None = None
    decision_rationale: str | None = None


@dataclass
class ECCNCandidate:
    eccn: str
    title: str
    confidence: str
    matched_technical_facts: list[str]
    regulatory_citations: list[RegulatoryCitation]
    why_it_may_apply: str
    why_it_may_not_apply: str
    missing_information: list[str]
    uncertainty_flags: list[str]
    reviewer_questions: list[str]
    official_title: str | None = None
    confidence_rationale: str = "Evidence completeness remains limited."
    status: str = "review_required"
    regulation_source: RegulationSource | None = None
    paragraph_reference: str | None = None
    control_criteria: list[str] | None = None
    fact_mappings: list[CandidateFactMapping] | None = None
    may_apply_reasons: list[str] | None = None
    may_not_apply_reasons: list[str] | None = None
    alternative_candidates: list[dict[str, str]] | None = None
    review_path_id: str | None = None
    review_path_key: str | None = None


@dataclass
class WorkerOutput:
    document_id: str
    organization_id: str
    requires_human_review: bool
    confidence: float
    confidence_rationale: str
    uncertainty_flags: list[str]
    extracted_specs: list[ExtractedSpec]
    fact_issues: list[FactIssue]
    review_paths: list[ReviewPath]
    eccn_candidates: list[ECCNCandidate]
    memo_markdown: str
    artifacts: dict[str, str]
    run_metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ProductProfile:
    profile: str
    confidence: str
    rationale: str
    supporting_snippets: list[str]
    secondary_profiles: list[str]


@dataclass
class ProductIdentity:
    manufacturer: str | None
    product_name: str | None
    product_family: str | None
    part_number: str | None
    document_number: str | None
    document_type: str | None
    is_family_overview: bool


@dataclass
class MissingFact:
    name: str
    category: str
    why_it_matters: str
    status: str


@dataclass
class AIExtractionResult:
    product_profile: ProductProfile
    product_identity: ProductIdentity
    extracted_facts: list[ExtractedSpec]
    missing_facts: list[MissingFact]
    warnings: list[str]
    raw: dict[str, Any]


def _require_dict(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be an object")
    return value


def _require_str(value: Any, path: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{path} must be a string")
    clean = value.strip()
    if not allow_empty and not clean:
        raise ValueError(f"{path} must not be empty")
    return clean


def _optional_str(value: Any, path: str) -> str | None:
    if value is None:
        return None
    clean = _require_str(value, path, allow_empty=True)
    return clean or None


def _require_bool(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{path} must be a boolean")
    return value


def _string_list(value: Any, path: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"{path} must be a list")
    return [_require_str(item, f"{path}[{index}]") for index, item in enumerate(value) if str(item).strip()]


def _confidence(value: Any, path: str) -> str:
    clean = _require_str(value, path).lower()
    if clean not in CONFIDENCE_LEVELS:
        raise ValueError(f"{path} must be one of high, medium, low")
    return clean


def _profile(value: Any, path: str) -> str:
    clean = _require_str(value, path)
    if clean not in SUPPORTED_PRODUCT_PROFILES:
        raise ValueError(f"{path} must be one of {', '.join(sorted(SUPPORTED_PRODUCT_PROFILES))}")
    return clean


def _dedupe_facts(facts: list[ExtractedSpec]) -> list[ExtractedSpec]:
    deduped: list[ExtractedSpec] = []
    seen: set[tuple[str, str, str]] = set()
    for fact in facts:
        key = (fact.name.lower(), fact.value.lower(), fact.source_snippet.lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(fact)
    return deduped


def validate_ai_extraction_payload(payload: dict[str, Any]) -> AIExtractionResult:
    root = _require_dict(payload, "extraction")
    profile_payload = _require_dict(root.get("productProfile"), "productProfile")
    identity_payload = _require_dict(root.get("productIdentity"), "productIdentity")

    product_profile = ProductProfile(
        profile=_profile(profile_payload.get("profile"), "productProfile.profile"),
        confidence=_confidence(profile_payload.get("confidence"), "productProfile.confidence"),
        rationale=_require_str(profile_payload.get("rationale"), "productProfile.rationale"),
        supporting_snippets=_string_list(profile_payload.get("supportingSnippets"), "productProfile.supportingSnippets"),
        secondary_profiles=[
            secondary
            for secondary in _string_list(profile_payload.get("secondaryProfiles"), "productProfile.secondaryProfiles")
            if secondary in SUPPORTED_PRODUCT_PROFILES
        ],
    )

    product_identity = ProductIdentity(
        manufacturer=_optional_str(identity_payload.get("manufacturer"), "productIdentity.manufacturer"),
        product_name=_optional_str(identity_payload.get("productName"), "productIdentity.productName"),
        product_family=_optional_str(identity_payload.get("productFamily"), "productIdentity.productFamily"),
        part_number=_optional_str(identity_payload.get("partNumber"), "productIdentity.partNumber"),
        document_number=_optional_str(identity_payload.get("documentNumber"), "productIdentity.documentNumber"),
        document_type=_optional_str(identity_payload.get("documentType"), "productIdentity.documentType"),
        is_family_overview=_require_bool(identity_payload.get("isFamilyOverview"), "productIdentity.isFamilyOverview"),
    )

    facts_payload = root.get("extractedFacts")
    if not isinstance(facts_payload, list):
        raise ValueError("extractedFacts must be a list")

    facts: list[ExtractedSpec] = []
    for index, item in enumerate(facts_payload):
        fact = _require_dict(item, f"extractedFacts[{index}]")
        facts.append(
            ExtractedSpec(
                name=_require_str(fact.get("name"), f"extractedFacts[{index}].name"),
                display_name=_require_str(fact.get("displayName"), f"extractedFacts[{index}].displayName"),
                value=_require_str(fact.get("value"), f"extractedFacts[{index}].value"),
                unit=_optional_str(fact.get("unit"), f"extractedFacts[{index}].unit"),
                category=_require_str(fact.get("category"), f"extractedFacts[{index}].category"),
                source_snippet=_require_str(fact.get("sourceSnippet"), f"extractedFacts[{index}].sourceSnippet"),
                importance=_require_str(fact.get("importance"), f"extractedFacts[{index}].importance"),
                confidence=_confidence(fact.get("confidence"), f"extractedFacts[{index}].confidence"),
            )
        )

    missing_payload = root.get("missingFacts") or []
    if not isinstance(missing_payload, list):
        raise ValueError("missingFacts must be a list")
    missing_facts = [
        MissingFact(
            name=_require_str(_require_dict(item, f"missingFacts[{index}]").get("name"), f"missingFacts[{index}].name"),
            category=_require_str(_require_dict(item, f"missingFacts[{index}]").get("category"), f"missingFacts[{index}].category"),
            why_it_matters=_require_str(_require_dict(item, f"missingFacts[{index}]").get("whyItMatters"), f"missingFacts[{index}].whyItMatters"),
            status=_require_str(_require_dict(item, f"missingFacts[{index}]").get("status"), f"missingFacts[{index}].status"),
        )
        for index, item in enumerate(missing_payload[:12])
    ]

    return AIExtractionResult(
        product_profile=product_profile,
        product_identity=product_identity,
        extracted_facts=_dedupe_facts(facts),
        missing_facts=missing_facts,
        warnings=_string_list(root.get("warnings"), "warnings"),
        raw=root,
    )
