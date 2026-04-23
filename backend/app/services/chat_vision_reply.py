"""POST /v1/chat/vision のユースケース（サーバー本文 + 矩形クロップ画像・複数参照 Phase D）。"""

from __future__ import annotations

from pathlib import Path

from app.ports.chat_completion import ChatCompleter, ChatTurn
from app.schemas.chat import ChatResponse
from app.schemas.chat_vision import ChatVisionRequest
from app.services.chat_reply import DEFAULT_CHAT_SYSTEM, NoUserMessageError
from app.services.paper_store import resolve_paper_path
from app.services.pdf_page_image import crop_page_region_png
from app.services.pdf_text import build_paper_page_text_bundle
from app.settings import Settings

VISION_INSTRUCTIONS = (
    "図・表の画像から読み取れる観察事実と、以下の page_text（ページ本文）から裏付けられる記述を区別してください。"
    "page_text に無い数値・単位・式・定義を断定しないでください。「本文に記載なし」や「不明」と明記してください。"
    " 複数画像がある場合、上から順に参照 (1)、(2)… と本文の見出しを対応づけてください。"
)


def _clamp_scale(settings: Settings, scale: float) -> float:
    return max(
        settings.paper_page_image_scale_min,
        min(scale, settings.paper_page_image_scale_max),
    )


def _merge_pm1_for_unique_center_pages(
    pdf_path: Path,
    center_pages: list[int],
    settings: Settings,
) -> str:
    """同一 PDF 内で中心ページが重複する場合は pm1 本文を 1 度だけ含める。"""
    chunks: list[str] = []
    for p in sorted(set(center_pages)):
        bundle = build_paper_page_text_bundle(
            pdf_path,
            p,
            "pm1",
            max_pm1_chars=settings.paper_page_neighbor_text_max_chars,
        )
        chunks.append(f"--- 中心ページ {p}（±1 本文）---\n{bundle.text}")
    return "\n\n".join(chunks).strip()


def _build_vision_system(
    merged_page_text: str,
    selection_labels: list[str | None],
) -> str:
    ref_lines: list[str] = []
    for i, lab in enumerate(selection_labels, start=1):
        if lab and lab.strip():
            ref_lines.append(f"参照 ({i}): ラベル「{lab.strip()}」（参考）")
        else:
            ref_lines.append(f"参照 ({i})")
    parts = [
        DEFAULT_CHAT_SYSTEM,
        VISION_INSTRUCTIONS,
        "画像の順序と参照番号:\n" + "\n".join(ref_lines),
        "--- page_text（サーバー抽出。中心ページごとに ±1 を 1 ブロックにまとめています）---",
        merged_page_text if merged_page_text else "（本文が空です）",
        "---",
    ]
    return "\n\n".join(parts)


def chat_vision_reply_use_case(
    settings: Settings,
    body: ChatVisionRequest,
    completer: ChatCompleter | None = None,
) -> ChatResponse:
    from app.infrastructure.bedrock import build_chat_completer

    effective = completer or build_chat_completer(settings)
    pdf_path = resolve_paper_path(settings, body.paper_id)

    image_pngs: list[bytes] = []
    for sel in body.selections:
        s = _clamp_scale(settings, sel.scale)
        crop_bytes = crop_page_region_png(
            pdf_path,
            sel.page,
            s,
            sel.rect.x,
            sel.rect.y,
            sel.rect.w,
            sel.rect.h,
            max_pixels=settings.paper_page_image_max_pixels,
        )
        image_pngs.append(crop_bytes)

    center_pages = [sel.page for sel in body.selections]
    merged = _merge_pm1_for_unique_center_pages(pdf_path, center_pages, settings)
    system = _build_vision_system(merged, [sel.figure_label for sel in body.selections])
    pairs: list[ChatTurn] = [(m.role, m.content) for m in body.messages]

    text = effective.converse_with_vision(
        system=system,
        messages=pairs,
        image_pngs=image_pngs,
    )
    if not text.strip():
        raise NoUserMessageError

    return ChatResponse(content=text)
