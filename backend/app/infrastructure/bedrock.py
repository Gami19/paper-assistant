"""Bedrock Runtime と開発用モック — ChatCompleter 実装。"""

from __future__ import annotations

import logging

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.ports.chat_completion import ChatCompleter
from app.settings import Settings

logger = logging.getLogger(__name__)


def _bedrock_runtime_client(
    region: str,
    connect_timeout: int,
    read_timeout: int,
):
    """タイムアウトを 1 箇所に集約した Bedrock Runtime クライアント。"""
    botocore_config = Config(
        connect_timeout=connect_timeout,
        read_timeout=read_timeout,
    )
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=botocore_config,
    )


class MockChatCompleter:
    """CHAT_MOCK_MODE 用。AWS を呼ばない。"""

    def complete(self, user_text: str) -> str:
        preview = user_text.strip()[:500]
        return f"[mock] {preview}"


class BedrockChatCompleter:
    """Settings 由来のリージョン・モデル・タイムアウトで Converse を 1 往復。"""

    def __init__(self, settings: Settings) -> None:
        self._region = settings.aws_region
        self._model_id = settings.bedrock_model_id
        self._connect_timeout = settings.bedrock_connect_timeout_seconds
        self._read_timeout = settings.bedrock_read_timeout_seconds

    def complete(self, user_text: str) -> str:
        client = _bedrock_runtime_client(
            self._region,
            self._connect_timeout,
            self._read_timeout,
        )
        try:
            response = client.converse(
                modelId=self._model_id,
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": user_text}],
                    }
                ],
            )
        except ClientError as e:
            err = e.response.get("Error", {}) if isinstance(e.response, dict) else {}
            code = err.get("Code", "Unknown")
            aws_message = (err.get("Message") or "")[:300]
            # ターミナルで原因特定しやすいよう本文に含める（クライアントには返さない）
            logger.error(
                "bedrock_converse_client_error error_code=%s region=%s model_id=%s aws_message=%s",
                code,
                self._region,
                self._model_id,
                aws_message,
            )
            msg = "Model request failed"
            raise RuntimeError(msg) from e
        except BotoCoreError as e:
            logger.error(
                "bedrock_converse_boto_core_error error_type=%s region=%s model_id=%s",
                type(e).__name__,
                self._region,
                self._model_id,
            )
            msg = "Model request failed"
            raise RuntimeError(msg) from e

        output = response.get("output") or {}
        message = output.get("message") or {}
        blocks = message.get("content") or []
        parts: list[str] = []
        for block in blocks:
            if isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
        return "".join(parts).strip()


def build_chat_completer(settings: Settings) -> ChatCompleter:
    """Settings に応じてモックまたは Bedrock 実装を返す。"""
    if settings.chat_mock_mode:
        return MockChatCompleter()
    return BedrockChatCompleter(settings)
