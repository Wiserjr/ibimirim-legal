"""Assemble the distributable copies in dist/.

The ZIP is the contents of public/ at the archive root, so unzipping gives a
folder whose index.html opens by double-click. The APK is copied from the
Gradle output under the released name. Both are checksummed, because these are
the files handed to other people.

Superseded builds are moved to dist/anteriores/ rather than deleted: an older
APK cannot be rebuilt from the current tree, and a stale copy sitting next to
the current one is how the wrong version gets installed.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
ARCHIVE = DIST / "anteriores"
MUNICIPIOS = ROOT / "municipios"
APK = ROOT / "android/app/build/outputs/apk/debug/app-debug.apk"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def retire(keep: set[str], marca: str) -> list[str]:
    moved = []
    for item in DIST.iterdir():
        if item.is_dir() or item.name in keep or not item.name.startswith(marca):
            continue
        ARCHIVE.mkdir(parents=True, exist_ok=True)
        shutil.move(str(item), str(ARCHIVE / item.name))
        moved.append(item.name)
    return moved


def main() -> None:
    import sys

    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    slugs = sorted(p.name for p in MUNICIPIOS.iterdir() if p.is_dir())
    slug = sys.argv[1] if len(sys.argv) > 1 else "ibimirim"
    if slug not in slugs:
        raise SystemExit(f"informe um município: {', '.join(slugs)}")
    cfg = json.loads((MUNICIPIOS / slug / "municipio.json").read_text(encoding="utf-8"))
    marca = cfg["marca"]["titulo"].replace(" ", "-")
    zip_name = f"{marca}-PC-iPhone-v{version}.zip"
    apk_name = f"{marca}-Android-v{version}-debug.apk"
    origem = DIST / slug
    if not origem.exists():
        raise SystemExit(f"rode primeiro: python tools/build.py {slug}")
    DIST.mkdir(exist_ok=True)

    for name in retire({zip_name, apk_name}, marca):
        print(f"  arquivado em dist/anteriores/: {name}")

    files = sorted(p for p in origem.rglob("*") if p.is_file())
    with zipfile.ZipFile(DIST / zip_name, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in files:
            bundle.write(path, path.relative_to(origem).as_posix())
    print(f"{zip_name}: {len(files)} arquivos, {(DIST / zip_name).stat().st_size:,} bytes")
    print(f"  SHA-256 {digest(DIST / zip_name)}")

    if not APK.exists():
        print("APK ausente — rode ./gradlew assembleDebug em android/")
        return
    shutil.copy2(APK, DIST / apk_name)
    print(f"{apk_name}: {(DIST / apk_name).stat().st_size:,} bytes")
    print(f"  SHA-256 {digest(DIST / apk_name)}")


if __name__ == "__main__":
    main()
