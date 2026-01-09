import sys
import os

if sys.platform == "win32":
    sys.coinit_flags = 0

import subprocess
import threading
import time
import math
import queue
import re
from difflib import SequenceMatcher

def pip_install(packages):
    if not packages:
        return
    subprocess.check_call([sys.executable, "-m", "pip", "install", *packages])

def ensure_packages():
    needs = []
    
    try:
        import comtypes
        if sys.version_info >= (3, 13):
            try:
                version = comtypes.__version__
                major, minor, patch = map(int, version.split('.')[:3])
                if (major, minor, patch) <= (1, 4, 7):
                    needs.append("comtypes>=1.4.8")
            except Exception:
                needs.append("comtypes>=1.4.8")
    except Exception:
        needs.append("comtypes>=1.4.8")
    
    if needs:
        pip_install(needs)
    
    packages_to_check = [
        ("pycaw", "pycaw"),
        ("psutil", "psutil"),
        ("pyaudiowpatch", "PyAudioWPatch"),
        ("numpy", "numpy"),
        ("torch", "torch"),
        ("whisper", "openai-whisper")
    ]
    
    needs = []
    for module_name, package_name in packages_to_check:
        try:
            __import__(module_name)
        except Exception:
            needs.append(package_name)
    
    if needs:
        pip_install(needs)

ensure_packages()

import tkinter as tk
from tkinter import ttk, scrolledtext, font
from pycaw.pycaw import AudioUtilities, IAudioMeterInformation
import psutil
import pyaudiowpatch as pyaudio
import numpy as np
import whisper
import ctypes
from ctypes import windll, byref, c_int

REFRESH_MS = 100
MIN_DB_DISPLAY = -60.0
TRANSCRIBE_THRESHOLD = 0.01
SAMPLE_RATE = 16000
CHUNK_SECONDS = 1.2
MODEL_NAME = "base"
PYAUDIO_CHUNK = 4096
MIN_AUDIO_LENGTH = 0.6
OVERLAP_SECONDS = 0.4

COLORS = {
    "bg_main": "#050505",
    "bg_secondary": "#0A0A0A",
    "border": "#1A1A1A",
    "border_light": "#333333",
    "text_header": "#FFFFFF",
    "text_sub": "#888888",
    "text_dim": "#444444",
    "accent_red": "#FF0000",
    "highlight": "#FFFFFF",
    "transparent_overlay": "#0F0F0F" 
}

def get_sessions_peaks():
    out = []
    sessions = AudioUtilities.GetAllSessions()
    for s in sessions:
        try:
            ctl = s._ctl
            meter = ctl.QueryInterface(IAudioMeterInformation)
            peak = meter.GetPeakValue()
        except Exception:
            peak = 0.0
        pid = None
        pname = "System Sounds"
        if s.Process:
            try:
                pid = s.Process.pid
                pname = psutil.Process(pid).name()
            except Exception:
                pname = getattr(s.Process, "name", "Unknown")
        out.append((pid, pname, float(peak)))
    return out

def linear_to_db(lin):
    if lin <= 1e-12:
        return -999.0
    return 20.0 * math.log10(lin)

def clean_text(text):
    text = text.replace('.', '')
    words = text.split()
    filtered_words = [
        word for word in words
        if len(re.sub(r'[^\w]', '', word)) > 1 or re.sub(r'[^\w]', '', word).upper() in ['I', 'A']
    ]
    text = ' '.join(filtered_words)
    text = ' '.join(text.split())
    text = re.sub(r'\s+([,!?;:])', r'\1', text)
    text = re.sub(r'([,!?;:])\s*([,!?;:])', r'\1', text)
    return text.strip()

def find_best_overlap_position(prev_text, new_text):
    if not prev_text or not new_text:
        return 0
    prev_clean = clean_text(prev_text.lower())
    new_clean = clean_text(new_text.lower())
    search_length = min(50, len(prev_clean))
    prev_end = prev_clean[-search_length:]
    best_match_length = 0
    best_match_pos = 0
    for i in range(len(new_clean)):
        matcher = SequenceMatcher(None, prev_end, new_clean[i:i+search_length])
        match = matcher.find_longest_match(0, len(prev_end), 0, min(search_length, len(new_clean)-i))
        if match.size >= 3 and match.size > best_match_length:
            best_match_length = match.size
            best_match_pos = i + match.size
    if best_match_length >= 3:
        words_to_skip = len(new_clean[:best_match_pos].split())
        original_words = new_text.split()
        if words_to_skip > 0 and words_to_skip <= len(original_words):
            skip_text = ' '.join(original_words[:words_to_skip])
            return len(skip_text) + (1 if words_to_skip < len(original_words) else 0)
    return 0

