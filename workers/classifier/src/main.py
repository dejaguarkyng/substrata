from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ai_client import GeminiClient, GeminiClientError
from eccn_rules import generate_eccn_candidates
from extract_specs import extract_specs
from extract_text import extract_text
from ingest import load_input
from memo import generate_memo
from prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    MEMO_SYSTEM_PROMPT,
    build_extraction_prompt,
    build_memo_prompt,
)
from schemas import (
    AIExtractionResult,
    CandidateFactMapping,
    ExtractedSpec,
    FactIssue,
    RegulationSource,
    ReviewPath,
    WorkerOutput,
    validate_ai_extraction_payload,
)
from validation import validate_memo_markdown, validate_worker_output


def _log_worker_event(event: str, **fields: object) -> None:
    print(
        json.dumps(
            {
                "event": event,
                **fields,
            },
            default=str,
        ),
        file=sys.stderr,
    )


AI_IDENTITY_IMPORTANCE = {
    "manufacturer": "Manufacturer identity helps reviewers tie the memo to the correct source and product line.",
    "product_name": "Product name anchors the review memo to the device described by the source document.",
    "product_family": "Product family matters when the document covers variants rather than one ordering code.",
    "part_number": "Part-number identity helps reviewers distinguish a device ordering code from a document number.",
    "document_number": "Document numbers identify the source publication and should not be substituted for product part numbers.",
    "document_type": "Document type helps reviewers distinguish a datasheet, overview, or product specification.",
    "is_family_overview": "Family-overview status flags that variant-specific ordering-code details may be required for review signoff.",
    "product_profile": "Detected product profile controls which technical facts and review paths should be emphasized.",
    "profile_confidence": "Profile confidence tells the reviewer how strongly the extraction identified the document type.",
    "profile_rationale": "Profile rationale explains why the memo follows this product-review path.",
}

