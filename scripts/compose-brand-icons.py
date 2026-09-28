"""Place the vector logo into every raster icon slot."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "public" / "_master"
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android" / "app" / "src" / "main" / "res"
IOS_PUBLIC = ROOT / "ios" / "App" / "App" / "public"
SPLASH = (247, 250, 249, 255)


def load(name: str) -> Image.Image:
    return Image.open(MASTER / name).convert("RGBA")


def fit(src: Image.Image, size: int) -> Image.Image:
    return src.resize((size, size), Image.Resampling.LANCZOS)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")


def circle_mask(src: Image.Image) -> Image.Image:
    size = src.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(src, mask=mask)
    return out


def splash(width: int, height: int, icon: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (width, height), SPLASH[:3])
    side = max(72, int(min(width, height) * 0.34))
    mark = fit(icon, side)
    canvas.paste(mark, ((width - side) // 2, (height - side) // 2), mark)
    return canvas


def banner(width: int, height: int, icon: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    canvas = Image.new("RGB", (width, height), background)
    side = int(min(width, height) * 0.78)
    mark = fit(icon, side)
    canvas.paste(mark, ((width - side) // 2, (height - side) // 2), mark)
    return canvas


def main() -> None:
    rounded = load("rounded.png")
    bleed = load("bleed.png")

    save_png(fit(bleed, 1024), PUBLIC / "logo.png")
    save_png(fit(bleed, 32), PUBLIC / "favicon.png")
    save_png(fit(bleed, 180), PUBLIC / "apple-touch-icon.png")
    save_png(fit(bleed, 192), PUBLIC / "icon-192.png")
    save_png(fit(bleed, 512), PUBLIC / "icon-512.png")

    ico = fit(bleed, 48)
    ico.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    banner(1024, 556, rounded, (247, 250, 249)).save(PUBLIC / "qapla-brand.jpg", "JPEG", quality=92)
    save_png(banner(1024, 556, rounded, (247, 250, 249)), PUBLIC / "qapla-entry-logo.png")

    densities = {
        "mipmap-mdpi": 1,
        "mipmap-hdpi": 1.5,
        "mipmap-xhdpi": 2,
        "mipmap-xxhdpi": 3,
        "mipmap-xxxhdpi": 4,
    }
    for folder, scale in densities.items():
        base = ANDROID / folder
        save_png(fit(bleed, int(48 * scale)), base / "ic_launcher.png")
        save_png(circle_mask(fit(bleed, int(48 * scale))), base / "ic_launcher_round.png")
        save_png(fit(bleed, int(108 * scale)), base / "ic_launcher_foreground.png")

    for path in ANDROID.rglob("splash.png"):
        current = Image.open(path)
        splash(*current.size, rounded).save(path, "PNG")

    if IOS_PUBLIC.exists():
        for name in (
            "logo.png",
            "logo.svg",
            "qapla-mark-white.svg",
            "favicon.png",
            "favicon.ico",
            "favicon.svg",
            "apple-touch-icon.png",
            "icon-192.png",
            "icon-192.svg",
            "icon-512.png",
            "icon-512.svg",
            "qapla-mark.svg",
            "qapla-brand.jpg",
            "qapla-entry-logo.png",
        ):
            target = IOS_PUBLIC / name
            if target.parent.exists():
                target.write_bytes((PUBLIC / name).read_bytes())

    for leftover in (PUBLIC / "_logo-preview.png", PUBLIC / "_logo-ref-crop.png"):
        leftover.unlink(missing_ok=True)
    if MASTER.exists():
        for child in MASTER.iterdir():
            child.unlink()
        MASTER.rmdir()

    print("Brand icons written")


if __name__ == "__main__":
    main()
