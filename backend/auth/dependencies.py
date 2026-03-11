DEMO_USER = {"user_id": 1, "username": "demo"}


async def get_current_user() -> dict:
    return DEMO_USER


async def get_optional_user() -> dict | None:
    return DEMO_USER
