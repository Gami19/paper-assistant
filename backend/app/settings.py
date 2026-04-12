"""型付き環境設定。BE-1: CORS と実行環境。BE-2: Bedrock / チャットモック。"""

from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _load_backend_dotenv_into_environ() -> None:
    """pydantic-settings は .env を Settings のフィールド用に読むだけで os.environ に載せない。
    boto3 は AWS_ACCESS_KEY_ID 等を環境変数から参照するため、backend/.env を明示的に読み込む。
    """
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.is_file():
        load_dotenv(env_path, override=False)


_load_backend_dotenv_into_environ()


class Settings(BaseSettings):
    """環境変数から読み込む。本番では .env に依存せずホストの Variables を正とする。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "production"] = "development"
    cors_allow_origins: str = ""

    aws_region: str = "ap-northeast-1"
    bedrock_model_id: str = ""
    chat_mock_mode: bool = False
    bedrock_connect_timeout_seconds: int = Field(
        default=10,
        ge=1,
        le=300,
        description="Bedrock boto3 connect timeout (seconds)",
    )
    bedrock_read_timeout_seconds: int = Field(
        default=120,
        ge=1,
        le=600,
        description="Bedrock boto3 read timeout (seconds)",
    )

    @model_validator(mode="after")
    def production_requires_cors_origins(self) -> Self:
        if self.environment == "production" and not self.cors_allow_origins.strip():
            msg = "CORS_ALLOW_ORIGINS must be non-empty when ENVIRONMENT=production"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def production_forbids_chat_mock(self) -> Self:
        if self.environment == "production" and self.chat_mock_mode:
            msg = "CHAT_MOCK_MODE must be false when ENVIRONMENT=production"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def production_requires_bedrock_when_not_mock(self) -> Self:
        if (
            self.environment == "production"
            and not self.chat_mock_mode
            and not self.bedrock_model_id.strip()
        ):
            msg = "BEDROCK_MODEL_ID must be set when ENVIRONMENT=production and mock is off"
            raise ValueError(msg)
        return self

    def cors_origin_list(self) -> list[str]:
        if not self.cors_allow_origins.strip():
            return []
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]
