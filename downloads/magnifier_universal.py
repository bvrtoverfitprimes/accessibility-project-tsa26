import sys
import subprocess
import importlib
import platform
import time

REQUIRED = [
    ("PySide6", "PySide6"),
    ("numpy", "numpy"),
    ("mss", "mss"),
    ("Pillow", "PIL"),
]

def ensure_dependencies():
    missing = []
    for pkg, mod in REQUIRED:
        try:
            importlib.import_module(mod)
        except ImportError:
            missing.append(pkg)
    if missing:
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])

ensure_dependencies()

from mss import mss
from PIL import Image, ImageOps, ImageEnhance
from PySide6 import QtCore, QtGui, QtWidgets

_WDA_EXCLUDEFROMCAPTURE = 0x00000011

def _set_window_exclude_from_capture(hwnd, enable=True):
    if platform.system() != "Windows":
        return False
    try:
        import ctypes
        user32 = ctypes.windll.user32
        affinity = _WDA_EXCLUDEFROMCAPTURE if enable else 0x0
        res = user32.SetWindowDisplayAffinity(ctypes.c_void_p(hwnd), ctypes.c_uint(affinity))
        return bool(res)
    except Exception:
        return False

class ScreenSampler:
    def __init__(self):
        self.sct = mss()
        self.mon = self.sct.monitors[1] if len(self.sct.monitors) > 1 else self.sct.monitors[0]
        self.screen_width = self.mon["width"]
        self.screen_height = self.mon["height"]

    def grab_full(self):
        shot = self.sct.grab({"left": 0, "top": 0, "width": self.screen_width, "height": self.screen_height})
        img = Image.frombuffer("RGBA", shot.size, shot.bgra, "raw", "BGRA", 0, 1)
        return img.convert("RGB")

class DraggableMenu(QtWidgets.QWidget):
    def __init__(self, parent_overlay):
        super().__init__()
        self.parent_overlay = parent_overlay
        self._dragging = False
        self._offset = QtCore.QPoint()

    def start_drag(self, event):
        if event.button() == QtCore.Qt.LeftButton:
            self._dragging = True
            self._offset = event.globalPosition().toPoint() - self.pos()
            event.accept()

    def mouseMoveEvent(self, event):
        if self._dragging:
            self.move(event.globalPosition().toPoint() - self._offset)
            event.accept()

    def mouseReleaseEvent(self, event):
        self._dragging = False
        event.accept()

