
import base64
import logging

import httpx
from fastapi import HTTPException

from app.schemas.nutrition import ScanRecognition

# --------------------------------------------------
# ENVIRONMENT CONFIGURATION
# --------------------------------------------------

from app.config import E2E_MODE, external_setting, settings
from app.services import ai_monitor as monitor

logger = logging.getLogger(__name__)


# --------------------------------------------------
# GEMINI FOOD SCANNER
# --------------------------------------------------

def scanner_api_key(db, user_id):
    if not E2E_MODE or not settings.E2E_LIVE_MEAL_SCANNER_ENABLED:
        return external_setting("GEMINI_API_KEY")

    from app.e2e_guard import require_e2e_launcher, verify_database_identity
    from sqlalchemy.exc import SQLAlchemyError

    if db is None or user_id is None:
        raise HTTPException(503, "Live E2E scanning requires an authenticated isolated request.")
    try:
        require_e2e_launcher()
        verify_database_identity(db.connection())
    except (RuntimeError, SQLAlchemyError):
        raise HTTPException(503, "Live E2E scanning requires a verified isolated backend.") from None
    return settings.E2E_MEAL_SCANNER_GEMINI_API_KEY.get_secret_value().strip()


async def scan_food(image_bytes: bytes, mime_type: str, *, db=None, user_id=None, entitlement_quota=False):
    api_key = scanner_api_key(db, user_id)

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is not configured.",
        )

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Image file is empty.",
        )

    if mime_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format.",
        )

    try:
        config = monitor.provider_runtime("scan", user_id, db, entitlement_quota=entitlement_quota)
    except monitor.AIUnavailable:
        raise HTTPException(503, "AI scanning is currently unavailable or its daily limit is reached.") from None
    model = config.model_name

    prompt = """
Identify visible foods in this meal photograph.
Focus on Sri Lankan foods when relevant.

Return ONLY valid JSON:
{
  "items": [
    {
      "name": "food name",
      "estimated_grams": 150,
      "confidence": "low"
    }
  ]
}

Rules:
- Never invent nutritional values.
- Do not identify people or health conditions.
- Portion sizes are rough estimates.
- Confidence must be low, medium or high.
- Return at most 10 foods.
- If food cannot be identified, return an empty list.
"""

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(
                                image_bytes
                            ).decode("utf-8"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": ScanRecognition.model_json_schema(),
            "temperature": float(config.temperature),
        },
    }

    if config.max_output_tokens is not None:
        payload["generationConfig"]["maxOutputTokens"] = config.max_output_tokens
    if config.prompt:
        payload["systemInstruction"] = {"parts": [{"text": monitor.instructions(prompt, config)}]}
    meter = monitor.Attempt(config)
    output = None

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent"
    )

    try:
        logger.info(
            "Starting Gemini food scan. Model=%s, MIME=%s",
            model,
            mime_type,
        )

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                url,
                headers={"x-goog-api-key": api_key},
                json=payload,
            )

        if response.status_code != 200:
            try:
                meter.capture(response.json().get("usageMetadata"))
            except (ValueError, AttributeError):
                pass
            # Do not log raw upstream response bodies:
            # they may contain sensitive request details.
            logger.error(
                "Gemini API returned HTTP %s",
                response.status_code,
            )

            if response.status_code in (401, 403):
                detail = "Gemini API access was denied."
            elif response.status_code == 404:
                detail = "Gemini model or endpoint was not found."
            elif response.status_code == 429:
                detail = "Gemini API quota or rate limit was reached."
            elif response.status_code == 400:
                detail = "Gemini rejected the image request."
            else:
                detail = "Gemini API request failed."

            raise HTTPException(
                status_code=502,
                detail=detail,
            )

        result = response.json()
        meter.capture(result.get("usageMetadata"))

        candidates = result.get("candidates", [])

        if not candidates:
            logger.warning("AI scanner returned no candidates.")
            raise HTTPException(
                status_code=502,
                detail="Gemini returned no food analysis.",
            )

        parts = candidates[0].get("content", {}).get("parts", [])

        text_parts = [
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and not part.get("thought") and part.get("text")
        ]

        if not text_parts:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty response.",
            )

        result = ScanRecognition.model_validate_json("".join(text_parts))
        items = [item.model_dump() for item in result.items]

        logger.info(
            "Gemini food scan completed. Items=%s",
            len(items),
        )

        output = {
            "items": items,
            "message": (
                "AI estimates may be inaccurate. "
                "Review every food and portion before saving."
            ),
        }

        return output

    except HTTPException:
        raise

    except httpx.TimeoutException:
        logger.warning("Gemini request timed out")
        raise HTTPException(
            status_code=504,
            detail="Gemini request timed out. Please try again.",
        )

    except httpx.RequestError:
        logger.warning("Could not connect to Gemini API")
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Gemini API.",
        )

    except (ValueError, TypeError, KeyError, IndexError, AttributeError):
        logger.warning("Invalid Gemini food scan response")
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an invalid food analysis.",
        ) from None
    finally:
        usage_id = meter.finish(output is not None)
        if output is not None:
            receipt = monitor.scan_receipt(usage_id, user_id)
            if receipt:
                output["scan_receipt"] = receipt
