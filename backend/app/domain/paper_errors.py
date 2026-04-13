"""論文 PDF ユースケース用のドメイン例外（HTTP への翻訳はルータで行う）。"""

from __future__ import annotations


class PaperStoreError(Exception):
    """基底。メッセージはログ用。クライアント向け文言はルータで固定する。"""


class PaperValidationError(PaperStoreError):
    """空ファイル・非 PDF 等。"""


class PaperTooLargeError(PaperStoreError):
    """サイズ上限超過。"""


class PaperNotFoundError(PaperStoreError):
    """該当ファイルなし。"""


class PaperFetchDisabledError(PaperStoreError):
    """設定で fetch が無効。"""


class PaperFetchRejectedError(PaperStoreError):
    """URL 検証失敗・SSRF 疑い。"""


class PaperFetchHttpError(PaperStoreError):
    """HTTP 非成功・リダイレクト・タイムアウト等。"""
