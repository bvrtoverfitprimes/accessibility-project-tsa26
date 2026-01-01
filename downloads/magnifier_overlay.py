

# ------------OLD------------

import sys
import time
import tkinter as tk

from PIL import Image, ImageGrab, ImageTk

try:
    import pyautogui
except Exception as e:
    print("Missing dependency pyautogui. Run: pip install -r requirements.txt")
    raise

CAPTURE_SIZE = 160 
WINDOW_SIZE = 220 
OFFSET_X = 28      
OFFSET_Y = 28     
FPS = 30


class MagnifierApp:
    def __init__(self):
        self.zoom = 2.0

        self.root = tk.Tk()
        self.root.title("Magnifier (Demo)")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg="black")

        try:
            self.root.attributes("-alpha", 0.95)
        except Exception:
            pass

        self.canvas = tk.Canvas(self.root, width=WINDOW_SIZE, height=WINDOW_SIZE, highlightthickness=0, bg="black")
        self.canvas.pack()

        self._tk_img = None
        self._last_frame_time = 0.0

        self.root.bind_all("<Escape>", lambda _e: self.quit())
        self.root.bind_all("<Key-plus>", lambda _e: self.adjust_zoom(0.25))
        self.root.bind_all("<Key-equal>", lambda _e: self.adjust_zoom(0.25))
        self.root.bind_all("<Key-minus>", lambda _e: self.adjust_zoom(-0.25))

        self.tick()

    def adjust_zoom(self, delta: float):
        self.zoom = max(1.0, min(6.0, self.zoom + delta))

    def quit(self):
        try:
            self.root.destroy()
        except Exception:
            pass
        sys.exit(0)

    def tick(self):
        now = time.time()
        min_dt = 1.0 / FPS
        if now - self._last_frame_time >= min_dt:
            self._last_frame_time = now
            self.render_frame()

        self.root.after(1, self.tick)

    def render_frame(self):
        x, y = pyautogui.position()

        half = CAPTURE_SIZE // 2
        left = x - half
        top = y - half
        right = x + half
        bottom = y + half

        sw, sh = pyautogui.size()
        left = max(0, min(left, sw - 1))
        top = max(0, min(top, sh - 1))
        right = max(left + 1, min(right, sw))
        bottom = max(top + 1, min(bottom, sh))

        try:
            img = ImageGrab.grab(bbox=(left, top, right, bottom))
        except Exception:
            return

        target = int(WINDOW_SIZE)
        zoomed = img.resize((target, target), resample=Image.Resampling.NEAREST)

        cx = target // 2
        cy = target // 2
        pixels = zoomed.load()
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                px = max(0, min(target - 1, cx + dx))
                py = max(0, min(target - 1, cy + dy))
                pixels[px, py] = (122, 162, 255)

        self._tk_img = ImageTk.PhotoImage(zoomed)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor="nw", image=self._tk_img)

        wx = x + OFFSET_X
        wy = y + OFFSET_Y

        wx = max(0, min(wx, sw - WINDOW_SIZE))
        wy = max(0, min(wy, sh - WINDOW_SIZE))

        self.root.geometry(f"{WINDOW_SIZE}x{WINDOW_SIZE}+{wx}+{wy}")


if __name__ == "__main__":
    MagnifierApp().root.mainloop()
