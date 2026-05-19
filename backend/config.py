from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", env_prefix="SKILLHUB_")

    # DB
    db_host: str = "postgres"
    db_port: int = 5432
    db_user: str = "kb_admin"
    db_password: str = ""
    db_name: str = "skillhub"

    @property
    def db_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    # Auth
    jwt_secret: str = "change-me-skillhub"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24 * 14  # 两周

    # Storage
    storage_root: str = "/data/skillhub"
    max_skill_size_mb: int = 50
    max_file_count: int = 500
    max_text_preview_kb: int = 512  # 单文件文本预览最大 512KB

    # LLM(独立)
    llm_provider: str = "anthropic"  # anthropic | openai_compat
    llm_base_url: str = "https://api.anthropic.com"
    llm_api_key: str = ""
    llm_model: str = "claude-opus-4-7"
    llm_timeout: int = 90

    # Bootstrap admin(首次启动建)
    bootstrap_admin_email: str = "admin@skillhub.local"
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = "changeme!"


settings = Settings()
