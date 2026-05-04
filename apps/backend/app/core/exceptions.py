from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError


class PGManageException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        status_code: int = 400,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}
        self.status_code = status_code
        super().__init__(message)


class AuthenticationError(PGManageException):
    def __init__(self, message: str = "Authentication required", details: dict | None = None) -> None:
        super().__init__("AUTHENTICATION_ERROR", message, details, status.HTTP_401_UNAUTHORIZED)


class AuthorizationError(PGManageException):
    def __init__(self, message: str = "Insufficient permissions", details: dict | None = None) -> None:
        super().__init__("AUTHORIZATION_ERROR", message, details, status.HTTP_403_FORBIDDEN)


class NotFoundError(PGManageException):
    def __init__(self, resource: str, resource_id: Any = None) -> None:
        details = {"resource": resource}
        if resource_id:
            details["id"] = str(resource_id)
        super().__init__(
            f"{resource.upper()}_NOT_FOUND",
            f"{resource} not found",
            details,
            status.HTTP_404_NOT_FOUND,
        )


class ConflictError(PGManageException):
    def __init__(self, message: str, code: str = "CONFLICT") -> None:
        super().__init__(code, message, {}, status.HTTP_409_CONFLICT)


class PlanLimitError(PGManageException):
    def __init__(self, limit_type: str, current: int, limit: int) -> None:
        super().__init__(
            "PLAN_LIMIT_EXCEEDED",
            f"Your plan allows {limit} {limit_type}. Upgrade to add more.",
            {"limit_type": limit_type, "current": current, "limit": limit},
            status.HTTP_403_FORBIDDEN,
        )


class IdempotencyError(PGManageException):
    def __init__(self) -> None:
        super().__init__(
            "DUPLICATE_REQUEST",
            "A payment with this idempotency key already exists.",
            {},
            status.HTTP_409_CONFLICT,
        )


class ExternalServiceError(PGManageException):
    def __init__(self, service: str, message: str) -> None:
        super().__init__(
            "EXTERNAL_SERVICE_ERROR",
            f"{service} error: {message}",
            {"service": service},
            status.HTTP_502_BAD_GATEWAY,
        )


class OrgInactiveError(PGManageException):
    def __init__(self) -> None:
        super().__init__(
            "ORG_INACTIVE",
            "Your organisation account is inactive. Please contact support.",
            {},
            status.HTTP_403_FORBIDDEN,
        )


# ── FastAPI exception handlers ────────────────────────────────────────────────

def _error_response(code: str, message: str, details: dict, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


async def pgmanage_exception_handler(request: Request, exc: PGManageException) -> JSONResponse:
    return _error_response(exc.code, exc.message, exc.details, exc.status_code)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        422: "UNPROCESSABLE_ENTITY",
        429: "RATE_LIMIT_EXCEEDED",
        500: "INTERNAL_SERVER_ERROR",
    }
    # If caller passed a structured envelope HTTPException(detail={"error": {...}})
    # pass it through unchanged so structured codes like PENDING_APPROVAL survive.
    if isinstance(exc.detail, dict) and isinstance(exc.detail.get("error"), dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    code = code_map.get(exc.status_code, "HTTP_ERROR")
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return _error_response(code, detail, {}, exc.status_code)


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details: dict[str, Any] = {}
    for error in exc.errors():
        loc = " -> ".join(str(l) for l in error["loc"] if l != "body")
        details[loc] = error["msg"]
    return _error_response(
        "VALIDATION_ERROR",
        "Request validation failed",
        details,
        status.HTTP_422_UNPROCESSABLE_ENTITY,
    )
