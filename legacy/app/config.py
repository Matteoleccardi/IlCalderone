import os
import secrets
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MODULES = ("recipes", "collections", "meallog")
PROJECT_DIR = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    data_dir: Path
    database_url: str
    secret_key: str
    allow_signup: bool = True
    https_only: bool = False
    modules: tuple[str, ...] = DEFAULT_MODULES

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"


def _flag(name: str, default: str) -> bool:
    return os.environ.get(name, default).strip().lower() not in ("0", "false", "no", "off", "")


def load_settings(data_dir: str | Path | None = None) -> Settings:
    """Settings from CALDERONE_* environment variables; everything persistent lives in data_dir."""
    d = Path(data_dir or os.environ.get("CALDERONE_DATA_DIR") or PROJECT_DIR / "data")
    (d / "media").mkdir(parents=True, exist_ok=True)
    key = os.environ.get("CALDERONE_SECRET_KEY")
    if not key:
        kf = d / "secret_key"
        if not kf.exists():
            kf.write_text(secrets.token_urlsafe(48))
            kf.chmod(0o600)
        key = kf.read_text().strip()
    mods = os.environ.get("CALDERONE_MODULES", ",".join(DEFAULT_MODULES))
    return Settings(
        data_dir=d,
        database_url=os.environ.get("CALDERONE_DATABASE_URL", f"sqlite:///{d / 'calderone.db'}"),
        secret_key=key,
        allow_signup=_flag("CALDERONE_ALLOW_SIGNUP", "1"),
        https_only=_flag("CALDERONE_HTTPS_ONLY", "0"),
        modules=tuple(m.strip() for m in mods.split(",") if m.strip()),
    )
