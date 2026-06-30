from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from eccn_rules import generate_eccn_candidates
from main import _review_paths_from_candidates, _specific_eccn_candidates
from memo import generate_memo
from schemas import ExtractedSpec, WorkerOutput
from validation import validate_memo_markdown, validate_worker_output


MCU_CATEGORY_3_TITLE = "Category 3 electronics / MCU / processor / SoC review path"
FPGA_CATEGORY_3_TITLE = "Category 3 electronics / programmable logic / SoC review path"
GENERAL_FALLBACK_TITLE = "General electronics comparison path"


def _spec(
    name: str,
    value: str,
    *,
    category: str,
    source_snippet: str,
    unit: str | None = None,
    confidence: str = "high",
    importance: str = "Source-backed technical fact used for review-path generation.",
) -> ExtractedSpec:
    return ExtractedSpec(
        name=name,
        value=value,
        unit=unit,
        source_snippet=source_snippet,
        importance=importance,
        category=category,
        confidence=confidence,
    )


def _build_output(
    *,
    document_id: str,
    document_title: str,
    extracted_text: str,
    specs: list[ExtractedSpec],
) -> WorkerOutput:
    candidates, uncertainty_flags, confidence = generate_eccn_candidates(
        specs,
        source_label="Uploaded datasheet text",
    )
    memo_markdown = generate_memo(
        document_id,
        document_title,
        {"fileName": "test-datasheet.txt"},
        specs,
        candidates,
        uncertainty_flags,
    )
    validate_memo_markdown(memo_markdown)
    output = WorkerOutput(
        document_id=document_id,
        organization_id="org_test",
        requires_human_review=True,
        confidence=confidence,
        confidence_rationale="Test pipeline confidence rationale.",
        uncertainty_flags=uncertainty_flags,
        extracted_specs=specs,
        fact_issues=[],
        review_paths=_review_paths_from_candidates(candidates, specs),
        eccn_candidates=_specific_eccn_candidates(candidates, specs),
        memo_markdown=memo_markdown,
        artifacts={},
        run_metadata={"classificationMode": "test"},
    )
    validate_worker_output(
        document_title=document_title,
        extracted_text=extracted_text,
        output=output,
    )
    return output


def _mcu_specs() -> list[ExtractedSpec]:
    return [
        _spec("product_profile", "mcu_processor_soc", category="profile_detection", source_snippet="Detected MCU/processor/SoC profile.", confidence="medium"),
        _spec("profile_confidence", "medium", category="profile_detection", source_snippet="Profile confidence: medium.", confidence="medium"),
        _spec("profile_rationale", "Detected from Cortex-M processor, memory, and interface facts.", category="profile_detection", source_snippet="Cortex-M processor and interface facts.", confidence="medium"),
        _spec("product_family", "i.MX RT1170 crossover processor family", category="product_identity", source_snippet="NXP i.MX RT1170 crossover processor family overview."),
        _spec("processor_architecture", "32-bit", category="processing_system_cpu", source_snippet="Dual-core design with Arm Cortex-M7 up to 1 GHz and Arm Cortex-M4 up to 400 MHz."),
        _spec("cpu_core", "Arm Cortex-M7", category="processing_system_cpu", source_snippet="Arm Cortex-M7 up to 1 GHz."),
        _spec("realtime_cpu", "Arm Cortex-M4", category="processing_system_cpu", source_snippet="Arm Cortex-M4 up to 400 MHz."),
        _spec("clock_speed", "1", unit="GHz", category="compute_processor", source_snippet="Arm Cortex-M7 up to 1 GHz."),
        _spec("cpu_clock_speed", "400", unit="MHz", category="compute_processor", source_snippet="Arm Cortex-M4 up to 400 MHz."),
        _spec("on_chip_ram", "2", unit="MB", category="memory_cache_integrity", source_snippet="Includes 2 MB on-chip RAM."),
        _spec("memory_cache", "64 KB I-cache and 64 KB D-cache", category="memory_cache_integrity", source_snippet="Includes 64 KB I-cache and 64 KB D-cache."),
        _spec("external_memory_interface", "SEMC external memory interface", category="digital_interface", source_snippet="Includes external SEMC memory interface."),
        _spec("ethernet_mac", "10/100 Ethernet MAC", category="digital_interface", source_snippet="Connectivity includes 10/100 Ethernet MAC."),
        _spec("usb_interface", "USB 2.0", category="digital_interface", source_snippet="Connectivity includes USB 2.0."),
        _spec("can_interface", "CAN FD", category="digital_interface", source_snippet="Connectivity includes CAN FD."),
        _spec("spi_interface", "SPI", category="digital_interface", source_snippet="Connectivity includes SPI."),
        _spec("i2c_interface", "I2C", category="digital_interface", source_snippet="Connectivity includes I2C."),
        _spec("uart_interface", "UART", category="digital_interface", source_snippet="Connectivity includes UART."),
        _spec("display_interface", "LCD display", category="digital_interface", source_snippet="Connectivity includes LCD display."),
        _spec("camera_interface", "MIPI CSI camera interface", category="digital_interface", source_snippet="Connectivity includes MIPI CSI camera interface."),
    ]


