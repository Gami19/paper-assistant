"""論文 PDF の日本語構造化要約（BE-5）。"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from app.infrastructure.bedrock import build_chat_completer
from app.ports.chat_completion import ChatCompleter
from app.schemas.papers import PaperSummaryResponse
from app.services.pdf_text import extract_plain_text_from_pdf
from app.settings import Settings

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = (
    "あなたは学術論文の要約に慣れたアシスタントです。"
    "入力は論文PDFから抽出したプレーンテキストで、途中で切り詰められている場合があります。"
    "次のキーをすべて含む JSON オブジェクトだけを出力してください。"
    "前置き・後書き・マークダウンコードフェンスは禁止です。\n\n"
    "キー（文字列値）: title_ja, one_liner, purpose, method, results, takeaways, keywords\n"
    "keywords は関連語をカンマ区切りの1行にまとめてください。"
)


def _strip_code_fence(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _parse_summary_json(raw: str) -> PaperSummaryResponse | None:
    try:
        data = json.loads(_strip_code_fence(raw))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    try:
        return PaperSummaryResponse(
            title_ja=str(data.get("title_ja", "")),
            one_liner=str(data.get("one_liner", "")),
            purpose=str(data.get("purpose", "")),
            method=str(data.get("method", "")),
            results=str(data.get("results", "")),
            takeaways=str(data.get("takeaways", "")),
            keywords=str(data.get("keywords", "")),
            truncated_source=False,  # filled by caller
        )
    except Exception:
        return None


def _mock_placeholder_summary(truncated: bool) -> PaperSummaryResponse:
    return PaperSummaryResponse(
        title_ja="（モック要約）",
        one_liner="CHAT_MOCK_MODE では Bedrock を呼ばないため、プレースホルダです。",
        purpose="—",
        method="—",
        results="—",
        takeaways="—",
        keywords="mock, paper-assistant",
        truncated_source=truncated,
    )


def summarize_paper_file(
    settings: Settings,
    pdf_path: Path,
    completer: ChatCompleter | None = None,
) -> PaperSummaryResponse:
    extraction = extract_plain_text_from_pdf(
        pdf_path,
        max_pages=settings.paper_extract_max_pages,
        max_chars=settings.paper_extract_max_chars,
    )
    effective = completer or build_chat_completer(settings)
    user_prompt = (
        "次の論文テキストを読み、指定スキーマの JSON のみを返してください。\n\n"
        f"{extraction.text}"
    )
    raw = effective.converse(
        system=SUMMARY_SYSTEM_PROMPT,
        messages=[("user", user_prompt)],
    )

    if settings.chat_mock_mode or raw.strip().startswith("[mock]"):
        out = _mock_placeholder_summary(extraction.truncated)
        return out

    parsed = _parse_summary_json(raw)
    if parsed is None:
        logger.info("paper_summary_json_parse_failed", extra={"preview": raw[:200]})
        raise ValueError("Model did not return valid summary JSON")

    return parsed.model_copy(update={"truncated_source": extraction.truncated})
