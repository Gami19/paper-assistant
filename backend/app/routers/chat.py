"""POST /v1/chat — M2 最小 1 往復（一括 JSON）。"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.domain.bedrock_errors import BedrockThrottledError
from app.domain.paper_errors import (
    PaperNotFoundError,
    PaperPageImageTooLargeError,
    PaperPageOutOfRangeError,
    PaperValidationError,
    PaperVisionRectError,
)
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.chat_vision import ChatVisionRequest
from app.services.chat_reply import NoUserMessageError, chat_reply_use_case
from app.services.chat_vision_reply import chat_vision_reply_use_case
from app.settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def chat_vision_reply(settings: Settings, body: ChatVisionRequest) -> ChatResponse:
    try:
        return chat_vision_reply_use_case(settings, body)
    except NoUserMessageError:
        raise HTTPException(
            status_code=400,
            detail="No user message to reply to",
        ) from None
    except PaperNotFoundError:
        raise HTTPException(status_code=404, detail="Paper not found") from None
    except PaperPageOutOfRangeError:
        raise HTTPException(status_code=404, detail="Page not found") from None
    except PaperVisionRectError as e:
        raise HTTPException(status_code=400, detail=str(e) or "Invalid crop rectangle") from None
    except PaperValidationError:
        raise HTTPException(
            status_code=422,
            detail="Could not read PDF",
        ) from None
    except PaperPageImageTooLargeError:
        raise HTTPException(
            status_code=413,
            detail="Rendered region exceeds pixel limit",
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


@router.post("/v1/chat/vision", response_model=ChatResponse)
def post_chat_vision(
    body: ChatVisionRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ChatResponse:
    if len(body.selections) > settings.chat_vision_max_figures:
        raise HTTPException(
            status_code=422,
            detail="Too many figure selections",
        )
    logger.info(
        "chat_vision_request",
        extra={
            "message_count": len(body.messages),
            "paper_id": str(body.paper_id),
            "selection_count": len(body.selections),
        },
    )
    return chat_vision_reply(settings, body)
