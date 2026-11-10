"""Generated demo attachments (no image libraries or binary files in the repo)."""

import struct
import zlib


def _png(width: int, height: int, pixel) -> bytes:
    """Encode an RGB image as PNG; `pixel(x, y)` returns an (r, g, b) tuple."""
    rows = b"".join(
        b"\x00" + bytes(c for x in range(width) for c in pixel(x, y)) for y in range(height)
    )

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


def _mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def mountain_photo(width: int = 480, height: int = 320) -> bytes:
    """A flat-style mountain landscape: sky gradient, sun, two ridges, a lake."""
    sky_top, sky_bottom = (120, 170, 235), (250, 210, 180)
    far, near, lake = (110, 125, 170), (60, 90, 80), (90, 140, 190)

    def ridge(x, peaks):
        # Height of a ridge made of straight slopes between peaks.
        return min(abs(x - px) * slope + py for px, py, slope in peaks)

    far_peaks = [(120, 90, 0.9), (300, 70, 0.8), (450, 110, 1.0)]
    near_peaks = [(40, 170, 1.1), (220, 140, 0.9), (400, 175, 1.2)]

    def pixel(x, y):
        if y > height * 0.78:  # lake with a soft vertical gradient
            return _mix(lake, (200, 220, 240), (y - height * 0.78) / (height * 0.22) * 0.4)
        if y > ridge(x, near_peaks):
            return near
        if y > ridge(x, far_peaks):
            return far
        if (x - 360) ** 2 + (y - 80) ** 2 < 26**2:  # sun
            return (255, 236, 170)
        return _mix(sky_top, sky_bottom, y / (height * 0.78))

    return _png(width, height, pixel)


PACKING_LIST = """Weekend hike packing list
=========================
- 2L water + electrolytes
- Trail snacks (Bob's on chocolate duty)
- Rain jacket
- First-aid kit
- Headlamp
- Sunscreen + hat
- Phone charged, offline map downloaded
""".encode()
