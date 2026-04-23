"""Bedrock Runtime と開発用モック — ChatCompleter 実装。"""

from __future__ import annotations

import logging
from typing import Literal

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.domain.bedrock_errors import BedrockThrottledError
from app.ports.chat_completion import ChatCompleter, ChatTurn
from app.settings import Settings

logger = logging.getLogger(__name__)

_BEDROCK_THROTTLE_CODES = frozenset({"ThrottlingException", "TooManyRequestsException"})


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


def _turns_to_bedrock_messages(turns: list[ChatTurn]) -> list[dict]:
    out: list[dict] = []
    for role, text in turns:
        br_role: Literal["user", "assistant"] = role
        out.append(
            {
                "role": br_role,
                "content": [{"text": text}],
            },
        )
    return out


def _turns_to_bedrock_messages_with_final_images(
    turns: list[ChatTurn],
    image_pngs: list[bytes],
) -> list[dict]:
    """最後の user ターンのみ 複数 image の後に text。"""
    if not turns or turns[-1][0] != "user":
        msg = "messages must end with a user turn"
        raise ValueError(msg)
    if not image_pngs:
        msg = "image_pngs must be non-empty"
        raise ValueError(msg)
    out: list[dict] = []
    for role, text in turns[:-1]:
        br_role: Literal["user", "assistant"] = role
        out.append(
            {
                "role": br_role,
                "content": [{"text": text}],
            },
        )
    content: list[dict] = [
        {"image": {"format": "png", "source": {"bytes": png}}} for png in image_pngs
    ]
    content.append({"text": turns[-1][1]})
    out.append({"role": "user", "content": content})
    return out


class MockChatCompleter:
    """CHAT_MOCK_MODE 用。AWS を呼ばない。"""

    def converse(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
    ) -> str:
        for role, content in reversed(messages):
            if role == "user":
                preview = content.strip()[:500]
                return f"[mock] {preview}"
        return "[mock]"

    def converse_with_vision(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
        image_pngs: list[bytes],
    ) -> str:
        _ = system
        _ = image_pngs
        for role, content in reversed(messages):
            if role == "user":
                preview = content.strip()[:500]
                return f"[mock] vision:{preview}"
        return "[mock] vision"


class BedrockChatCompleter:
    """Settings 由来のリージョン・モデル・タイムアウトで Converse を実行。"""

    def __init__(self, settings: Settings) -> None:
        self._region = settings.aws_region
        self._model_id = settings.bedrock_model_id
        self._connect_timeout = settings.bedrock_connect_timeout_seconds
        self._read_timeout = settings.bedrock_read_timeout_seconds

    def converse(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
    ) -> str:
        client = _bedrock_runtime_client(
            self._region,
            self._connect_timeout,
            self._read_timeout,
        )
        kwargs: dict = {
            "modelId": self._model_id,
            "messages": _turns_to_bedrock_messages(messages),
        }
        if system and system.strip():
            kwargs["system"] = [{"text": system.strip()}]
        try:
            response = client.converse(**kwargs)
        except ClientError as e:
            err = e.response.get("Error", {}) if isinstance(e.response, dict) else {}
            code = err.get("Code", "Unknown")
            aws_message = (err.get("Message") or "")[:300]
            log_fn = logger.warning if code in _BEDROCK_THROTTLE_CODES else logger.error
            log_fn(
                "bedrock_converse_client_error error_code=%s region=%s model_id=%s aws_message=%s",
                code,
                self._region,
                self._model_id,
                aws_message,
            )
            if code in _BEDROCK_THROTTLE_CODES:
                raise BedrockThrottledError(code) from e
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

    def converse_with_vision(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
        image_pngs: list[bytes],
    ) -> str:
        client = _bedrock_runtime_client(
            self._region,
            self._connect_timeout,
            self._read_timeout,
        )
        kwargs: dict = {
            "modelId": self._model_id,
            "messages": _turns_to_bedrock_messages_with_final_images(messages, image_pngs),
        }
        if system and system.strip():
            kwargs["system"] = [{"text": system.strip()}]
        try:
            response = client.converse(**kwargs)
        except ClientError as e:
            err = e.response.get("Error", {}) if isinstance(e.response, dict) else {}
            code = err.get("Code", "Unknown")
            aws_message = (err.get("Message") or "")[:300]
            log_fn = logger.warning if code in _BEDROCK_THROTTLE_CODES else logger.error
            log_fn(
                "bedrock_converse_client_error error_code=%s region=%s model_id=%s aws_message=%s",
                code,
                self._region,
                self._model_id,
                aws_message,
            )
            if code in _BEDROCK_THROTTLE_CODES:
                raise BedrockThrottledError(code) from e
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
