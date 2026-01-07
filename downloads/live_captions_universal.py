import sys
import threading
import time
import queue
from collections import deque

import subprocess
import importlib


def _ensure_packages(packages):
    missing = []
    for pkg, mod in packages:
        try:
            importlib.import_module(mod)
        except Exception:
            missing.append(pkg)
    if missing:
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])


_ensure_packages([
    ("numpy", "numpy"),
    ("scipy", "scipy"),
    ("faster-whisper", "faster_whisper"),
])

import numpy as np
from scipy import signal

if sys.platform == "win32":
    sys.coinit_flags = 0

import tkinter as tk
from tkinter import scrolledtext

try:
    import pyaudiowpatch as pyaudio
except Exception:
    try:
        import pyaudio
    except Exception:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "PyAudio"])
            import pyaudio
        except Exception:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "sounddevice"])
            raise

from faster_whisper import WhisperModel

MODEL_SIZE = "tiny.en"
SAMPLE_RATE = 16000
CHUNK_SIZE = 1024
PROCESS_INTERVAL = 1.5
SILENCE_THRESHOLD = 0.01

BG_VOID = "#050505"
BORDER_HAIRLINE = "#1A1A1A"
TEXT_STARK = "#FFFFFF"
TEXT_DIM = "#888888"
TEXT_DEEP = "#444444"
ACCENT_RED = "#FF0000"
LETTER_SPACING = 3


class AudioCapture:
    def __init__(self):
        self.p = pyaudio.PyAudio()
        self.stream = None
        self.running = False
        self.queue = queue.Queue()
        self.device_info = None

    def start(self):
        try:
            wasapi_info = self.p.get_host_api_info_by_type(pyaudio.paWASAPI)
            default_speakers = self.p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
            if not default_speakers["isLoopbackDevice"]:
                for loopback in self.p.get_loopback_device_info_generator():
                    if default_speakers["name"] in loopback["name"]:
                        default_speakers = loopback
                        break
            self.device_info = default_speakers
            self.stream = self.p.open(
                format=pyaudio.paInt16,
                channels=self.device_info["maxInputChannels"],
                rate=int(self.device_info["defaultSampleRate"]),
                input=True,
                frames_per_buffer=CHUNK_SIZE,
                input_device_index=self.device_info["index"],
                stream_callback=self._callback
            )
            self.running = True
            self.stream.start_stream()
            return True
        except Exception:
            return False

    def _callback(self, in_data, frame_count, time_info, status):
        self.queue.put(in_data)
        return (in_data, pyaudio.paContinue)

    def read_buffer(self):
        data = []
        while not self.queue.empty():
            data.append(self.queue.get())
        return b"".join(data) if data else None

    def stop(self):
        self.running = False
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        self.p.terminate()


class LiveTranscriber:
    def __init__(self):
        self.model = WhisperModel(MODEL_SIZE, device="auto", compute_type="int8")

    def process(self, raw_bytes, orig_rate, channels):
        if not raw_bytes:
            return None
        audio_np = np.frombuffer(raw_bytes, dtype=np.int16)
        try:
            audio_np = audio_np.reshape(-1, channels).mean(axis=1)
        except:
            return None
        audio_np = audio_np.astype(np.float32) / 32768.0
        if orig_rate != SAMPLE_RATE:
            samples = int(len(audio_np) * SAMPLE_RATE / orig_rate)
            audio_np = signal.resample(audio_np, samples)
        return audio_np if np.max(np.abs(audio_np)) >= SILENCE_THRESHOLD else None

    def transcribe(self, audio_np):
        try:
            segments, _ = self.model.transcribe(audio_np, beam_size=1, language="en")
            return " ".join([s.text for s in segments]).strip()
        except:
            return None


