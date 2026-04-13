"""論文 PDF のディレクトリ操作と GC。"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from uuid import UUID

logger = logging.getLogger(__name__)


def ensure_storage_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def paper_file_path(storage_dir: Path, paper_id: UUID) -> Path:
    return storage_dir / f"{paper_id}.pdf"


def gc_old_files(storage_dir: Path, max_age_seconds: int, now: float | None = None) -> int:
    """mtime が max_age_seconds より古い *.pdf を削除。削除件数を返す。"""
    if max_age_seconds <= 0:
        return 0
    cutoff = (now or time.time()) - max_age_seconds
    removed = 0
    if not storage_dir.is_dir():
        return 0
    for p in storage_dir.glob("*.pdf"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
                removed += 1
        except OSError as exc:
            logger.warning("paper_gc_unlink_failed", extra={"path": str(p), "error": str(exc)})
    return removed
