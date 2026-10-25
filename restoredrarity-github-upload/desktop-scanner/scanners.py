"""Scanner backends.

WiaScanner  - Windows Image Acquisition (works with the Canon CanoScan LiDE 400
              once Canon's driver is installed).
MockScanner - reads a saved "scanner bed" image instead of real hardware, for
              testing the app without a scanner.

Both expose: scan(dpi, region_in=None, side=None) -> (BGR numpy image, actual_dpi)
region_in is (x, y, w, h) in inches measured from the top-left of the glass.
"""

import os
import tempfile

import cv2
import numpy as np


class ScannerError(Exception):
    pass


# ---------------------------------------------------------------- WIA ----

WIA_DEVICE_TYPE_SCANNER = 1
WIA_FORMAT_PNG = "{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}"
WIA_FORMAT_BMP = "{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}"

WIA_IPA_DEPTH = 4104
WIA_IPS_CUR_INTENT = 6146
WIA_IPS_XRES = 6147
WIA_IPS_YRES = 6148
WIA_IPS_XPOS = 6149
WIA_IPS_YPOS = 6150
WIA_IPS_XEXTENT = 6151
WIA_IPS_YEXTENT = 6152
WIA_INTENT_IMAGE_TYPE_COLOR = 1

WIA_PROP_RANGE = 1
WIA_PROP_LIST = 2


def _find_prop(props, pid):
    for p in props:
        if p.PropertyID == pid:
            return p
    return None


def _set_prop(props, pid, value, required=True):
    p = _find_prop(props, pid)
    if p is None:
        if required:
            raise ScannerError(f"Scanner does not expose WIA property {pid}")
        return False
    try:
        p.Value = value
        return True
    except Exception as exc:  # driver rejected the value
        if required:
            raise ScannerError(f"Scanner rejected value {value} for property {pid}: {exc}")
        return False


def _closest_supported(prop, wanted):
    """Largest supported value <= wanted (or the smallest supported one)."""
    try:
        if prop.SubType == WIA_PROP_LIST:
            values = sorted(int(v) for v in prop.SubTypeValues)
            below = [v for v in values if v <= wanted]
            return below[-1] if below else values[0]
        if prop.SubType == WIA_PROP_RANGE:
            return int(max(prop.SubTypeMin, min(prop.SubTypeMax, wanted)))
    except Exception:
        pass
    return int(wanted)