SPEC_IMPORTANCE_SENTENCES = {
    "cpu_core": "CPU core type helps reviewers understand the processor architecture and appropriate electronics review path.",
    "processor_architecture": "Processor architecture helps reviewers characterize the processing subsystem before comparing it against electronics control thresholds.",
    "cpu_core_count": "Core-count information helps reviewers understand the scale of the processor subsystem and whether ordering-code-specific review is needed.",
    "clock_speed": "Clock speed helps characterize processing performance and may affect how reviewers compare the product against electronics control thresholds.",
    "cpu_clock_speed": "Clock speed helps characterize processing performance and may affect how reviewers compare the product against electronics control thresholds.",
    "cache_tcm": "Memory and cache resources help characterize the processor subsystem and distinguish general MCU features from specialized compute hardware.",
    "on_chip_ram": "Memory and cache resources help characterize the processor subsystem and distinguish general MCU features from specialized compute hardware.",
    "memory_cache": "Memory and cache resources help characterize the processor subsystem and distinguish general MCU features from specialized compute hardware.",
    "memory_integrity": "Memory and cache resources help characterize the processor subsystem and distinguish general MCU features from specialized compute hardware.",
    "memory_controller_interface": "External memory interfaces help reviewers understand the processor subsystem and the electronics review path.",
    "external_memory_interface": "External memory interfaces help reviewers understand the processor subsystem and the electronics review path.",
    "external_memory_interfaces": "External memory interfaces help reviewers understand the processor subsystem and the electronics review path.",
    "secure_boot": "Secure boot can trigger security/cryptography review questions because it may involve authentication, cryptographic verification, and protected boot flows.",
    "security_feature": "Hardware security features can require separate security/cryptography review depending on accessibility, algorithms, and available exceptions.",
    "cryptographic_algorithm": "Named cryptographic functions can require separate security/cryptography review depending on accessibility, algorithms, and exceptions.",
    "crypto_key_size": "Cryptographic key-size information can affect security/cryptography review and should be tied to a current source fact.",
    "key_storage": "Secure key-management features can require security/cryptography review because protected keys may affect functionality and availability analysis.",
    "caam": "Hardware cryptography accelerators can require separate security/cryptography review because their functions may be controlled depending on accessibility, algorithms, and exceptions.",
    "pkha": "Public-key cryptography engines can require separate security/cryptography review depending on accessibility, algorithms, and exceptions.",
    "symmetric_engine": "Symmetric cryptography engines can require separate security/cryptography review depending on accessibility, algorithms, and exceptions.",
    "cryptographic_hash_engine": "Cryptographic hash engines can require separate security/cryptography review depending on accessibility, algorithms, and exceptions.",
    "rng4": "Random-number generation hardware can matter to security/cryptography review when it supports cryptographic functions.",
    "secure_key_management": "Secure key-management features can require security/cryptography review because protected keys may affect functionality and availability analysis.",
    "inline_encryption_engine": "Inline encryption can require security/cryptography review because it may protect memory or storage traffic with cryptographic functions.",
    "otfad": "OTFAD AES-128 counter-mode decryption can require security/cryptography review because it protects external flash access.",
    "snvs": "Secure non-volatile storage features can matter to security/cryptography review when they protect keys or boot state.",
    "zero_master_key": "Zero Master Key functionality can matter to security/cryptography review when it affects protected key handling.",
    "puf": "PUF functionality can matter to security/cryptography review because it may support device-unique key generation or protection.",
    "encrypted_boot": "Encrypted boot can trigger security/cryptography review questions because it may involve protected boot flows and cryptographic verification.",
    "peripheral_adc": "Peripheral ADC/DAC features should be recorded as subordinate MCU peripherals, not treated as the primary product type.",
    "peripheral_dac": "Peripheral ADC/DAC features should be recorded as subordinate MCU peripherals, not treated as the primary product type.",
    "digital_interface": "Connectivity interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "ethernet_mac": "Ethernet interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "usb_interface": "USB interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "can_interface": "CAN interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "spi_interface": "SPI interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "i2c_interface": "I2C interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "uart_interface": "UART interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "display_camera_interface": "Display and camera interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "camera_interface": "Camera interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "display_interface": "Display interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
    "audio_interface": "Audio interfaces help reviewers understand the processor integration profile and whether electronics interface review is needed.",
}


def _document_source_label(source_type: object) -> str:
    if source_type == "upload":
        return "Uploaded datasheet text"
    if source_type == "seed":
        return "Bundled sample datasheet text"
    return "Current document text"