def smart_merge(prev_text, new_text):
    if not prev_text:
        return clean_text(new_text)
    if not new_text:
        return prev_text
    skip_chars = find_best_overlap_position(prev_text, new_text)
    if skip_chars > 0:
        new_text_trimmed = new_text[skip_chars:].strip()
        merged = prev_text + (' ' + new_text_trimmed if new_text_trimmed else '')
    else:
        merged = prev_text + ' ' + new_text
    return clean_text(merged)

def remove_filler_duplicates(text):
    words = text.split()
    cleaned_words = []
    i = 0
    while i < len(words):
        current = words[i]
        if i + 1 < len(words):
            next_word = words[i + 1]
            current_clean = re.sub(r'[.,!?;:]', '', current).lower()
            next_clean = re.sub(r'[.,!?;:]', '', next_word).lower()
            if current_clean == next_clean and len(current_clean) <= 5:
                cleaned_words.append(next_word if any(p in next_word for p in '.,!?;:') else current)
                i += 2
                continue
        cleaned_words.append(current)
        i += 1
    return ' '.join(cleaned_words)

class Recorder(threading.Thread):
    def __init__(self, samplerate=SAMPLE_RATE, chunk_seconds=CHUNK_SECONDS):
        super().__init__(daemon=True)
        self.sr = samplerate
        self.chunk_seconds = chunk_seconds
        self.min_samples = int(MIN_AUDIO_LENGTH * samplerate)
        self.overlap_samples = int(OVERLAP_SECONDS * samplerate)
        self.buffer = np.zeros((0,), dtype=np.float32)
        self.lock = threading.Lock()
        self._stop = threading.Event()
        self._recording_started = False
        self.p = None
        self.stream = None

    def run(self):
        try:
            self.p = pyaudio.PyAudio()
            try:
                wasapi_info = self.p.get_host_api_info_by_type(pyaudio.paWASAPI)
            except OSError:
                return
            default_speakers = self.p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
            if not default_speakers["isLoopbackDevice"]:
                for loopback in self.p.get_loopback_device_info_generator():
                    if default_speakers["name"] in loopback["name"]:
                        default_speakers = loopback
                        break
                else:
                    return
            self.stream = self.p.open(
                format=pyaudio.paInt16,
                channels=default_speakers["maxInputChannels"],
                rate=int(default_speakers["defaultSampleRate"]),
                frames_per_buffer=PYAUDIO_CHUNK,
                input=True,
                input_device_index=default_speakers["index"]
            )
            self._recording_started = True
            while not self._stop.is_set():
                try:
                    data = self.stream.read(PYAUDIO_CHUNK, exception_on_overflow=False)
                    audio_data = np.frombuffer(data, dtype=np.int16)
                    audio_float = audio_data.astype(np.float32) / 32768.0
                    if default_speakers["maxInputChannels"] > 1:
                        audio_float = audio_float.reshape(-1, default_speakers["maxInputChannels"])
                        audio_float = np.mean(audio_float, axis=1)
                    current_rate = int(default_speakers["defaultSampleRate"])
                    if current_rate != self.sr:
                        num_samples = int(len(audio_float) * self.sr / current_rate)
                        audio_float = np.interp(
                            np.linspace(0, len(audio_float), num_samples),
                            np.arange(len(audio_float)),
                            audio_float
                        ).astype(np.float32)
                    with self.lock:
                        self.buffer = np.concatenate((self.buffer, audio_float))
                except Exception:
                    if not self._stop.is_set():
                        time.sleep(0.01)
        except Exception:
            pass
        finally:
            if self.stream:
                try:
                    self.stream.stop_stream()
                    self.stream.close()
                except Exception:
                    pass
            if self.p:
                try:
                    self.p.terminate()
                except Exception:
                    pass

    def stop(self):
        self._stop.set()

    def is_recording(self):
        return self._recording_started

    def get_chunk_if_ready(self):
        with self.lock:
            if self.buffer.shape[0] >= self.min_samples:
                max_samples = int(self.chunk_seconds * self.sr)
                chunk_size = min(max_samples, self.buffer.shape[0])
                chunk = self.buffer[:chunk_size].copy()
                if self.buffer.shape[0] > self.overlap_samples:
                    self.buffer = self.buffer[chunk_size - self.overlap_samples:].copy()
                else:
                    self.buffer = np.zeros((0,), dtype=np.float32)
                return chunk
        return None

