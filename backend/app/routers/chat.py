"""POST /v1/chat — M2 最小 1 往復（一括 JSON）。"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.domain.bedrock_errors import BedrockThrottledError
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_reply import NoUserMessageError, chat_reply_use_case
from app.settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def chat_reply(settings: Settings, body: ChatRequest) -> ChatResponse:
    try:
        return chat_reply_use_case(settings, body)
    except NoUserMessageError:
        raise HTTPException(
            status_code=400,
            detail="No user message to reply to",
        ) from None
    except BedrockThrottledError:
        raise HTTPException(
            status_code=429,
            detail="モデルが混雑しています。しばらくしてから再度お試しください。",
        ) from None
    except RuntimeError:
        raise HTTPException(
            status_code=502,
            detail="Assistant temporarily unavailable",
        ) from None


@router.post("/v1/chat", response_model=ChatResponse)
def post_chat(
    body: ChatRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ChatResponse:
    # プロンプト全文はログに出さない（review 方針）
    logger.info("chat_request", extra={"message_count": len(body.messages)})
    return chat_reply(settings, body)
