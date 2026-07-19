from slugify import slugify


def generate_slug(value: str) -> str:
    return slugify(
        value,
        lowercase=True,
        separator="-",
    )