class WiaScanner:
    def __init__(self, device_hint="LiDE"):
        if os.name != "nt":
            raise ScannerError("The WIA scanner backend only runs on Windows.")
        self.device_hint = (device_hint or "").lower()

    def _connect(self):
        import win32com.client

        dm = win32com.client.Dispatch("WIA.DeviceManager")
        scanners = []
        for i in range(1, dm.DeviceInfos.Count + 1):
            info = dm.DeviceInfos.Item(i)
            if info.Type != WIA_DEVICE_TYPE_SCANNER:
                continue
            name = ""
            for p in info.Properties:
                if p.Name == "Name":
                    name = str(p.Value)
            scanners.append((name, info))
        if not scanners:
            raise ScannerError(
                "No scanner found. Check the USB cable and that Canon's LiDE 400 driver is installed."
            )
        chosen = scanners[0]
        for name, info in scanners:
            if self.device_hint and self.device_hint in name.lower():
                chosen = (name, info)
                break
        device = chosen[1].Connect()
        return chosen[0], device.Items.Item(1)

    def device_name(self):
        import pythoncom

        pythoncom.CoInitialize()
        try:
            return self._connect()[0]
        finally:
            pythoncom.CoUninitialize()

    def scan(self, dpi, region_in=None, side=None):
        import pythoncom

        pythoncom.CoInitialize()
        try:
            _, item = self._connect()
            props = item.Properties

            _set_prop(props, WIA_IPS_CUR_INTENT, WIA_INTENT_IMAGE_TYPE_COLOR, required=False)
            _set_prop(props, WIA_IPA_DEPTH, 24, required=False)

            actual = _closest_supported(_find_prop(props, WIA_IPS_XRES), dpi)
            _set_prop(props, WIA_IPS_XRES, actual)
            _set_prop(props, WIA_IPS_YRES, actual)

            xext = _find_prop(props, WIA_IPS_XEXTENT)
            yext = _find_prop(props, WIA_IPS_YEXTENT)
            max_w = int(xext.SubTypeMax)
            max_h = int(yext.SubTypeMax)

            if region_in:
                x, y, w, h = region_in
                px = max(0, min(int(round(x * actual)), max_w - 1))
                py = max(0, min(int(round(y * actual)), max_h - 1))
                pw = max(1, min(int(round(w * actual)), max_w - px))
                ph = max(1, min(int(round(h * actual)), max_h - py))
            else:
                px, py, pw, ph = 0, 0, max_w, max_h

            # Reset position first so the new extent is always valid, then move.
            _set_prop(props, WIA_IPS_XPOS, 0)
            _set_prop(props, WIA_IPS_YPOS, 0)
            _set_prop(props, WIA_IPS_XEXTENT, pw)
            _set_prop(props, WIA_IPS_YEXTENT, ph)
            _set_prop(props, WIA_IPS_XPOS, px)
            _set_prop(props, WIA_IPS_YPOS, py)

            try:
                image_file = item.Transfer(WIA_FORMAT_PNG)
            except Exception:
                image_file = item.Transfer(WIA_FORMAT_BMP)

            ext = str(image_file.FileExtension or "bmp").strip(".")
            fd, tmp = tempfile.mkstemp(suffix="." + ext)
            os.close(fd)
            os.remove(tmp)  # SaveFile refuses to overwrite
            try:
                image_file.SaveFile(tmp)
                img = cv2.imread(tmp, cv2.IMREAD_COLOR)
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
            if img is None:
                raise ScannerError("Scanner returned an image that could not be read.")
            return img, actual
        except ScannerError:
            raise
        except Exception as exc:
            raise ScannerError(f"Scan failed: {exc}") from exc
        finally:
            pythoncom.CoUninitialize()


# --------------------------------------------------------------- Mock ----

class MockScanner:
    """Pretends to be a scanner using bed images saved on disk.

    front_path / back_path: images of the whole glass taken at bed_dpi.
    """

    def __init__(self, front_path, back_path=None, bed_dpi=600):
        self.paths = {"front": front_path, "back": back_path or front_path}
        self.bed_dpi = bed_dpi
        self._cache = {}

    def device_name(self):
        return "Mock scanner"

    def _bed(self, side):
        path = self.paths.get(side or "front") or self.paths["front"]
        if not path or not os.path.exists(path):
            raise ScannerError(f"Mock scanner image not found: {path}")
        if path not in self._cache:
            img = cv2.imread(path, cv2.IMREAD_COLOR)
            if img is None:
                raise ScannerError(f"Could not read mock image: {path}")
            self._cache[path] = img
        return self._cache[path]

    def scan(self, dpi, region_in=None, side=None):
        bed = self._bed(side)
        H, W = bed.shape[:2]
        if region_in:
            x, y, w, h = region_in
            x0 = max(0, int(round(x * self.bed_dpi)))
            y0 = max(0, int(round(y * self.bed_dpi)))
            x1 = min(W, int(round((x + w) * self.bed_dpi)))
            y1 = min(H, int(round((y + h) * self.bed_dpi)))
            crop = bed[y0:y1, x0:x1]
        else:
            crop = bed
        scale = dpi / self.bed_dpi
        if abs(scale - 1) > 1e-6:
            interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
            crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=interp)
        return np.ascontiguousarray(crop), dpi


def make_scanner(config):
    kind = config.get("scanner", "wia")
    if kind == "mock":
        return MockScanner(config.get("mock_front"), config.get("mock_back"), config.get("mock_dpi", 600))
    return WiaScanner(config.get("device_hint", "LiDE"))
