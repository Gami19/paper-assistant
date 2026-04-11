"""型付き環境設定。BE-1: CORS と実行環境。BEDROCK 等は BE-2 以降で拡張する。"""

from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """環境変数から読み込む。本番では .env に依存せずホストの Variables を正とする。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "production"] = "development"
    cors_allow_origins: str = ""

    @model_validator(mode="after")
    def production_requires_cors_origins(self) -> Self:
        if self.environment == "production" and not self.cors_allow_origins.strip():
            msg = "CORS_ALLOW_ORIGINS must be non-empty when ENVIRONMENT=production"
            raise ValueError(msg)
        return self

    def cors_origin_list(self) -> list[str]:
        if not self.cors_allow_origins.strip():
            return []
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]
