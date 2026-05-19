import uuid
from datetime import datetime
from sqlalchemy import (
    String, Boolean, Integer, BigInteger, Text, DateTime, ForeignKey, JSON,
    UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def _uuid():
    return uuid.uuid4()


def _now():
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(128))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    used_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    used_at: Mapped[datetime | None] = mapped_column(DateTime)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    note: Mapped[str | None] = mapped_column(String(255))
    grants_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=_uuid)
    owner_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[str | None] = mapped_column(String(32))
    tags: Mapped[list | None] = mapped_column(JSON, default=list)

    # 存储相关
    storage_path: Mapped[str] = mapped_column(String(255), nullable=False)  # 相对 STORAGE_ROOT
    entry_file: Mapped[str] = mapped_column(String(255), default="SKILL.md")
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    file_count: Mapped[int] = mapped_column(Integer, default=0)

    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)

    # 最新质检快照(冗余,方便首页排序 / 显示徽章)
    latest_score: Mapped[int | None] = mapped_column(Integer)
    latest_verdict: Mapped[str | None] = mapped_column(String(32))
    inspecting_started_at: Mapped[datetime | None] = mapped_column(DateTime)  # 后台评测中标记

    view_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("owner_id", "slug", name="uq_skills_owner_slug"),
        Index("ix_skills_published_at", "published_at"),
    )


class QualityReport(Base):
    __tablename__ = "quality_reports"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=_uuid)
    skill_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("skills.id"), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(16), default="both", nullable=False, index=True)  # static | llm | both
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    verdict: Mapped[str] = mapped_column(String(32), nullable=False)
    dimensions: Mapped[dict] = mapped_column(JSON, nullable=False)
    suggestions: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str | None] = mapped_column(Text)
    static_payload: Mapped[dict | None] = mapped_column(JSON)
    llm_payload: Mapped[dict | None] = mapped_column(JSON)
    llm_model: Mapped[str | None] = mapped_column(String(128))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