class OverlayWindow(QtWidgets.QWidget):
    def __init__(self, sampler, background_snapshot=None):
        super().__init__()
        self.setWindowFlags(QtCore.Qt.WindowStaysOnTopHint | QtCore.Qt.FramelessWindowHint | QtCore.Qt.Tool)
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground, True)
        self.setMouseTracking(True)

        self.sampler = sampler
        self.mode = 'lens'
        
        self.lens_diameter = 300
        self.lens_zoom = 2.0
        self.bar_height = 180
        self.bar_zoom = 1.8
        
        self.mouse_pos = QtGui.QCursor.pos()
        self.base_frame = None
        self.over_menu = False
        
        self.menu = self.build_menu()
        
        try:
            hwnd_self = int(self.winId())
            hwnd_menu = int(self.menu.winId())
            _set_window_exclude_from_capture(hwnd_self, True)
            _set_window_exclude_from_capture(hwnd_menu, True)
        except: pass
        
        self.draw_timer = QtCore.QTimer(self)
        self.draw_timer.timeout.connect(self.on_draw_tick)
        self.draw_timer.start(30)
        
        self.resize(self.sampler.screen_width, self.sampler.screen_height)
        self.move(0, 0)

    def build_menu(self):
        win = DraggableMenu(self)
        win.setWindowTitle("MAGNIFIER")
        win.setWindowFlags(QtCore.Qt.WindowStaysOnTopHint | QtCore.Qt.Tool | QtCore.Qt.FramelessWindowHint)
        
        style = """
        QWidget {
            background-color: #050505;
            color: #FFFFFF;
            font-family: 'Segoe UI Light', sans-serif;
            border: 1px solid #1A1A1A;
        }
        QLabel { border: none; letter-spacing: 3px; text-transform: uppercase; }
        QGroupBox {
            border: 1px solid #1A1A1A;
            margin-top: 15px;
            padding-top: 10px;
            font-size: 10px;
            color: #666666;
        }
        QPushButton#moveBtn { background-color: transparent; border: none; color: #444; font-size: 16px; }
        QPushButton#moveBtn:hover { color: #FFFFFF; }
        QPushButton#closeBtn { background-color: transparent; border: none; color: #444; font-size: 18px; }
        QPushButton#closeBtn:hover { color: #FF0000; }
        
        QPushButton.modeBtn {
            background-color: #0A0A0A;
            border: 1px solid #222222;
            color: #888888;
            padding: 10px;
            font-size: 11px;
        }
        QSlider::groove:horizontal { border: 1px solid #111; height: 2px; background: #111; }
        QSlider::handle:horizontal { background: #FFFFFF; width: 4px; height: 10px; margin: -4px 0; }
        """
        win.setStyleSheet(style)
        
        layout = QtWidgets.QVBoxLayout(win)
        layout.setContentsMargins(20, 10, 20, 30)

        top_bar = QtWidgets.QHBoxLayout()
        move_btn = QtWidgets.QPushButton("⠿")
        move_btn.setObjectName("moveBtn")
        move_btn.setFixedSize(30, 30)
        move_btn.setCursor(QtCore.Qt.SizeAllCursor)
        move_btn.mousePressEvent = win.start_drag
        
        close_btn = QtWidgets.QPushButton("×")
        close_btn.setObjectName("closeBtn")
        close_btn.setFixedSize(30, 30)
        close_btn.clicked.connect(QtWidgets.QApplication.instance().quit)
        
        top_bar.addWidget(move_btn)
        top_bar.addStretch()
        top_bar.addWidget(close_btn)
        layout.addLayout(top_bar)

        header = QtWidgets.QLabel("MAGNIFIER")
        header.setStyleSheet("font-size: 28px; font-weight: 100; margin-bottom: 5px;")
        header.setAlignment(QtCore.Qt.AlignCenter)
        layout.addWidget(header)

        sub_header = QtWidgets.QLabel("ACCESSIBILITY INTERFACE")
        sub_header.setStyleSheet("font-size: 8px; color: #444; margin-bottom: 20px;")
        sub_header.setAlignment(QtCore.Qt.AlignCenter)
        layout.addWidget(sub_header)

        mode_box = QtWidgets.QHBoxLayout()
        self.btn_lens = QtWidgets.QPushButton("LENS")
        self.btn_bar = QtWidgets.QPushButton("BAR")
        self.btn_off = QtWidgets.QPushButton("TURN OFF")
        
        self.buttons = {'lens': self.btn_lens, 'bar': self.btn_bar, 'off': self.btn_off}

        for key, btn in self.buttons.items():
            btn.setProperty("class", "modeBtn")
            btn.clicked.connect(lambda checked=False, k=key: self.set_mode(k))
            mode_box.addWidget(btn)

        layout.addLayout(mode_box)
        self.update_button_highlight()

        def add_slider(parent_layout, label_text, min_v, max_v, curr, callback, is_float=False):
            container = QtWidgets.QVBoxLayout()
            lbl = QtWidgets.QLabel(label_text)
            lbl.setStyleSheet("font-size: 9px; color: #666; margin-top: 10px;")
            sld = QtWidgets.QSlider(QtCore.Qt.Horizontal)
            if is_float:
                sld.setRange(int(min_v*10), int(max_v*10))
                sld.setValue(int(curr*10))
                sld.valueChanged.connect(lambda v: callback(v/10.0))
            else:
                sld.setRange(min_v, max_v)
                sld.setValue(curr)
                sld.valueChanged.connect(callback)
            container.addWidget(lbl)
            container.addWidget(sld)
            parent_layout.addLayout(container)

        config_grp = QtWidgets.QGroupBox("Optics Configuration")
        config_l = QtWidgets.QVBoxLayout(config_grp)
        add_slider(config_l, "MAGNIFICATION FACTOR", 1.2, 5.0, self.lens_zoom, lambda v: self.set_param('zoom', v), True)
        add_slider(config_l, "APERTURE SIZE", 100, 600, self.lens_diameter, lambda v: self.set_param('size', v))
        layout.addWidget(config_grp)

        win.resize(360, 480)
        return win

    def set_param(self, name, val):
        if name == 'zoom':
            self.lens_zoom = val
            self.bar_zoom = val
        else:
            self.lens_diameter = val
            self.bar_height = val
        self.update()

    def set_mode(self, mode):
        self.mode = mode
        self.update_button_highlight()
        self.update()

    def update_button_highlight(self):
        for key, btn in self.buttons.items():
            if self.mode == key:
                btn.setStyleSheet("border-color: #FFFFFF; color: #FFFFFF; background-color: #111;")
            else:
                btn.setStyleSheet("border-color: #222222; color: #888888; background-color: #0A0A0A;")

    def on_draw_tick(self):
        self.mouse_pos = QtGui.QCursor.pos()
        if self.menu.isVisible():
            mgeo = self.menu.geometry()
            self.over_menu = mgeo.contains(self.mouse_pos)
        
        if self.over_menu or self.mode == 'off':
            self.setAttribute(QtCore.Qt.WA_TransparentForMouseEvents, False)
            self.setWindowFlags(self.windowFlags() & ~QtCore.Qt.WindowTransparentForInput)
        else:
            self.setAttribute(QtCore.Qt.WA_TransparentForMouseEvents, True)
            self.setWindowFlags(self.windowFlags() | QtCore.Qt.WindowTransparentForInput)
        
        if not self.over_menu and self.mode != 'off':
            self.base_frame = self.sampler.grab_full()
            
        self.show()
        self.update()

    def paintEvent(self, event):
        if self.mode == 'off' or not self.base_frame or self.over_menu: return
        painter = QtGui.QPainter(self)
        painter.setRenderHint(QtGui.QPainter.Antialiasing)
        
        cx, cy = self.mouse_pos.x(), self.mouse_pos.y()
        
        if self.mode == 'lens':
            d = self.lens_diameter
            r = d // 2
            src_s = int(d / self.lens_zoom)
            left, top = cx - src_s // 2, cy - src_s // 2
            crop = self.base_frame.crop((left, top, left + src_s, top + src_s)).resize((d, d), Image.LANCZOS)
            qimg = QtGui.QImage(crop.tobytes("raw", "RGB"), d, d, d*3, QtGui.QImage.Format_RGB888)
            path = QtGui.QPainterPath()
            path.addEllipse(cx-r, cy-r, d, d) 
            painter.setClipPath(path)
            painter.drawImage(cx-r, cy-r, qimg)
            painter.setClipping(False)
            painter.setPen(QtGui.QPen(QtGui.QColor(255,255,255,40), 1))
            painter.drawEllipse(cx-r, cy-r, d, d)

        elif self.mode == 'bar':
            w_screen = self.sampler.screen_width
            h_bar = self.bar_height
            
            src_w = int(w_screen / self.bar_zoom)
            src_h = int(h_bar / self.bar_zoom)
            
            left = cx - (cx / self.bar_zoom)
            top = cy - (h_bar / 2 / self.bar_zoom)
            
            crop = self.base_frame.crop((left, top, left + src_w, top + src_h)).resize((w_screen, h_bar), Image.LANCZOS)
            qimg = QtGui.QImage(crop.tobytes("raw", "RGB"), w_screen, h_bar, w_screen*3, QtGui.QImage.Format_RGB888)
            
            painter.drawImage(0, cy-h_bar//2, qimg)
            painter.setPen(QtGui.QPen(QtGui.QColor(255,255,255,60), 1))
            painter.drawLine(0, cy-h_bar//2, w_screen, cy-h_bar//2)
            painter.drawLine(0, cy+h_bar//2, w_screen, cy+h_bar//2)

app = QtWidgets.QApplication(sys.argv)
sampler = ScreenSampler()
overlay = OverlayWindow(sampler, sampler.grab_full())
overlay.show()
overlay.menu.show()
screen_geo = QtGui.QGuiApplication.primaryScreen().geometry()
overlay.menu.move(screen_geo.width() - 400, screen_geo.height() - 600)
sys.exit(app.exec())
