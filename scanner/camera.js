// Full-screen camera with a card outline, a bubble level (phone motion sensor) and auto-capture:
// the photo is taken once the phone has been held flat and still for a moment.
//   const file = await openCamera("Front");   // File, or null if cancelled
//   Continuous: await openCamera("Card 1 · front", { onShot: (file) => "Card 1 · back" });
//   keeps the camera open; onShot gets each photo and returns the next label. Resolves null on Done.
const TOL = 2.0;            // degrees from flat that count as level
const STILL = 0.8;          // max wobble (degrees) over the last half second
const HOLD_MS = 700;        // level + still this long => auto-capture
const REARM_MS = 2500;      // continuous mode: time to flip or swap the card before the next auto shot

export async function openCamera(label = "", { onShot = null } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't open the camera. Use Upload instead.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
  const track = stream.getVideoTracks()[0];
  const root = document.createElement("div");
  root.className = "cam";
  root.innerHTML = `<video playsinline muted autoplay></video>
    <div class="cam-frame"><div></div></div>
    <div class="cam-top"><b class="cam-label"></b>
      <span class="cam-msg">Card on a plain, dark surface · fill the outline · no flash</span></div>
    <div class="cam-level" hidden><div class="cam-ring"></div><div class="cam-bubble"></div><span class="cam-deg"></span></div>
    <div class="cam-bar">
      <button class="btn" data-a="cancel">${onShot ? "Done" : "Cancel"}</button>
      <button class="cam-shoot" data-a="shoot" aria-label="Take photo"></button>
      <button class="btn" data-a="level">Turn on level</button>
    </div>`;
  document.body.append(root);
  document.documentElement.style.overflow = "hidden";
  const video = root.querySelector("video"), lvl = root.querySelector(".cam-level"), bubble = root.querySelector(".cam-bubble");
  const deg = root.querySelector(".cam-deg"), msg = root.querySelector(".cam-msg"), lvlBtn = root.querySelector('[data-a="level"]');
  video.srcObject = stream;
  const labelEl = root.querySelector(".cam-label");
  labelEl.textContent = label || "Photo";

  let auto = false, levelSince = 0, hist = [], done = null, busy = false, rearmAt = 0, shots = 0;
  const result = new Promise((r) => { done = r; });

  function finish(file) {
    window.removeEventListener("deviceorientation", onOri);
    stream.getTracks().forEach((t) => t.stop());
    document.documentElement.style.overflow = ""; root.remove();
    done(file);
  }

  async function shoot() {
    if (busy) return; busy = true;
    root.classList.add("flash");
    try {
      let blob = null;
      if ("ImageCapture" in window) {           // full camera resolution where supported (Android Chrome)
        try { blob = await new window.ImageCapture(track).takePhoto(); } catch { blob = null; }
      }
      if (!blob) {
        const c = document.createElement("canvas");
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext("2d").drawImage(video, 0, 0);
        blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95));
      }
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
      if (!onShot) return finish(file);
      const next = await onShot(file);
      if (next == null) return finish(null);
      shots++; labelEl.textContent = next;
      msg.textContent = `✓ ${shots} photo${shots > 1 ? "s" : ""} taken · ${/back/i.test(next) ? "flip the card over" : "put the next card down"}`;
      rearmAt = performance.now() + REARM_MS; levelSince = 0;
      setTimeout(() => root.classList.remove("flash"), 250);
    } catch (e) { msg.textContent = "Couldn't take the photo: " + e.message; root.classList.remove("flash"); }
    busy = false;
  }

  // Phone flat and screen up (camera facing the table): beta and gamma both read ~0.
  function onOri(e) {
    if (e.beta == null || e.gamma == null) return;
    lvl.hidden = false;
    const b = e.beta, g = e.gamma, now = performance.now();
    const off = Math.hypot(b, g), k = 4;                  // 4 px per degree
    bubble.style.transform = `translate(${Math.max(-60, Math.min(60, g * k))}px, ${Math.max(-60, Math.min(60, b * k))}px)`;
    deg.textContent = off < 10 ? off.toFixed(1) + "°" : "tilt the phone flat";
    hist.push([now, b, g]); hist = hist.filter((h) => now - h[0] < 500);
    const span = (i) => Math.max(...hist.map((h) => h[i])) - Math.min(...hist.map((h) => h[i]));
    const level = off < TOL && span(1) < STILL && span(2) < STILL;
    root.classList.toggle("level", level);
    if (!level) { levelSince = 0; root.style.setProperty("--hold", 0); return; }
    if (now < rearmAt) { root.style.setProperty("--hold", 0); return; }
    if (!levelSince) levelSince = now;
    const hold = Math.min(1, (now - levelSince) / HOLD_MS);
    root.style.setProperty("--hold", auto ? hold : 0);
    if (auto && hold >= 1) shoot();
  }

  async function enableLevel() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) { msg.textContent = "This device has no motion sensor — tap the button to take the photo."; return; }
    if (typeof DOE.requestPermission === "function") {  // iPhone: must be asked from a tap
      try { if ((await DOE.requestPermission()) !== "granted") { msg.textContent = "Motion access was denied — tap the button to take the photo."; return; } }
      catch (e) { msg.textContent = "Couldn't turn on the level: " + e.message; return; }
    }
    window.addEventListener("deviceorientation", onOri);
    auto = true; lvlBtn.textContent = "Level: auto";
    msg.textContent = "Hold the phone flat over the card — it shoots when the bubble is centred and steady";
    setTimeout(() => { if (lvl.hidden) { auto = false; lvlBtn.textContent = "Level: n/a";
      msg.textContent = "No level on this device — tap the button to take the photo."; } }, 1500);
  }

  root.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "cancel" && !busy) finish(null);
    if (a === "shoot") shoot();
    if (a === "level") {
      if (!auto && lvl.hidden) enableLevel();
      else { auto = !auto; lvlBtn.textContent = auto ? "Level: auto" : "Level: manual"; }
    }
  });
  // Android/desktop don't need permission: start the level right away (it hides itself without a sensor)
  if (typeof window.DeviceOrientationEvent?.requestPermission !== "function") enableLevel();
  return result;
}