class WhisperTranscriber(threading.Thread):
    def __init__(self, recorder, output_queue, model_name=MODEL_NAME, device=None):
        super().__init__(daemon=True)
        self.recorder = recorder
        self.output_queue = output_queue
        self.model_name = model_name
        self._stop = threading.Event()
        self.model = None
        self.device = device or ("cuda" if self._cuda_available() else "cpu")

    def _cuda_available(self):
        try:
            import torch
            return torch.cuda.is_available()
        except Exception:
            return False

    def load_model(self):
        self.model = whisper.load_model(self.model_name, device=self.device)

    def run(self):
        try:
            self.load_model()
        except Exception:
            return
        chunk_count = 0
        while not self._stop.is_set():
            chunk = self.recorder.get_chunk_if_ready()
            if chunk is None:
                time.sleep(0.05)
                continue
            peak = np.max(np.abs(chunk))
            if peak < 0.001:
                continue
            chunk_count += 1
            try:
                audio = chunk.astype(np.float32)
                result = self.model.transcribe(
                    audio, 
                    language="en",
                    task="transcribe", 
                    fp16=(self.device=="cuda"),
                    condition_on_previous_text=True,
                    beam_size=1,
                    best_of=1,
                    temperature=0.0,
                    compression_ratio_threshold=2.4,
                    logprob_threshold=-1.0,
                    no_speech_threshold=0.6,
                    word_timestamps=False
                )
                text = result.get("text", "").strip()
                if text:
                    self.output_queue.put({'text': text, 'chunk_id': chunk_count})
            except Exception:
                pass

    def stop(self):
        self._stop.set()

class VoidButton(tk.Frame):
    def __init__(self, parent, text, command, destructive=False, width=100):
        super().__init__(parent, bg=COLORS["bg_main"], cursor="hand2")
        self.command = command
        self.destructive = destructive
        
        self.border = tk.Frame(self, bg=COLORS["border"], width=width, height=30)
        self.border.pack_propagate(False)
        self.border.pack()
        
        self.inner = tk.Frame(self.border, bg=COLORS["bg_main"])
        self.inner.pack(fill="both", expand=True, padx=1, pady=1)
        
        fg_color = COLORS["accent_red"] if destructive else COLORS["text_header"]
        
        self.label = tk.Label(
            self.inner, 
            text=text.upper(), 
            bg=COLORS["bg_main"], 
            fg=fg_color,
            font=("Segoe UI Light", 9),
            bd=0
        )
        self.label.pack(expand=True)
        
        self.bind("<Enter>", self.on_enter)
        self.bind("<Leave>", self.on_leave)
        self.bind("<Button-1>", self.on_click)
        self.label.bind("<Button-1>", self.on_click)
        self.border.bind("<Button-1>", self.on_click)
        self.inner.bind("<Button-1>", self.on_click)

    def on_enter(self, e):
        self.border.config(bg=COLORS["highlight"])
        if not self.destructive:
            self.label.config(fg=COLORS["highlight"])

    def on_leave(self, e):
        self.border.config(bg=COLORS["border"])
        if not self.destructive:
            self.label.config(fg=COLORS["text_header"])

    def on_click(self, e):
        if self.command:
            self.command()

