"""Restored Rarity - Card Intake Scanner

Windows desktop app for the Canon CanoScan LiDE 400:
  1. Enter the submission ID from the intake form.
  2. Scan Front  -> flip the card(s) in place -> Scan Back.
  3. Save -> full-res PNG + web JPG on disk, CSV log, and (optionally) upload
     to Google Drive + the "Scans" tab of your Google Sheet.
"""

import json
import os
import queue
import threading
import traceback
import webbrowser
from pathlib import Path

import tkinter as tk
from tkinter import ttk, messagebox, filedialog

import cv2
from PIL import Image, ImageTk

import library
import storage
import uploader
from pipeline import capture_side, NoCardError
from scanners import make_scanner, ScannerError

APP_DIR = Path(__file__).resolve().parent
CONFIG_PATH = APP_DIR / "config.json"

DEFAULTS = {
    "dpi": 1200,
    "preview_dpi": 100,
    "max_cards": 2,
    "output_dir": str(Path.home() / "Pictures" / "Restored Rarity Scans"),
    "upload_url": "",
    "upload_token": "",
    "auto_upload": True,
    "web_long_side": 2400,
    "scanner": "wia",
    "device_hint": "LiDE",
    "mock_front": "",
    "mock_back": "",
    "mock_dpi": 600,
}

STAGES = [("Before (intake)", "before"), ("After (restored)", "after"), ("In progress", "progress")]

BG, PANEL, FG, MUTED = "#0b1220", "#141d30", "#e8eef7", "#8b97ad"
GOLD, CYAN, RED = "#f5b301", "#2ad4e6", "#ff6b6b"
THUMB = (230, 320)


def load_config():
    cfg = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text()))
        except Exception:
            pass
    return cfg


def save_config(cfg):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


def to_thumb(bgr):
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(rgb)
    im.thumbnail(THUMB, Image.LANCZOS)
    return ImageTk.PhotoImage(im)