class App:
    def __init__(self, root):
        self.root = root
        self.root.overrideredirect(True)
        self.root.geometry("800x250")
        self.root.configure(bg=BG_VOID)
        self.root.attributes("-topmost", True)

        self.root.config(highlightthickness=1, highlightbackground=BORDER_HAIRLINE)

        self.title_bar = tk.Frame(self.root, bg=BG_VOID, height=40)
        self.title_bar.pack(fill="x", padx=20)
        self.title_bar.bind("<Button-1>", self.start_move)
        self.title_bar.bind("<B1-Motion>", self.do_move)

        self.controls = tk.Frame(self.title_bar, bg=BG_VOID)
        self.controls.pack(side="right", pady=(10, 0))

        self.header_lbl = tk.Label(
            self.title_bar,
            text="L I V E    C A P T I O N S",
            bg=BG_VOID,
            fg=TEXT_STARK,
            font=("Segoe UI Light", 10)
        )
        self.header_lbl.pack(side="left", pady=(15, 0))
        self.header_lbl.bind("<Button-1>", self.start_move)
        self.header_lbl.bind("<B1-Motion>", self.do_move)

        self.close_btn = tk.Label(
            self.controls,
            text="×",
            bg=BG_VOID,
            fg=TEXT_DIM,
            font=("Arial", 18),
            cursor="hand2"
        )
        self.close_btn.pack(side="left", padx=(0, 10))
        self.close_btn.bind("<Enter>", lambda e: self.close_btn.config(fg=ACCENT_RED))
        self.close_btn.bind("<Leave>", lambda e: self.close_btn.config(fg=TEXT_DIM))

        self.move_btn = tk.Label(
            self.controls,
            text="↕",
            bg=BG_VOID,
            fg=TEXT_DIM,
            font=("Arial", 16),
            cursor="fleur"
        )
        self.move_btn.pack(side="left")
        self.move_btn.bind("<Enter>", lambda e: self.move_btn.config(fg=TEXT_STARK))
        self.move_btn.bind("<Leave>", lambda e: self.move_btn.config(fg=TEXT_DIM))

        self.close_btn.bind("<Button-1>", self._on_close)
        self.move_btn.bind("<Button-1>", self.start_move)
        self.move_btn.bind("<B1-Motion>", self.do_move)

        self.display = scrolledtext.ScrolledText(
            self.root,
            bg=BG_VOID,
            fg=TEXT_STARK,
            font=("Segoe UI Light", 15),
            wrap="word",
            borderwidth=0,
            highlightthickness=0,
            padx=20,
            pady=20
        )
        self.display.pack(fill="both", expand=True)

        self.audio = AudioCapture()
        self.transcriber = LiveTranscriber()
        self.running = True

        if self.audio.start():
            threading.Thread(target=self.work_loop, daemon=True).start()

    def work_loop(self):
        while self.running:
            time.sleep(PROCESS_INTERVAL)
            raw_bytes = self.audio.read_buffer()
            if not raw_bytes:
                continue

            rate = int(self.audio.device_info["defaultSampleRate"])
            channels = self.audio.device_info["maxInputChannels"]
            clean_audio = self.transcriber.process(raw_bytes, rate, channels)

            if clean_audio is not None:
                text = self.transcriber.transcribe(clean_audio)
                if text:
                    self.update_ui(text.upper())

    def update_ui(self, text):
        self.display.insert("end", text + "  ")
        self.display.see("end")

    def start_move(self, event):
        self._drag_start_x = event.x_root
        self._drag_start_y = event.y_root
        self._win_start_x = self.root.winfo_x()
        self._win_start_y = self.root.winfo_y()

    def do_move(self, event):
        x = self._win_start_x + (event.x_root - self._drag_start_x)
        y = self._win_start_y + (event.y_root - self._drag_start_y)
        self.root.geometry(f"+{x}+{y}")

    def _on_close(self, _event):
        self.quit()
        return "break"

    def quit(self):
        self.running = False
        self.audio.stop()
        self.root.destroy()


root = tk.Tk()
app = App(root)
root.mainloop()