class App:
    def __init__(self, root):
        self.root = root
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.geometry("700x520")
        self.root.configure(bg=COLORS["border"])
        self.root.attributes("-alpha", 0.95)
        
        try:
            hwnd = windll.user32.GetParent(self.root.winfo_id())
            style = windll.user32.GetWindowLongW(hwnd, -20) 
            style = style | 0x00080000 | 0x00020000 
            windll.user32.SetWindowLongW(hwnd, -20, style)
            self.root.wm_attributes("-transparentcolor", "#000001")
            self.root.configure(bg="#000001")
        except Exception:
            pass

        self.main_container = tk.Frame(self.root, bg=COLORS["bg_main"])
        self.main_container.pack(fill="both", expand=True, padx=1, pady=1)

        self.title_bar = tk.Frame(self.main_container, bg=COLORS["bg_main"], height=40)
        self.title_bar.pack(fill="x", pady=(0, 10))
        self.title_bar.bind("<Button-1>", self.start_move)
        self.title_bar.bind("<B1-Motion>", self.do_move)

        self.lbl_title = tk.Label(
            self.title_bar, 
            text="LIVE TRANSCRIPTION HUD", 
            fg=COLORS["text_header"], 
            bg=COLORS["bg_main"],
            font=("Segoe UI Light", 10),
            padx=15
        )
        self.lbl_title.pack(side="left", pady=10)
        
        self.drag_handle = tk.Label(
            self.title_bar,
            text="⠿",
            fg=COLORS["text_dim"],
            bg=COLORS["bg_main"],
            font=("Segoe UI Symbol", 10)
        )
        self.drag_handle.pack(side="left", padx=10)
        self.drag_handle.bind("<Button-1>", self.start_move)
        self.drag_handle.bind("<B1-Motion>", self.do_move)

        self.btn_close = VoidButton(self.title_bar, "×", self.stop_and_close, destructive=True, width=30)
        self.btn_close.pack(side="right", padx=15, pady=5)

        self.content = tk.Frame(self.main_container, bg=COLORS["bg_main"])
        self.content.pack(fill="both", expand=True, padx=20, pady=(0, 20))

        self.frame_audio = tk.Frame(self.content, bg=COLORS["bg_main"])
        self.frame_audio.pack(fill="x", pady=(0, 20))

        self.lbl_audio_header = tk.Label(
            self.frame_audio, 
            text="AUDIO SOURCES", 
            fg=COLORS["text_sub"], 
            bg=COLORS["bg_main"],
            font=("Segoe UI Light", 8),
            justify="left"
        )
        self.lbl_audio_header.pack(anchor="w", pady=(0, 5))

        style = ttk.Style()
        style.theme_use("clam")
        style.configure(
            "Void.Treeview",
            background=COLORS["bg_main"],
            foreground=COLORS["text_header"],
            fieldbackground=COLORS["bg_main"],
            bordercolor=COLORS["bg_main"],
            borderwidth=0,
            font=("Segoe UI Light", 9),
            rowheight=25
        )
        style.configure(
            "Void.Treeview.Heading",
            background=COLORS["bg_main"],
            foreground=COLORS["text_dim"],
            relief="flat",
            font=("Segoe UI Light", 8)
        )
        style.map("Void.Treeview", background=[('selected', COLORS["bg_secondary"])])

        self.tree_frame = tk.Frame(self.frame_audio, bg=COLORS["border"], bd=1)
        self.tree_frame.pack(fill="x")
        
        self.tree = ttk.Treeview(
            self.tree_frame, 
            columns=("proc","level"), 
            show="headings", 
            height=4,
            style="Void.Treeview"
        )
        self.tree.heading("proc", text="PROCESS")
        self.tree.heading("level", text="GAIN")
        self.tree.column("proc", width=300)
        self.tree.column("level", width=100, anchor="e")
        self.tree.pack(fill="both", expand=True, padx=1, pady=1)

        self.frame_trans = tk.Frame(self.content, bg=COLORS["bg_main"])
        self.frame_trans.pack(fill="both", expand=True)

        self.lbl_trans_header = tk.Label(
            self.frame_trans, 
            text="TRANSCRIPT STREAM", 
            fg=COLORS["text_sub"], 
            bg=COLORS["bg_main"],
            font=("Segoe UI Light", 8),
            justify="left"
        )
        self.lbl_trans_header.pack(anchor="w", pady=(0, 5))

        self.text_border = tk.Frame(self.frame_trans, bg=COLORS["border"], bd=1)
        self.text_border.pack(fill="both", expand=True)

        self.captions = scrolledtext.ScrolledText(
            self.text_border, 
            wrap="word", 
            font=("Segoe UI Light", 11), 
            bg=COLORS["bg_main"], 
            fg=COLORS["text_header"],
            insertbackground="white",
            bd=0,
            padx=10,
            pady=10,
            selectbackground=COLORS["bg_secondary"],
            selectforeground="white"
        )
        self.captions.pack(fill="both", expand=True, padx=1, pady=1)
        self.captions.configure(state="disabled")

        self.status_bar = tk.Frame(self.main_container, bg=COLORS["bg_secondary"], height=25)
        self.status_bar.pack(fill="x")
        
        self.status_ind = tk.Label(self.status_bar, text="●", fg=COLORS["text_dim"], bg=COLORS["bg_secondary"], font=("Segoe UI", 8))
        self.status_ind.pack(side="left", padx=(15, 5))
        
        self.status_text = tk.Label(
            self.status_bar, 
            text="INITIALIZING SYSTEM...", 
            fg=COLORS["text_dim"], 
            bg=COLORS["bg_secondary"],
            font=("Segoe UI Light", 8)
        )
        self.status_text.pack(side="left")

        self._stop = False
        self._lock = threading.Lock()
        self._data = []
        self.gui_queue = queue.Queue()
        self.recorder = None
        self.transcriber = None
        self.pipeline_started = False
        self.full_text = ""
        
        self.monitor_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self.monitor_thread.start()
        self.root.after(500, self._start_pipeline)
        self.root.after(REFRESH_MS, self._refresh_ui)

    def start_move(self, event):
        self.x = event.x
        self.y = event.y

    def do_move(self, event):
        deltax = event.x - self.x
        deltay = event.y - self.y
        x = self.root.winfo_x() + deltax
        y = self.root.winfo_y() + deltay
        self.root.geometry(f"+{x}+{y}")

    def stop_and_close(self):
        self.stop()
        self.root.destroy()
        sys.exit()

    def _poll_loop(self):
        while not self._stop:
            try:
                sessions = get_sessions_peaks()
            except Exception:
                sessions = []
            with self._lock:
                self._data = sessions
            time.sleep(REFRESH_MS / 1000.0)

    def _refresh_ui(self):
        with self._lock:
            sessions = list(self._data)
        
        agg = {}
        for pid, pname, peak in sessions:
            key = (pid, pname)
            agg[key] = max(agg.get(key, 0.0), peak)
        
        items = [(pid, pname, peak) for (pid, pname), peak in agg.items()]
        items.sort(key=lambda x: x[2], reverse=True)
        
        existing = {self.tree.set(child, "proc"): child for child in self.tree.get_children()}
        seen = set()
        playing_count = 0
        
        for pid, pname, peak in items:
            pname_upper = pname.upper().replace(".EXE", "")
            db = linear_to_db(peak)
            if db < MIN_DB_DISPLAY:
                db = MIN_DB_DISPLAY
            
            bars = int((db + 60) / 6)
            bars = max(0, min(10, bars))
            visual_bar = "│" * bars
            visual_bar = visual_bar.ljust(10, "·")
            
            text_level = f"{visual_bar} {db:.0f} DB"
            
            seen.add(pname_upper)
            
            if pname_upper in existing:
                self.tree.item(existing[pname_upper], values=(pname_upper, text_level))
            else:
                self.tree.insert("", "end", values=(pname_upper, text_level))
            
            if peak >= TRANSCRIBE_THRESHOLD:
                playing_count += 1
        
        for proc_name, iid in existing.items():
            if proc_name not in seen:
                try:
                    self.tree.delete(iid)
                except Exception:
                    pass
        
        if self.recorder and self.recorder.is_recording():
            self.status_ind.config(fg=COLORS["accent_red"])
            status_str = f"LISTENING | ACTIVE SOURCES: {playing_count}"
        else:
            self.status_ind.config(fg=COLORS["text_dim"])
            status_str = "STANDBY"
            
        self.status_text.config(text=status_str)
        
        try:
            while True:
                data = self.gui_queue.get_nowait()
                self._process_transcription(data)
        except queue.Empty:
            pass
        
        if not self._stop:
            self.root.after(REFRESH_MS, self._refresh_ui)

    def _process_transcription(self, data):
        new_text = data['text']
        new_text = remove_filler_duplicates(new_text)
        self.full_text = smart_merge(self.full_text, new_text)
        self.full_text = remove_filler_duplicates(self.full_text)
        self._update_display()

    def _update_display(self):
        self.captions.configure(state="normal")
        self.captions.delete("1.0", "end")
        
        display_text = self.full_text[-2000:] if len(self.full_text) > 2000 else self.full_text
        
        self.captions.insert("1.0", display_text.upper())
        self.captions.see("end")
        self.captions.configure(state="disabled")

    def _start_pipeline(self):
        if self.pipeline_started:
            return
        self.pipeline_started = True
        
        self.status_text.config(text="LOADING MODEL (WHISPER)...")
        self.root.update()
        
        self.recorder = Recorder(samplerate=SAMPLE_RATE, chunk_seconds=CHUNK_SECONDS)
        self.recorder.start()
        time.sleep(1.0)
        
        self.transcriber = WhisperTranscriber(
            recorder=self.recorder, 
            output_queue=self.gui_queue, 
            model_name=MODEL_NAME
        )
        self.transcriber.start()

    def stop(self):
        self._stop = True
        try:
            if self.recorder:
                self.recorder.stop()
            if self.transcriber:
                self.transcriber.stop()
        except Exception:
            pass
        self.monitor_thread.join(timeout=1.0)

def main():
    if sys.platform != "win32":
        return
    
    root = tk.Tk()
    app = App(root)
    try:
        root.mainloop()
    finally:
        app.stop()

if __name__ == "__main__":
    main()