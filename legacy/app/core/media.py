import io
import uuid
from pathlib import Path

from PIL import Image, UnidentifiedImageError

MAX_BYTES = 15 * 1024 * 1024
MAX_SIDE = 1600


def save_image(media_dir: Path, data: bytes) -> str:
    """Validate and re-encode an uploaded image (strips metadata, bounds size). Returns the stored file name."""
    if len(data) > MAX_BYTES:
        raise ValueError("immagine troppo grande (max 15 MB)")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except (UnidentifiedImageError, OSError):
        raise ValueError("il file non è un'immagine valida")
    im = im.convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    name = f"{uuid.uuid4().hex}.jpg"
    im.save(media_dir / name, "JPEG", quality=85, optimize=True)
    return name
