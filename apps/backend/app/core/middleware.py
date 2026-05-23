from __future__ import annotations

import time
import uuid
from typing import Callable

import redis.asyncio as aioredis
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique X-Request-ID to every request and response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Structured request/response logging."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        request_id = getattr(request.state, "request_id", "-")

        response = await call_next(request)

        duration_ms = (time.perf_counter() - start) * 1000
        print(
            f"[{request.method}] {request.url.path} "
            f"status={response.status_code} "
            f"duration={duration_ms:.1f}ms "
            f"request_id={request_id}"
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Token-bucket rate limiting backed by Redis.
    OTP/login endpoints: 5 req/min per IP.
    All other endpoints: settings.RATE_LIMIT_PER_MINUTE per IP.
    """

    STRICT_PATHS = {"/api/v1/auth/otp", "/api/v1/auth/login", "/api/v1/tenant/auth"}

    @property
    def STRICT_LIMIT(self) -> int:
        # Use same limit as general rate limit (allows tests to override via settings)
        return min(5, settings.RATE_LIMIT_PER_MINUTE)

    def __init__(self, app, redis_url: str = settings.REDIS_URL) -> None:
        super().__init__(app)
        self._redis_url = redis_url
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = await aioredis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    def _is_strict(self, path: str) -> bool:
        return any(path.startswith(p) for p in self.STRICT_PATHS)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Behind Caddy: request.client.host is the proxy container's IP, so
        # without this every user shares one rate-limit bucket. Caddy sets
        # X-Forwarded-For; take the first hop (the actual end user).
        fwd = request.headers.get("x-forwarded-for", "")
        client_ip = (
            fwd.split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
        path = request.url.path
        limit = self.STRICT_LIMIT if self._is_strict(path) else settings.RATE_LIMIT_PER_MINUTE
        key = f"rate:{client_ip}:{path if self._is_strict(path) else 'global'}"

        try:
            r = await self._get_redis()
            current = await r.incr(key)
            if current == 1:
                await r.expire(key, 60)
            if current > limit:
                return JSONResponse(
                    status_code=429,
                    content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please wait.", "details": {}}},
                    headers={"Retry-After": "60"},
                )
        except Exception:
            # If Redis is down, allow the request through (fail open)
            pass

        return await call_next(request)