def _env_truthy(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _ai_max_input_chars() -> int:
    raw = os.environ.get("AI_MAX_INPUT_CHARS", "120000")
    try:
        return max(4000, int(raw))
    except ValueError:
        return 120000


def _normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def _interface_family(spec: ExtractedSpec) -> str:
    if spec.name in {"ethernet_mac"} or spec.value.lower() == "ethernet":
        return "ethernet"
    if spec.name in {"pcie_interface"} or spec.value.lower() == "pcie":
        return "pcie"
    if spec.name in {"i2c_interface"} or spec.value.lower() == "i2c":
        return "i2c"
    if spec.name in {"uart_interface"} or spec.value.lower() == "uart":
        return "uart"
    if spec.name in {"jtag_interface"} or spec.value.lower() == "jtag":
        return "jtag"
    if spec.name in {"displayport_interface", "displayport_lane_rate"} or "displayport" in spec.value.lower():
        return "displayport"
    return spec.value.lower()


def _display_name_for_key(spec: ExtractedSpec) -> str:
    return spec.display_name or spec.name.replace("_", " ").title()


def _dedupe_interface_facts(specs: list[ExtractedSpec]) -> list[ExtractedSpec]:
    specific_interface_names = {
        "ethernet_mac",
        "pcie_interface",
        "i2c_interface",
        "uart_interface",
        "jtag_interface",
        "displayport_interface",
        "displayport_lane_rate",
    }
    specific_families = {
        _interface_family(spec)
        for spec in specs
        if spec.name in specific_interface_names
    }

    deduped: list[ExtractedSpec] = []
    seen: set[tuple[str, str, str, str, str]] = set()
    for spec in specs:
        family = _interface_family(spec) if spec.category == "digital_interface" else ""
        if spec.name == "digital_interface" and family in specific_families:
            continue
        key = (
            spec.category.lower(),
            _display_name_for_key(spec).lower(),
            spec.value.lower(),
            spec.source_snippet.lower(),
            family,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(spec)
    return deduped


def _window_around_patterns(text: str, patterns: list[str], window: int = 1800) -> list[str]:
    lowered = text.lower()
    chunks: list[str] = []
    used: list[tuple[int, int]] = []
    for pattern in patterns:
        start = lowered.find(pattern.lower())
        if start == -1:
            continue
        chunk_start = max(0, start - window // 3)
        chunk_end = min(len(text), start + window)
        if any(not (chunk_end < left or chunk_start > right) for left, right in used):
            continue
        used.append((chunk_start, chunk_end))
        chunks.append(text[chunk_start:chunk_end])
    return chunks


def truncate_for_ai(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text

    first_pages_budget = max_chars // 3
    chunks = [text[:first_pages_budget]]
    patterns = [
        "features",
        "key features",
        "electrical characteristics",
        "recommended operating conditions",
        "security",
        "secure boot",
        "cryptographic",
        "interfaces",
        "jesd",
        "pcie",
        "ethernet",
        "usb",
        "displayport",
        "package",
        "thermal",
        "qualification",
        "radiation",
        "applications",
    ]
    chunks.extend(_window_around_patterns(text, patterns, window=max(1600, max_chars // 18)))

    joined = "\n\n--- relevant excerpt ---\n\n".join(chunks)
    if len(joined) > max_chars:
        return joined[:max_chars]

    remaining = max_chars - len(joined)
    tail = text[-min(remaining, max_chars // 8):] if remaining > 1000 else ""
    return f"{joined}\n\n--- closing excerpt ---\n\n{tail}"[:max_chars]


def _first_snippet(extraction: AIExtractionResult) -> str:
    if extraction.product_profile.supporting_snippets:
        return extraction.product_profile.supporting_snippets[0]
    if extraction.extracted_facts:
        return extraction.extracted_facts[0].source_snippet
    return "Detected from provided datasheet text."


def _identity_specs(extraction: AIExtractionResult) -> list[ExtractedSpec]:
    identity = extraction.product_identity
    snippet = _first_snippet(extraction)
    values: list[tuple[str, str | None]] = [
        ("manufacturer", identity.manufacturer),
        ("product_name", identity.product_name),
        ("product_family", identity.product_family),
        ("part_number", identity.part_number),
        ("document_number", identity.document_number),
        ("document_type", identity.document_type),
        ("is_family_overview", "true" if identity.is_family_overview else "false"),
        ("product_profile", extraction.product_profile.profile),
        ("profile_confidence", extraction.product_profile.confidence),
        ("profile_rationale", extraction.product_profile.rationale),
    ]
    specs: list[ExtractedSpec] = []
    for name, value in values:
        if value is None or not str(value).strip():
            continue
        specs.append(
            ExtractedSpec(
                name=name,
                value=str(value).strip(),
                unit=None,
                source_snippet=snippet,
                importance=AI_IDENTITY_IMPORTANCE[name],
                category="profile_detection" if name.startswith("profile_") or name == "product_profile" else "product_identity",
                confidence=extraction.product_profile.confidence if name.startswith("profile_") or name == "product_profile" else "medium",
            )
        )
    return specs


def _merge_ai_specs(extraction: AIExtractionResult) -> list[ExtractedSpec]:
    specs: list[ExtractedSpec] = []
    seen: set[tuple[str, str]] = set()
    for spec in [*_identity_specs(extraction), *extraction.extracted_facts]:
        if spec.name == "part_number" and spec.value.upper().startswith(("DS", "UG", "PG", "WP", "XAPP")):
            continue
        if spec.name == "cryptographic_algorithm" and spec.value.upper() == "ECC":
            context = spec.source_snippet.lower()
            has_crypto_context = any(
                marker in context
                for marker in ("elliptic", "ecdsa", "ecdh", "public key", "signature", "certificate", "cryptographic", "key exchange")
            )
            if not has_crypto_context:
                continue
        key = (spec.name.lower(), spec.value.lower())
        if key in seen:
            continue
        seen.add(key)
        if spec.importance.strip().lower() in {"high", "medium", "low"}:
            spec.importance = SPEC_IMPORTANCE_SENTENCES.get(
                spec.name,
                "This fact helps reviewers understand the device architecture and decide which expert review path should be evaluated.",
            )
        specs.append(spec)
    return specs


def _ensure_profile_specs(specs: list[ExtractedSpec]) -> list[ExtractedSpec]:
    if any(spec.name == "product_profile" for spec in specs):
        return specs

    device_text = " ".join(f"{spec.name} {spec.value}" for spec in specs).lower()
    if any(term in device_text for term in ("analog-to-digital converter", "digital-to-analog converter", " adc", " dac", "rf-sampling")):
        profile = "adc_dac_converter"
        confidence = "medium"
        rationale = "Inferred from converter identity and performance facts extracted by the heuristic worker."
    elif any(term in device_text for term in ("zynq", "mpsoc", "programmable logic", "fpga")):
        profile = "fpga_programmable_logic_soc"
        confidence = "medium"
        rationale = "Inferred from programmable-logic/SoC facts extracted by the heuristic worker."
    elif any(term in device_text for term in ("rf transceiver", "receiver", "transmitter")):
        profile = "rf_transceiver"
        confidence = "low"
        rationale = "Inferred from RF transceiver terms extracted by the heuristic worker."
    else:
        profile = "generic_electronics"
        confidence = "low"
        rationale = "Fallback profile because the heuristic worker did not identify a narrower product profile."

    snippet = specs[0].source_snippet if specs else "Detected from provided datasheet text."
    return [
        *specs,
        ExtractedSpec(
            name="product_profile",
            value=profile,
            unit=None,
            source_snippet=snippet,
            importance=AI_IDENTITY_IMPORTANCE["product_profile"],
            category="profile_detection",
            confidence=confidence,
        ),
        ExtractedSpec(
            name="profile_confidence",
            value=confidence,
            unit=None,
            source_snippet=snippet,
            importance=AI_IDENTITY_IMPORTANCE["profile_confidence"],
            category="profile_detection",
            confidence=confidence,
        ),
        ExtractedSpec(
            name="profile_rationale",
            value=rationale,
            unit=None,
            source_snippet=snippet,
            importance=AI_IDENTITY_IMPORTANCE["profile_rationale"],
            category="profile_detection",
            confidence=confidence,
        ),
    ]


def _memo_input_package(
    *,
    worker_input: Any,
    extraction: AIExtractionResult,
    specs: list[ExtractedSpec],
    candidates: list[Any],
    uncertainty_flags: list[str],
    run_mode: str,
) -> dict[str, Any]:
    return {
        "document": {
            "id": worker_input.document_id,
            "title": worker_input.document_title,
            "fileName": worker_input.document_metadata.get("fileName", "Not recorded"),
            "generatedTimestamp": datetime.now(UTC).replace(microsecond=0).isoformat(),
        },
        "runMode": run_mode,
        "productProfile": asdict(extraction.product_profile),
        "productIdentity": asdict(extraction.product_identity),
        "extractedFacts": [asdict(spec) for spec in specs],
        "missingFacts": [asdict(item) for item in extraction.missing_facts[:8]],
        "warnings": extraction.warnings,
        "reviewPaths": [asdict(candidate) for candidate in candidates],
        "uncertaintyFlags": uncertainty_flags,
    }


def _run_ai_flow(
    *,
    worker_input: Any,
    text: str,
    source_label: str,
) -> tuple[list[ExtractedSpec], list[Any], list[str], float, str, dict[str, Any], AIExtractionResult]:
    ai_text = truncate_for_ai(text, _ai_max_input_chars())
    client = GeminiClient()
    _log_worker_event(
        "ai_flow.started",
        document_id=worker_input.document_id,
        provider="gemini",
        model=client.model,
        source_text_characters=len(text),
        ai_input_characters=len(ai_text),
        ai_input_truncated=len(ai_text) < len(text),
        timeout_seconds=client.timeout_seconds,
        max_retries=client.max_retries,
    )
    extraction_prompt = build_extraction_prompt(
        document_title=worker_input.document_title,
        file_name=str(worker_input.document_metadata.get("fileName", "Not recorded")),
        document_text=ai_text,
    )
    _log_worker_event(
        "ai_flow.extraction_request",
        document_id=worker_input.document_id,
        prompt_characters=len(extraction_prompt),
    )
    extraction_payload = client.generate_json(
        prompt_type="extraction",
        system_instruction=EXTRACTION_SYSTEM_PROMPT,
        user_prompt=extraction_prompt,
        input_character_count=len(ai_text),
    )
    _log_worker_event("ai_flow.extraction_response_received", document_id=worker_input.document_id)
    extraction = validate_ai_extraction_payload(extraction_payload)
    _log_worker_event(
        "ai_flow.extraction_validated",
        document_id=worker_input.document_id,
        profile=extraction.product_profile.profile,
        profile_confidence=extraction.product_profile.confidence,
        extracted_fact_count=len(extraction.extracted_facts),
        missing_fact_count=len(extraction.missing_facts),
        warning_count=len(extraction.warnings),
    )
    specs = _dedupe_interface_facts(_merge_ai_specs(extraction))
    candidates, uncertainty_flags, confidence = generate_eccn_candidates(specs, source_label=source_label)
    _log_worker_event(
        "ai_flow.local_candidates_generated",
        document_id=worker_input.document_id,
        extracted_spec_count=len(specs),
        candidate_count=len(candidates),
        candidate_eccns=[candidate.eccn for candidate in candidates],
    )
    memo_markdown = generate_memo(
        worker_input.document_id,
        worker_input.document_title,
        worker_input.document_metadata,
        specs,
        candidates,
        uncertainty_flags,
    )
    _log_worker_event(
        "ai_flow.memo_rendered",
        document_id=worker_input.document_id,
        memo_characters=len(memo_markdown),
    )
    validate_memo_markdown(memo_markdown)
    _log_worker_event("ai_flow.memo_validated", document_id=worker_input.document_id)
    metadata = {
        "classificationMode": "ai_assisted",
        "aiProvider": "gemini",
        "aiModel": client.model,
        "aiInputCharacters": len(ai_text),
        "aiInputTruncated": len(ai_text) < len(text),
        "aiDemoPublicDocsOnly": _env_truthy("AI_DEMO_PUBLIC_DOCS_ONLY", True),
    }
    return specs, candidates, uncertainty_flags, confidence, memo_markdown, metadata, extraction


def _run_heuristic_flow(worker_input: Any, text: str, source_label: str, *, fallback_reason: str | None = None):
    specs = _dedupe_interface_facts(_ensure_profile_specs(extract_specs(text)))
    candidates, uncertainty_flags, confidence = generate_eccn_candidates(specs, source_label=source_label)
    memo_markdown = generate_memo(
        worker_input.document_id,
        worker_input.document_title,
        worker_input.document_metadata,
        specs,
        candidates,
        uncertainty_flags,
    )
    metadata = {
        "classificationMode": "heuristic_fallback" if fallback_reason else "heuristic",
        "aiProvider": os.environ.get("AI_PROVIDER", "none"),
        "aiEnabled": _env_truthy("AI_ENABLED", False),
        "fallbackReason": fallback_reason,
    }
    return specs, candidates, uncertainty_flags, confidence, memo_markdown, metadata, None


def _profile_artifact_payload(specs: list[ExtractedSpec], extraction: AIExtractionResult | None) -> dict[str, Any]:
    if extraction:
        return extraction.raw["productProfile"]
    by_name = {spec.name: spec.value for spec in specs}
    return {
        "profile": by_name.get("product_profile", "generic_electronics"),
        "confidence": by_name.get("profile_confidence", "low"),
        "rationale": by_name.get("profile_rationale", "Generated by heuristic fallback."),
        "supportingSnippets": [
            spec.source_snippet
            for spec in specs
            if spec.name in {"product_profile", "device_type", "product_family", "part_number"}
        ][:3],
        "secondaryProfiles": [],
    }


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _regulation_source_from_citation(candidate_eccn: str, citation: Any | None) -> RegulationSource:
    label = getattr(citation, "citation_label", f"{candidate_eccn} regulation source")
    text = getattr(citation, "citation_text", "Primary regulation text should be verified by a qualified reviewer.")
    source = getattr(citation, "source", candidate_eccn)
    return RegulationSource(
        authority="BIS / eCFR",
        regulation_title=label,
        regulation_version="retrieved current",
        citation_text=text,
        citation_url="https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-774",
        source_identifier=source,
        section=source,
        paragraph=None,
        kind="primary_regulation",
        last_verified_at=_iso_now(),
        verification_status="needs_verification",
    )


def _candidate_fact_mapping(specs: list[ExtractedSpec], matched_facts: list[str]) -> list[CandidateFactMapping]:
    mappings: list[CandidateFactMapping] = []
    for fact in matched_facts[:8]:
        fact_name = fact.split(":", 1)[0].strip().lower().replace(" ", "_")
        spec = next((item for item in specs if item.name == fact_name), None)
        if not spec:
            continue
        mappings.append(
            CandidateFactMapping(
                fact_name=spec.name,
                criterion_label=spec.display_name or spec.name.replace("_", " ").title(),
                matched_value=f"{spec.value}{f' {spec.unit}' if spec.unit else ''}",
                comparison_result="Source-backed technical fact warrants reviewer comparison.",
            )
        )
    return mappings


def _review_paths_from_candidates(candidates: list[Any], specs: list[ExtractedSpec]) -> list[ReviewPath]:
    paths: list[ReviewPath] = []
    for index, candidate in enumerate(candidates):
        path_type = "encryption_security" if "5 Part 2" in candidate.title or "crypto" in candidate.title.lower() else "product_area"
        fact_names = [
            spec.name
            for spec in specs
            if any(spec.name in fact.lower().replace(" ", "_") for fact in candidate.matched_technical_facts)
        ][:8]
        if not fact_names:
            fact_names = [spec.name for spec in specs[:4]]
        paths.append(
            ReviewPath(
                path_key=candidate.review_path_key or candidate.review_path_id or f"review_path_{index + 1}",
                title=candidate.title,
                scope=f"Assess whether the extracted technical evidence supports the {candidate.title.lower()} path.",
                type=path_type,
                status="open",
                why_triggered=candidate.why_it_may_apply,
                technical_risk_area="Cryptography and hardware security" if path_type == "encryption_security" else "Processor architecture and performance",
                triggered_fact_names=fact_names,
                regulatory_citations=candidate.regulatory_citations,
                missing_information=candidate.missing_information,
                reviewer_questions=candidate.reviewer_questions,
            )
        )
    return paths


def _fact_issues(specs: list[ExtractedSpec], extraction: AIExtractionResult | None) -> list[FactIssue]:
    issues: list[FactIssue] = []
    if extraction and extraction.product_identity.is_family_overview:
        issues.append(
            FactIssue(
                issue_type="family_scope_warning",
                summary="Family-level source detected",
                details="The source appears to describe a product family rather than a single verified ordering code. Device-specific ordering codes and configuration details may still be required.",
                primary_fact_name="is_family_overview",
            )
        )
    seen: dict[tuple[str, str], ExtractedSpec] = {}
    for spec in specs:
        key = (spec.name, spec.value)
        if key in seen:
            issues.append(
                FactIssue(
                    issue_type="duplicate",
                    summary=f"Duplicate fact detected for {spec.display_name or spec.name}",
                    details="The same fact value appeared more than once in the extracted source-backed technical facts.",
                    primary_fact_name=spec.name,
                    related_fact_name=seen[key].name,
                )
            )
        seen[key] = spec
    return issues


def _specific_eccn_candidates(candidates: list[Any], specs: list[ExtractedSpec]) -> list[Any]:
    specific: list[Any] = []
    for candidate in candidates:
        if not re.match(r"^[0-9][A-Z][0-9]{3}[A-Za-z0-9]*$", candidate.eccn):
            continue
        regulation_source = _regulation_source_from_citation(
            candidate.eccn,
            candidate.regulatory_citations[0] if candidate.regulatory_citations else None,
        )
        candidate.official_title = candidate.title
        candidate.confidence_rationale = (
            "Confidence reflects evidence completeness, missing technical thresholds, and source specificity rather than generic model confidence."
        )
        candidate.status = "review_required"
        candidate.regulation_source = regulation_source
        candidate.paragraph_reference = regulation_source.section
        candidate.control_criteria = [
            "Specific ECCN comparison requires current regulation text and source-backed technical thresholds."
        ]
        candidate.fact_mappings = _candidate_fact_mapping(specs, candidate.matched_technical_facts)
        candidate.may_apply_reasons = [candidate.why_it_may_apply]
        candidate.may_not_apply_reasons = [candidate.why_it_may_not_apply]
        candidate.alternative_candidates = []
        candidate.review_path_key = candidate.review_path_id or None
        specific.append(candidate)
    return specific


def run(payload_path: str) -> WorkerOutput:
    worker_input = load_input(payload_path)
    text = extract_text(worker_input.file_path)
    source_label = _document_source_label(worker_input.document_metadata.get("sourceType"))
    ai_env_enabled = _env_truthy("AI_ENABLED", False)
    ai_provider = os.environ.get("AI_PROVIDER", "gemini").lower()
    has_gemini_key = bool(os.environ.get("GEMINI_API_KEY", "").strip())
    ai_enabled = ai_env_enabled and ai_provider == "gemini"
    fallback_enabled = _env_truthy("AI_FALLBACK_TO_HEURISTIC", True)
    extraction: AIExtractionResult | None

    _log_worker_event(
        "worker.ai_gate",
        document_id=worker_input.document_id,
        ai_enabled_env=ai_env_enabled,
        ai_provider=ai_provider,
        provider_supported=ai_provider == "gemini",
        gemini_api_key_present=has_gemini_key,
        ai_flow_enabled=ai_enabled and has_gemini_key,
        fallback_enabled=fallback_enabled,
        ai_model=os.environ.get("AI_MODEL", "gemini-2.5-flash"),
        ai_timeout_seconds=os.environ.get("AI_TIMEOUT_SECONDS", "60"),
        ai_max_retries=os.environ.get("AI_MAX_RETRIES", "2"),
        source_text_characters=len(text),
    )

    if ai_enabled and has_gemini_key:
        try:
            specs, candidates, uncertainty_flags, confidence, memo_markdown, run_metadata, extraction = _run_ai_flow(
                worker_input=worker_input,
                text=text,
                source_label=source_label,
            )
        except (GeminiClientError, ValueError) as error:
            _log_worker_event(
                "ai_flow.failed",
                document_id=worker_input.document_id,
                error_type=type(error).__name__,
                error_message=str(error)[:1000],
                fallback_enabled=fallback_enabled,
            )
            if not fallback_enabled:
                raise
            specs, candidates, uncertainty_flags, confidence, memo_markdown, run_metadata, extraction = _run_heuristic_flow(
                worker_input,
                text,
                source_label,
                fallback_reason=f"AI flow failed: {type(error).__name__}",
            )
            uncertainty_flags = list(dict.fromkeys([*uncertainty_flags, "requires_engineering_confirmation"]))
            run_metadata["aiFailureMessage"] = str(error)[:500]
    else:
        if not ai_env_enabled:
            reason = "AI_ENABLED is false or unset"
        elif ai_provider != "gemini":
            reason = f"Unsupported AI_PROVIDER: {ai_provider}"
        elif not has_gemini_key:
            reason = "GEMINI_API_KEY missing"
        else:
            reason = "AI disabled or GEMINI_API_KEY missing"
        _log_worker_event(
            "ai_flow.skipped",
            document_id=worker_input.document_id,
            reason=reason,
        )
        specs, candidates, uncertainty_flags, confidence, memo_markdown, run_metadata, extraction = _run_heuristic_flow(
            worker_input,
            text,
            source_label,
            fallback_reason=reason,
        )

    sample_dir = Path(payload_path).resolve().parent
    artifacts_dir = sample_dir / "artifacts"
    artifacts_dir.mkdir(exist_ok=True)

    extracted_text_path = artifacts_dir / f"{worker_input.document_id}-extracted.txt"
    structured_output_path = artifacts_dir / f"{worker_input.document_id}-output.json"
    memo_path = artifacts_dir / f"{worker_input.document_id}-memo.md"
    profile_path = artifacts_dir / f"{worker_input.document_id}-profile.json"
    facts_path = artifacts_dir / f"{worker_input.document_id}-extracted-facts.json"
    review_paths_path = artifacts_dir / f"{worker_input.document_id}-review-paths.json"

    review_paths = _review_paths_from_candidates(candidates, specs)
    fact_issues = _fact_issues(specs, extraction)
    specific_candidates = _specific_eccn_candidates(candidates, specs)
    confidence_rationale = (
        "Confidence reflects source specificity, missing threshold data, unresolved reviewer questions, and whether the current document appears family-level rather than ordering-code-specific."
    )

    extracted_text_path.write_text(text)
    memo_path.write_text(memo_markdown)
    profile_path.write_text(json.dumps(_profile_artifact_payload(specs, extraction), indent=2))
    facts_path.write_text(json.dumps([asdict(spec) for spec in specs], indent=2))
    review_paths_path.write_text(json.dumps([asdict(path) for path in review_paths], indent=2))

    output = WorkerOutput(
        document_id=worker_input.document_id,
        organization_id=worker_input.organization_id,
        requires_human_review=True,
        confidence=confidence,
        confidence_rationale=confidence_rationale,
        uncertainty_flags=uncertainty_flags,
        extracted_specs=specs,
        fact_issues=fact_issues,
        review_paths=review_paths,
        eccn_candidates=specific_candidates,
        memo_markdown=memo_markdown,
        artifacts={
            "extracted_text_path": str(extracted_text_path),
            "structured_output_path": str(structured_output_path),
            "memo_path": str(memo_path),
            "profile_path": str(profile_path),
            "extracted_facts_path": str(facts_path),
            "review_paths_path": str(review_paths_path),
        },
        run_metadata=run_metadata,
    )

    validate_worker_output(
        document_title=worker_input.document_title,
        extracted_text=text,
        output=output,
    )
    _log_worker_event(
        "worker.output_validated",
        document_id=worker_input.document_id,
        classification_mode=run_metadata.get("classificationMode"),
        extracted_spec_count=len(specs),
        candidate_count=len(specific_candidates),
        memo_characters=len(memo_markdown),
    )

    structured_output_path.write_text(json.dumps(output.to_dict(), indent=2))
    return output


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 src/main.py <input-json-path>")

    try:
        result = run(sys.argv[1])
        print(json.dumps(result.to_dict(), indent=2))
    except FileNotFoundError as error:
        raise SystemExit(f"Input file not found: {error}") from error
    except json.JSONDecodeError as error:
        raise SystemExit(f"Input JSON is invalid: {error}") from error
    except Exception as error:  # pragma: no cover - CLI guardrail
        raise SystemExit(f"Worker execution failed: {error}") from error