class WorkerPipelineRegressionTests(unittest.TestCase):
    def test_mcu_profile_keeps_canonical_category_3_path(self) -> None:
        extracted_text = """
        NXP i.MX RT1170 crossover processor family overview.
        Dual-core design with Arm Cortex-M7 up to 1 GHz and Arm Cortex-M4 up to 400 MHz.
        Includes 2 MB on-chip RAM, 64 KB I-cache and 64 KB D-cache, and external SEMC memory interface.
        Connectivity includes 10/100 Ethernet MAC, USB 2.0, CAN FD, SPI, I2C, UART, LCD display, and MIPI CSI camera interface.
        """.strip()
        specs = _mcu_specs()

        output = _build_output(
            document_id="doc_mcu_regression",
            document_title="NXP i.MX RT1170 Crossover Processor Family Overview",
            extracted_text=extracted_text,
            specs=specs,
        )

        serialized_titles = [candidate["title"] for candidate in output.to_dict()["eccn_candidates"]]
        self.assertEqual(serialized_titles.count(MCU_CATEGORY_3_TITLE), 1)
        self.assertIn(GENERAL_FALLBACK_TITLE, serialized_titles)
        self.assertEqual(
            [
                candidate.title
                for candidate in output.eccn_candidates
                if candidate.review_path_id == "category_3_mcu_processor_soc"
            ],
            [MCU_CATEGORY_3_TITLE],
        )

    def test_generic_hardware_keeps_general_fallback(self) -> None:
        extracted_text = """
        Acme ControlHub embedded controller datasheet.
        500 MHz embedded controller with PCIe, Ethernet, USB 2.0, and 7 W power consumption in a BGA package.
        """.strip()
        specs = [
            _spec("product_profile", "generic_electronics", category="profile_detection", source_snippet="Detected generic electronics profile.", confidence="medium"),
            _spec("profile_confidence", "medium", category="profile_detection", source_snippet="Profile confidence: medium.", confidence="medium"),
            _spec("profile_rationale", "Generic semiconductor/controller identity without a narrower profile.", category="profile_detection", source_snippet="Generic controller identity.", confidence="medium"),
            _spec("product_family", "Acme ControlHub", category="product_identity", source_snippet="Acme ControlHub embedded controller datasheet."),
            _spec("device_type", "Embedded controller", category="device_identity", source_snippet="500 MHz embedded controller."),
            _spec("clock_speed", "500", unit="MHz", category="compute_processor", source_snippet="500 MHz embedded controller."),
            _spec("pcie_interface", "PCIe", category="digital_interface", source_snippet="Includes PCIe."),
            _spec("ethernet_mac", "Ethernet", category="digital_interface", source_snippet="Includes Ethernet."),
            _spec("usb_interface", "USB 2.0", category="digital_interface", source_snippet="Includes USB 2.0."),
            _spec("package_type", "BGA", category="package", source_snippet="In a BGA package."),
            _spec("power_consumption", "7", unit="W", category="power", source_snippet="7 W power consumption."),
        ]

        output = _build_output(
            document_id="doc_generic_regression",
            document_title="Acme ControlHub Embedded Controller Datasheet",
            extracted_text=extracted_text,
            specs=specs,
        )

        serialized_titles = [candidate["title"] for candidate in output.to_dict()["eccn_candidates"]]
        self.assertIn(GENERAL_FALLBACK_TITLE, serialized_titles)

    def test_fpga_soc_profile_keeps_programmable_logic_category_3_path(self) -> None:
        extracted_text = """
        Acme FlexSoC family overview.
        64-bit Arm Cortex-A53 processing system with dual-core Cortex-R5F and programmable logic fabric.
        Includes PCIe, DisplayPort, and four tri-speed Ethernet MAC interfaces.
        """.strip()
        specs = [
            _spec("product_profile", "fpga_programmable_logic_soc", category="profile_detection", source_snippet="Detected FPGA/programmable-logic SoC profile.", confidence="medium"),
            _spec("profile_confidence", "medium", category="profile_detection", source_snippet="Profile confidence: medium.", confidence="medium"),
            _spec("profile_rationale", "Detected from programmable logic, processing system, and interface facts.", category="profile_detection", source_snippet="Programmable logic and processing system facts.", confidence="medium"),
            _spec("product_family", "Acme FlexSoC", category="product_identity", source_snippet="Acme FlexSoC family overview."),
            _spec("processor_architecture", "64-bit", category="processing_system_cpu", source_snippet="64-bit Arm Cortex-A53 processing system."),
            _spec("cpu_core", "Arm Cortex-A53", category="processing_system_cpu", source_snippet="Arm Cortex-A53 processing system."),
            _spec("realtime_cpu", "dual-core Cortex-R5F", category="processing_system_cpu", source_snippet="dual-core Cortex-R5F."),
            _spec("programmable_logic", "programmable logic fabric", category="programmable_logic_fpga", source_snippet="programmable logic fabric."),
            _spec("processing_system", "processing system", category="processing_system_cpu", source_snippet="processing system."),
            _spec("pcie_interface", "PCIe", category="digital_interface", source_snippet="Includes PCIe."),
            _spec("displayport_interface", "DisplayPort", category="digital_interface", source_snippet="Includes DisplayPort."),
            _spec("ethernet_mac", "four tri-speed Ethernet MAC", category="digital_interface", source_snippet="Includes four tri-speed Ethernet MAC interfaces."),
        ]

        output = _build_output(
            document_id="doc_fpga_regression",
            document_title="Acme FlexSoC Family Overview",
            extracted_text=extracted_text,
            specs=specs,
        )

        serialized_titles = [candidate["title"] for candidate in output.to_dict()["eccn_candidates"]]
        self.assertEqual(serialized_titles.count(FPGA_CATEGORY_3_TITLE), 1)
        self.assertIn(GENERAL_FALLBACK_TITLE, serialized_titles)

    def test_specific_candidate_serialization_dedupes_repeated_review_paths(self) -> None:
        candidates, _, _ = generate_eccn_candidates(
            _mcu_specs(),
            source_label="Uploaded datasheet text",
        )
        duplicated_candidates = [
            *candidates,
            copy.deepcopy(next(candidate for candidate in candidates if candidate.review_path_id == "category_3_mcu_processor_soc")),
            copy.deepcopy(next(candidate for candidate in candidates if candidate.review_path_id == "general_electronics_comparison")),
        ]

        serialized_candidates = _specific_eccn_candidates(duplicated_candidates, _mcu_specs())
        serialized_titles = [candidate.title for candidate in serialized_candidates]
        serialized_review_path_ids = [candidate.review_path_id for candidate in serialized_candidates]

        self.assertEqual(serialized_titles.count(MCU_CATEGORY_3_TITLE), 1)
        self.assertEqual(serialized_titles.count(GENERAL_FALLBACK_TITLE), 1)
        self.assertEqual(len(serialized_review_path_ids), len(set(serialized_review_path_ids)))


if __name__ == "__main__":
    unittest.main()
