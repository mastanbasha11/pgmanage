from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, set_schema, get_org_schema_name
from app.core.exceptions import AuthenticationError, AuthorizationError, NotFoundError
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)
oauth2_scheme_required = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


@dataclass
class OrgContext:
    org_id: UUID
    user_id: UUID
    role: str
    property_ids: list[UUID] | None  # None = access to all properties
    name: str
    email: str | None = None
    jti: str | None = None


@dataclass
class TenantContext:
    tenant_id: UUID
    property_id: UUID
    org_id: UUID
    role: str = "TENANT"


async def get_org_context(
    token: str = Depends(oauth2_scheme_required),
    db: AsyncSession = Depends(get_db),
) -> OrgContext:
    """
    Decode JWT, set PostgreSQL search_path to the org's schema,
    and return OrgContext. Injected into every protected endpoint.
    """
    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired token") from exc

    if payload.get("type") != "access":
        raise AuthenticationError("Invalid token type")

    role = payload.get("role")
    if role == "TENANT":
        raise AuthorizationError("Use tenant portal endpoints")
    if role == "PLATFORM_ADMIN":
        raise AuthorizationError("Use platform admin endpoints")

    org_id_str = payload.get("org_id")
    user_id_str = payload.get("sub") or payload.get("user_id")
    if not org_id_str or not user_id_str:
        raise AuthenticationError("Malformed token payload")

    try:
        org_id = UUID(org_id_str)
        user_id = UUID(user_id_str)
    except ValueError as exc:
        raise AuthenticationError("Invalid token payload") from exc

    # Set search_path so all queries run in the right org schema
    schema_name = get_org_schema_name(org_id)
    await set_schema(db, schema_name)

    property_ids_raw = payload.get("property_ids")
    property_ids: list[UUID] | None = None
    if property_ids_raw is not None:
        property_ids = [UUID(p) for p in property_ids_raw]

    return OrgContext(
        org_id=org_id,
        user_id=user_id,
        role=role or "SUPERVISOR",
        property_ids=property_ids,
        name=payload.get("name", ""),
        email=payload.get("email"),
        jti=payload.get("jti"),
    )


async def get_current_tenant(
    token: str = Depends(oauth2_scheme_required),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    """Dependency for tenant portal endpoints."""
    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired token") from exc

    if payload.get("role") != "TENANT":
        raise AuthorizationError("Tenant access only")

    tenant_id = UUID(payload["tenant_id"])
    property_id = UUID(payload["property_id"])
    org_id = UUID(payload["org_id"])

    schema_name = get_org_schema_name(org_id)
    await set_schema(db, schema_name)

    return TenantContext(
        tenant_id=tenant_id,
        property_id=property_id,
        org_id=org_id,
    )


async def get_platform_admin(
    token: str = Depends(oauth2_scheme_required),
) -> dict:
    """Dependency for super admin panel."""
    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired token") from exc

    if payload.get("role") != "PLATFORM_ADMIN":
        raise AuthorizationError("Platform admin access only")

    return payload


def require_roles(roles: list[str]):
    """
    Factory that returns a dependency enforcing role membership.

    Usage:
        @router.get("/...", dependencies=[Depends(require_roles(["OWNER", "PARTNER"]))])
    """
    async def _check(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
        if ctx.role not in roles:
            raise AuthorizationError(
                f"This action requires one of: {', '.join(roles)}"
            )
        return ctx

    return _check


async def require_property_access(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
) -> OrgContext:
    """
    Verify that the current user can access the given property.
    OWNER/PARTNER → unrestricted. Others → check property_ids in token.
    """
    if ctx.role in ("OWNER", "PARTNER"):
        return ctx
    if ctx.property_ids is None or property_id in ctx.property_ids:
        return ctx
    raise AuthorizationError("You do not have access to this property")
