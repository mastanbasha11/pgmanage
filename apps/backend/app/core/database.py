from __future__ import annotations

from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, MappedColumn

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=settings.is_local,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def set_schema(session: AsyncSession, schema_name: str) -> None:
    """Set the PostgreSQL search_path for this session to scope queries to an org schema."""
    await session.execute(
        text(f"SET LOCAL search_path TO {schema_name}, public")
    )


async def create_org_schema(org_id: UUID) -> None:
    """Create the schema for a new organisation. Called during org signup."""
    schema_name = f"org_{str(org_id).replace('-', '_')}"
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"')
        )
        await session.commit()
    return schema_name


async def drop_org_schema(org_id: UUID) -> None:
    """Drop an org schema. Super admin only, irreversible."""
    schema_name = f"org_{str(org_id).replace('-', '_')}"
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE')
        )
        await session.commit()


def get_org_schema_name(org_id: UUID | str) -> str:
    """Return the PostgreSQL schema name for an organisation."""
    return f"org_{str(org_id).replace('-', '_')}"