class App:
    def __init__(self, root):
        self.root = root
        self.cfg = load_config()
        self.q = queue.Queue()
        self.slots = []
        self.busy = False

        root.title("Restored Rarity — Card Intake Scanner")
        root.configure(bg=BG)
        root.minsize(760, 640)
        self._style()
        self._build()
        self._bind_keys()
        self.root.after(100, self._poll)
        self.status("Ready. Enter a submission ID, place the card face-down, then Scan Front (Ctrl+1).")

    # ------------------------------------------------------------ UI ----
    def _style(self):
        s = ttk.Style()
        s.theme_use("clam")
        s.configure(".", background=BG, foreground=FG, fieldbackground=PANEL,
                    bordercolor="#24314d", lightcolor=PANEL, darkcolor=PANEL, font=("Segoe UI", 10))
        s.configure("TFrame", background=BG)
        s.configure("Panel.TFrame", background=PANEL)
        s.configure("TLabel", background=BG, foreground=FG)
        s.configure("Panel.TLabel", background=PANEL, foreground=FG)
        s.configure("Muted.TLabel", background=PANEL, foreground=MUTED, font=("Segoe UI", 9))
        s.configure("Title.TLabel", background=BG, foreground=GOLD, font=("Segoe UI Semibold", 15))
        s.configure("Card.TLabel", background=PANEL, foreground=CYAN, font=("Segoe UI Semibold", 11))
        s.configure("TEntry", foreground=FG, insertcolor=FG)
        s.configure("TCombobox", foreground=FG, arrowcolor=FG)
        s.map("TCombobox", fieldbackground=[("readonly", PANEL)], foreground=[("readonly", FG)])
        s.configure("TSpinbox", foreground=FG, arrowcolor=FG)
        s.configure("TButton", background="#1d2942", foreground=FG, padding=(12, 7), borderwidth=0)
        s.map("TButton", background=[("disabled", "#151c2c"), ("active", "#26365a")],
              foreground=[("disabled", "#55617a")])
        s.configure("Accent.TButton", background=GOLD, foreground="#111")
        s.map("Accent.TButton", background=[("disabled", "#5a4a14"), ("active", "#ffc933")])
        s.configure("TLabelframe", background=BG, bordercolor="#24314d")
        s.configure("TLabelframe.Label", background=BG, foreground=MUTED)
        s.configure("TCheckbutton", background=PANEL, foreground=FG)

    def _build(self):
        menubar = tk.Menu(self.root)
        m = tk.Menu(menubar, tearoff=0)
        m.add_command(label="Settings…", command=self.open_settings)
        m.add_command(label="Upload pending scans", command=self.upload_pending)
        m.add_command(label="Open scans folder", command=lambda: storage.open_folder(self.cfg["output_dir"]))
        m.add_separator()
        m.add_command(label="Quit", command=self.root.destroy)
        menubar.add_cascade(label="File", menu=m)
        lm = tk.Menu(menubar, tearoff=0)
        lm.add_command(label="Find a card…   Ctrl+L", command=self.open_library)
        lm.add_command(label="Open library in browser", command=self.open_library_browser)
        lm.add_command(label="Rebuild all reports", command=self.rebuild_reports)
        menubar.add_cascade(label="Library", menu=lm)
        self.root.config(menu=menubar)

        outer = ttk.Frame(self.root, padding=14)
        outer.pack(fill="both", expand=True)

        ttk.Label(outer, text="Card Intake Scanner", style="Title.TLabel").pack(anchor="w")

        form = ttk.Frame(outer, style="Panel.TFrame", padding=12)
        form.pack(fill="x", pady=(10, 10))
        self.sub_var = tk.StringVar()
        self.cust_var = tk.StringVar()
        self.stage_var = tk.StringVar(value=STAGES[0][0])
        self.next_var = tk.IntVar(value=1)

        ttk.Label(form, text="Submission ID", style="Panel.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Entry(form, textvariable=self.sub_var, width=18).grid(row=1, column=0, sticky="we", padx=(0, 10))
        ttk.Label(form, text="Customer", style="Panel.TLabel").grid(row=0, column=1, sticky="w")
        ttk.Entry(form, textvariable=self.cust_var, width=24).grid(row=1, column=1, sticky="we", padx=(0, 10))
        ttk.Label(form, text="Stage", style="Panel.TLabel").grid(row=0, column=2, sticky="w")
        ttk.Combobox(form, textvariable=self.stage_var, values=[s[0] for s in STAGES],
                     state="readonly", width=16).grid(row=1, column=2, sticky="we", padx=(0, 10))
        ttk.Label(form, text="Next card #", style="Panel.TLabel").grid(row=0, column=3, sticky="w")
        ttk.Spinbox(form, from_=1, to=999, textvariable=self.next_var, width=6).grid(row=1, column=3, sticky="w")
        for c in range(3):
            form.columnconfigure(c, weight=1)

        bar = ttk.Frame(outer)
        bar.pack(fill="x")
        self.btn_front = ttk.Button(bar, text="① Scan Front", style="Accent.TButton", command=self.scan_front)
        self.btn_back = ttk.Button(bar, text="② Scan Back", command=self.scan_back, state="disabled")
        self.btn_swap = ttk.Button(bar, text="⇄ Swap backs", command=self.swap_backs, state="disabled")
        self.btn_save = ttk.Button(bar, text="✔ Save cards", style="Accent.TButton", command=self.save_cards,
                                   state="disabled")
        self.btn_clear = ttk.Button(bar, text="Discard", command=self.clear_slots, state="disabled")
        self.btn_report = ttk.Button(bar, text="📄 Last report", command=self.open_last_report, state="disabled")
        self.btn_lib = ttk.Button(bar, text="🔍 Library", command=self.open_library)
        for b in (self.btn_front, self.btn_back, self.btn_swap, self.btn_save):
            b.pack(side="left", padx=(0, 8))
        self.btn_lib.pack(side="right")
        self.btn_report.pack(side="right", padx=(0, 8))
        self.btn_clear.pack(side="right", padx=(0, 8))
        self.last_reports = []

        self.cards_frame = ttk.Frame(outer)
        self.cards_frame.pack(fill="both", expand=True, pady=(12, 8))
        self.placeholder = ttk.Label(
            self.cards_frame, foreground=MUTED,
            text="Place 1–2 cards face-down on the glass (a black sheet behind them helps), close the lid,\n"
                 "then press Scan Front. Flip each card in place before Scan Back.",
            justify="center")
        self.placeholder.pack(expand=True)

        self.status_var = tk.StringVar()
        self.dpi_var = tk.StringVar()
        sb = ttk.Frame(outer, style="Panel.TFrame", padding=(10, 6))
        sb.pack(fill="x", side="bottom")
        ttk.Label(sb, textvariable=self.status_var, style="Panel.TLabel").pack(side="left")
        ttk.Label(sb, textvariable=self.dpi_var, style="Muted.TLabel").pack(side="right")
        self._update_dpi_label()

    def _bind_keys(self):
        self.root.bind("<Control-Key-1>", lambda e: self.scan_front())
        self.root.bind("<Control-Key-2>", lambda e: self.scan_back())
        self.root.bind("<Control-s>", lambda e: self.save_cards())
        self.root.bind("<Control-l>", lambda e: self.open_library())

    def _update_dpi_label(self):
        up = "portal sync on" if self.cfg.get("upload_url") else "local only"
        self.dpi_var.set(f"{self.cfg['dpi']} dpi · {up} · {self.cfg['scanner'].upper()}")

    def status(self, msg, color=FG):
        self.status_var.set(msg)

    def _set_busy(self, busy):
        self.busy = busy
        has = bool(self.slots)
        has_back = any(s["back"] is not None for s in self.slots)
        self.btn_front.configure(state="disabled" if busy else "normal")
        self.btn_back.configure(state="normal" if (has and not busy) else "disabled")
        self.btn_swap.configure(state="normal" if (len(self.slots) == 2 and has_back and not busy) else "disabled")
        self.btn_save.configure(state="normal" if (has and not busy) else "disabled")
        self.btn_clear.configure(state="normal" if (has and not busy) else "disabled")
        self.root.configure(cursor="watch" if busy else "")

    # --------------------------------------------------------- slots ----
    def _render_slots(self):
        for w in self.cards_frame.winfo_children():
            w.destroy()
        if not self.slots:
            self.placeholder = ttk.Label(self.cards_frame, text="No cards scanned yet.", foreground=MUTED)
            self.placeholder.pack(expand=True)
            return
        start = self._next_card()
        for i, slot in enumerate(self.slots):
            f = ttk.Frame(self.cards_frame, style="Panel.TFrame", padding=10)
            f.pack(side="left", fill="both", expand=True, padx=(0 if i == 0 else 10, 0))
            ttk.Label(f, text=f"Card #{start + i}", style="Card.TLabel").grid(row=0, column=0, columnspan=2, sticky="w")
            for col, side in enumerate(("front", "back")):
                cap = slot[side]
                ttk.Label(f, text=side.capitalize(), style="Muted.TLabel").grid(row=1, column=col, sticky="w")
                if cap is not None:
                    slot[f"{side}_img"] = to_thumb(cap.image)
                    lbl = tk.Label(f, image=slot[f"{side}_img"], bg=PANEL)
                else:
                    lbl = tk.Label(f, text="not scanned", width=24, height=14, bg="#0f1626", fg=MUTED)
                lbl.grid(row=2, column=col, padx=(0, 8), pady=(2, 6), sticky="n")
                if cap is not None and cap.centering and cap.centering.get("summary"):
                    sm = cap.centering["summary"]
                    txt = f"L/R {round(sm['lr'][0])}/{100 - round(sm['lr'][0])} · T/B {round(sm['tb'][0])}/{100 - round(sm['tb'][0])}"
                    if not sm.get("all_found"):
                        txt += "  ⚠ check"
                    ttk.Label(f, text=txt, style="Muted.TLabel").grid(row=3, column=col, sticky="w")
                if cap is not None and not cap.cropped:
                    ttk.Label(f, text="⚠ auto-crop failed — raw area saved", foreground=RED,
                              style="Muted.TLabel").grid(row=3, column=col, sticky="w")
            ttk.Label(f, text="Card name / set / number", style="Muted.TLabel").grid(row=4, column=0, columnspan=2, sticky="w")
            ttk.Entry(f, textvariable=slot["name"]).grid(row=5, column=0, columnspan=2, sticky="we")
            ttk.Label(f, text="Condition notes", style="Muted.TLabel").grid(row=6, column=0, columnspan=2, sticky="w", pady=(6, 0))
            ttk.Entry(f, textvariable=slot["notes"]).grid(row=7, column=0, columnspan=2, sticky="we")
            f.columnconfigure(0, weight=1)
            f.columnconfigure(1, weight=1)

    def _next_card(self):
        try:
            return max(1, int(self.next_var.get()))
        except (tk.TclError, ValueError):
            return 1

    def clear_slots(self):
        if self.busy:
            return
        self.slots = []
        self._render_slots()
        self._set_busy(False)
        self.status("Discarded. Ready for the next card.")

    def swap_backs(self):
        if len(self.slots) == 2:
            self.slots[0]["back"], self.slots[1]["back"] = self.slots[1]["back"], self.slots[0]["back"]
            self._render_slots()
            self.status("Swapped the backs.")

    # --------------------------------------------------------- scans ----
    def _run(self, kind, fn):
        self._set_busy(True)

        def worker():
            try:
                self.q.put((kind, fn()))
            except (ScannerError, NoCardError, uploader.UploadError) as exc:
                self.q.put(("error", str(exc)))
            except Exception as exc:
                traceback.print_exc()
                self.q.put(("error", f"{type(exc).__name__}: {exc}"))

        threading.Thread(target=worker, daemon=True).start()

    def _scan(self, side):
        cfg = dict(self.cfg)
        scanner = make_scanner(cfg)
        return capture_side(scanner, int(cfg["dpi"]), side,
                            preview_dpi=int(cfg["preview_dpi"]),
                            max_cards=int(cfg["max_cards"]),
                            progress=lambda m: self.q.put(("status", m)))

    def scan_front(self):
        if self.busy:
            return
        if not self.sub_var.get().strip():
            messagebox.showwarning("Submission ID needed", "Enter the submission ID from the intake form first.")
            return
        if self.slots and not messagebox.askyesno("Replace?", "Discard the unsaved cards and scan new fronts?"):
            return
        self._run("front_done", lambda: self._scan("front"))

    def scan_back(self):
        if self.busy or not self.slots:
            return
        self._run("back_done", lambda: self._scan("back"))

    # ----------------------------------------------------------- save ----
    def save_cards(self):
        if self.busy or not self.slots:
            return
        missing = [i for i, s in enumerate(self.slots) if s["back"] is None]
        if missing and not messagebox.askyesno("No back scan",
                                               "Some cards have no back scan. Save the fronts only?"):
            return
        sub = self.sub_var.get().strip()
        if not sub:
            messagebox.showwarning("Submission ID needed", "Enter the submission ID first.")
            return
        stage = dict(STAGES)[self.stage_var.get()]
        start = self._next_card()
        jobs = []
        for i, slot in enumerate(self.slots):
            for side in ("front", "back"):
                if slot[side] is not None:
                    meta = {
                        "submission_id": sub,
                        "customer": self.cust_var.get().strip(),
                        "card_number": start + i,
                        "card_name": slot["name"].get().strip(),
                        "stage": stage,
                        "side": side,
                        "notes": slot["notes"].get().strip(),
                    }
                    jobs.append((meta, slot[side]))
        count = len(self.slots)
        cfg = dict(self.cfg)

        def work():
            sidecars = []
            for meta, cap in jobs:
                self.q.put(("status", f"Saving card {meta['card_number']} {meta['side']} + corners & edges…"))
                _, _, sc = storage.save_side(cfg["output_dir"], meta, cap, int(cfg["web_long_side"]))
                sidecars.append(sc)
            self.q.put(("status", "Building card reports…"))
            library.rebuild(cfg["output_dir"])
            reports = []
            for sc in sidecars:
                r = Path(sc).parent.parent / "report.html"
                if r not in reports:
                    reports.append(r)
            uploaded, failed = 0, []
            if cfg.get("upload_url") and cfg.get("auto_upload"):
                uploaded, failed = self._upload(cfg, sidecars)
            return {"count": count, "files": len(jobs), "uploaded": uploaded, "failed": failed,
                    "reports": reports}

        self._run("save_done", work)

    def _upload(self, cfg, sidecars):
        uploaded, failed = 0, []
        for sc in sidecars:
            rec = json.loads(Path(sc).read_text())
            self.q.put(("status", f"Sending card {rec['card_number']} {rec['side']} to the portal…"))
            try:
                url = uploader.upload_side(cfg["upload_url"], cfg["upload_token"], rec)
                storage.mark_uploaded(sc, url)
                uploaded += 1
            except Exception as exc:
                failed.append(f"{rec['submission_id']} #{rec['card_number']} {rec['stage']} {rec['side']}: {exc}")
        return uploaded, failed

    def upload_pending(self):
        if self.busy:
            return
        cfg = dict(self.cfg)
        if not cfg.get("upload_url"):
            messagebox.showinfo("Portal", "Set the portal URL and key in File → Settings first.")
            return

        def work():
            pend = storage.pending_uploads(cfg["output_dir"])
            up, failed = self._upload(cfg, [p for p, _ in pend])
            return {"uploaded": up, "failed": failed, "total": len(pend)}

        self._run("pending_done", work)

    # ---------------------------------------------------------- queue ----
    def _poll(self):
        try:
            while True:
                kind, data = self.q.get_nowait()
                getattr(self, f"_on_{kind}")(data)
        except queue.Empty:
            pass
        self.root.after(100, self._poll)

    def _on_status(self, msg):
        self.status(msg)

    def _on_error(self, msg):
        self._set_busy(False)
        self.status("Error — see message.")
        messagebox.showerror("Problem", msg)

    def _on_front_done(self, results):
        self.slots = [{"front": r, "back": None, "name": tk.StringVar(), "notes": tk.StringVar()}
                      for r in results]
        self._render_slots()
        self._set_busy(False)
        n = len(results)
        self.status(f"Front scanned ({n} card{'s' if n > 1 else ''}). Flip in place, then Scan Back (Ctrl+2).")

    def _on_back_done(self, results):
        if len(results) != len(self.slots):
            messagebox.showwarning(
                "Card count changed",
                f"Found {len(results)} card(s) on the back scan but {len(self.slots)} on the front. "
                "Backs were matched in order — check them, or rescan.")
        for slot, r in zip(self.slots, results):
            slot["back"] = r
        self._render_slots()
        self._set_busy(False)
        self.status("Back scanned. Check the pairing, add names/notes, then Save (Ctrl+S).")

    def _on_save_done(self, info):
        if dict(STAGES)[self.stage_var.get()] == "before":
            self.next_var.set(self._next_card() + info["count"])
        self.slots = []
        self.last_reports = info.get("reports", [])
        self._render_slots()
        self._set_busy(False)
        self.btn_report.configure(state="normal" if self.last_reports else "disabled")
        msg = f"Saved {info['count']} card(s) with corner & edge close-ups. Report ready."
        if self.cfg.get("upload_url") and self.cfg.get("auto_upload"):
            msg += f" Sent {info['uploaded']} to the portal."
        self.status(msg)
        if info["failed"]:
            messagebox.showwarning(
                "Some uploads failed",
                "Saved locally, but these didn't upload:\n\n" + "\n".join(info["failed"][:6]) +
                "\n\nUse File → Upload pending scans to retry.")

    def _on_pending_done(self, info):
        self._set_busy(False)
        self.status(f"Uploaded {info['uploaded']} of {info['total']} pending scan(s).")
        if info["failed"]:
            messagebox.showwarning("Some uploads failed", "\n".join(info["failed"][:8]))

    # -------------------------------------------------------- library ----
    def open_last_report(self):
        for r in self.last_reports:
            open_in_browser(r)

    def open_library(self):
        LibraryWindow(self)

    def open_library_browser(self):
        path = library.build_index(self.cfg["output_dir"])
        open_in_browser(path)

    def rebuild_reports(self):
        if self.busy:
            return
        out = self.cfg["output_dir"]
        self._run("rebuild_done", lambda: len(library.rebuild(out)))

    def _on_rebuild_done(self, n):
        self._set_busy(False)
        self.status(f"Rebuilt {n} card report(s).")

    def prepare_rescan(self, card, stage="after"):
        """Fill the form so the next scan lands in this card's folder."""
        if self.slots and not messagebox.askyesno("Replace?", "Discard the unsaved cards?"):
            return
        self.slots = []
        self._render_slots()
        self._set_busy(False)
        self.sub_var.set(str(card["submission_id"]))
        self.cust_var.set(card.get("customer", ""))
        self.next_var.set(int(card["card_number"]))
        self.stage_var.set(next(lbl for lbl, key in STAGES if key == stage))
        self.status(f"Ready to scan card #{card['card_number']} ({card['card_name'] or 'unnamed'}) "
                    f"for '{stage}'. Place just this card and Scan Front.")

    # ------------------------------------------------------- settings ----
    def open_settings(self):
        SettingsDialog(self)


def open_in_browser(path):
    webbrowser.open(Path(path).resolve().as_uri())


class LibraryWindow:
    COLS = [("submission", "Submission", 110), ("num", "Card #", 60), ("name", "Card", 230),
            ("customer", "Customer", 140), ("stages", "Stages", 150), ("latest", "Last scanned", 140)]

    def __init__(self, app):
        self.app = app
        self.cards = []
        w = self.win = tk.Toplevel(app.root)
        w.title("Card library")
        w.configure(bg=BG)
        w.geometry("980x560")
        top = ttk.Frame(w, padding=(12, 12, 12, 6))
        top.pack(fill="x")
        ttk.Label(top, text="Search").pack(side="left")
        self.q = tk.StringVar()
        ent = ttk.Entry(top, textvariable=self.q, width=40)
        ent.pack(side="left", padx=8, fill="x", expand=True)
        ent.focus_set()
        self.q.trace_add("write", lambda *a: self._fill())
        self.count = tk.StringVar()
        ttk.Label(top, textvariable=self.count, foreground=MUTED).pack(side="left", padx=8)

        mid = ttk.Frame(w, padding=(12, 0))
        mid.pack(fill="both", expand=True)
        s = ttk.Style()
        s.configure("Treeview", background=PANEL, fieldbackground=PANEL, foreground=FG, rowheight=26)
        s.configure("Treeview.Heading", background="#1d2942", foreground=FG)
        s.map("Treeview", background=[("selected", "#26365a")])
        self.tree = ttk.Treeview(mid, columns=[c[0] for c in self.COLS], show="headings", selectmode="browse")
        for key, label, width in self.COLS:
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, anchor="w")
        sb = ttk.Scrollbar(mid, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.tree.bind("<Double-1>", lambda e: self.open_report())
        self.tree.bind("<Return>", lambda e: self.open_report())

        bot = ttk.Frame(w, padding=12)
        bot.pack(fill="x")
        ttk.Button(bot, text="📄 Open report", style="Accent.TButton", command=self.open_report).pack(side="left")
        ttk.Button(bot, text="Open folder", command=self.open_folder).pack(side="left", padx=8)
        ttk.Button(bot, text="Scan this card (after restore)",
                   command=lambda: self.rescan("after")).pack(side="left")
        ttk.Button(bot, text="Scan (in progress)", command=lambda: self.rescan("progress")).pack(side="left", padx=8)
        ttk.Button(bot, text="Open all in browser", command=app.open_library_browser).pack(side="right")
        ttk.Button(bot, text="Refresh", command=self.reload).pack(side="right", padx=8)
        self.reload()

    def reload(self):
        try:
            self.cards = library.load_cards(self.app.cfg["output_dir"])
        except Exception as exc:
            messagebox.showerror("Library", str(exc), parent=self.win)
            self.cards = []
        self._fill()

    def _fill(self):
        words = self.q.get().lower().split()
        self.tree.delete(*self.tree.get_children())
        shown = 0
        for i, c in enumerate(self.cards):
            stages = ", ".join(library.STAGE_LABEL.get(k, k).split(" (")[0] for k in c["stage_keys"])
            row = (c["submission_id"], c["card_number"], c["card_name"] or "—", c["customer"],
                   stages, c["latest"].replace("T", " "))
            hay = " ".join(str(x) for x in row).lower() + " " + c.get("notes", "").lower()
            if all(w in hay for w in words):
                self.tree.insert("", "end", iid=str(i), values=row)
                shown += 1
        self.count.set(f"{shown} of {len(self.cards)} cards")

    def _selected(self):
        sel = self.tree.selection()
        if not sel:
            kids = self.tree.get_children()
            if len(kids) == 1:
                sel = kids
            else:
                messagebox.showinfo("Library", "Select a card first.", parent=self.win)
                return None
        return self.cards[int(sel[0])]

    def open_report(self):
        c = self._selected()
        if c:
            if not c["report"].exists():
                library.build_report(c)
            open_in_browser(c["report"])

    def open_folder(self):
        c = self._selected()
        if c:
            storage.open_folder(c["dir"])

    def rescan(self, stage):
        c = self._selected()
        if c:
            self.app.prepare_rescan(c, stage)
            self.win.destroy()


class SettingsDialog:
    def __init__(self, app):
        self.app = app
        cfg = app.cfg
        w = self.win = tk.Toplevel(app.root)
        w.title("Settings")
        w.configure(bg=BG)
        w.transient(app.root)
        w.grab_set()
        f = ttk.Frame(w, style="Panel.TFrame", padding=14)
        f.pack(fill="both", expand=True, padx=10, pady=10)

        self.vars = {
            "dpi": tk.StringVar(value=str(cfg["dpi"])),
            "max_cards": tk.StringVar(value=str(cfg["max_cards"])),
            "output_dir": tk.StringVar(value=cfg["output_dir"]),
            "upload_url": tk.StringVar(value=cfg["upload_url"]),
            "upload_token": tk.StringVar(value=cfg["upload_token"]),
            "auto_upload": tk.BooleanVar(value=cfg["auto_upload"]),
            "scanner": tk.StringVar(value=cfg["scanner"]),
            "mock_front": tk.StringVar(value=cfg["mock_front"]),
            "mock_back": tk.StringVar(value=cfg["mock_back"]),
        }
        r = 0

        def row(label, widget, hint=None):
            nonlocal r
            ttk.Label(f, text=label, style="Panel.TLabel").grid(row=r, column=0, sticky="w", pady=4)
            widget.grid(row=r, column=1, sticky="we", pady=4)
            r += 1
            if hint:
                ttk.Label(f, text=hint, style="Muted.TLabel").grid(row=r, column=1, sticky="w")
                r += 1

        row("Scan resolution (dpi)",
            ttk.Combobox(f, textvariable=self.vars["dpi"], values=["600", "1200", "2400", "4800"],
                         state="readonly", width=10),
            "1200 for intake records; 2400 for close-up condition detail (slower, ~150 MB per side).")
        row("Cards per scan", ttk.Combobox(f, textvariable=self.vars["max_cards"], values=["1", "2"],
                                           state="readonly", width=10))
        of = ttk.Frame(f, style="Panel.TFrame")
        ttk.Entry(of, textvariable=self.vars["output_dir"], width=44).pack(side="left", fill="x", expand=True)
        ttk.Button(of, text="Browse…", command=self._browse).pack(side="left", padx=(6, 0))
        row("Save scans to", of)
        row("Portal (Supabase) URL", ttk.Entry(f, textvariable=self.vars["upload_url"], width=52),
            "e.g. https://abcd1234.supabase.co — leave blank to keep scans on this PC only.")
        row("Service role key", ttk.Entry(f, textvariable=self.vars["upload_token"], show="•", width=52),
            "Supabase → Project Settings → API → service_role. Only ever paste it here, on this PC.")
        row("", ttk.Checkbutton(f, text="Send to the portal automatically after saving", variable=self.vars["auto_upload"]))
        row("Scanner", ttk.Combobox(f, textvariable=self.vars["scanner"], values=["wia", "mock"],
                                    state="readonly", width=10),
            "wia = Canon LiDE 400. mock = test with image files, no scanner needed.")
        row("Mock front image", ttk.Entry(f, textvariable=self.vars["mock_front"], width=52))
        row("Mock back image", ttk.Entry(f, textvariable=self.vars["mock_back"], width=52))
        f.columnconfigure(1, weight=1)

        bf = ttk.Frame(f, style="Panel.TFrame")
        bf.grid(row=r, column=0, columnspan=2, sticky="e", pady=(12, 0))
        ttk.Button(bf, text="Test scanner", command=self._test_scanner).pack(side="left", padx=4)
        ttk.Button(bf, text="Test portal", command=self._test_upload).pack(side="left", padx=4)
        ttk.Button(bf, text="Cancel", command=w.destroy).pack(side="left", padx=4)
        ttk.Button(bf, text="Save", style="Accent.TButton", command=self._save).pack(side="left", padx=4)

    def _browse(self):
        d = filedialog.askdirectory(initialdir=self.vars["output_dir"].get() or str(Path.home()))
        if d:
            self.vars["output_dir"].set(d)

    def _collect(self):
        cfg = dict(self.app.cfg)
        for k, v in self.vars.items():
            cfg[k] = v.get()
        cfg["dpi"] = int(cfg["dpi"])
        cfg["max_cards"] = int(cfg["max_cards"])
        cfg["upload_url"] = cfg["upload_url"].strip()
        return cfg

    def _test_scanner(self):
        try:
            name = make_scanner(self._collect()).device_name()
            messagebox.showinfo("Scanner", f"Found: {name}", parent=self.win)
        except Exception as exc:
            messagebox.showerror("Scanner", str(exc), parent=self.win)

    def _test_upload(self):
        cfg = self._collect()
        try:
            data = uploader.test_connection(cfg["upload_url"], cfg["upload_token"])
            messagebox.showinfo("Portal", f"Connected: {data.get('sheet', 'OK')}", parent=self.win)
        except Exception as exc:
            messagebox.showerror("Upload", str(exc), parent=self.win)

    def _save(self):
        self.app.cfg = self._collect()
        save_config(self.app.cfg)
        self.app._update_dpi_label()
        self.win.destroy()


def main():
    if os.name == "nt":  # crisp text on high-DPI Windows screens; must run before Tk starts
        try:
            from ctypes import windll
            windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
