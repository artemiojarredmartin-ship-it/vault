/* Vault — in-app camera for Tier 1 proof.
 * Camera only, no gallery picker: the point is a photo taken right now.
 */
(function (global) {
  'use strict';
  let stream = null;

  function available() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  let facing = 'environment';
  async function start(videoEl, face) {
    stop();
    if (face) facing = face;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false });
    videoEl.srcObject = stream;
    videoEl.classList.toggle('mirror', facing === 'user');
    await videoEl.play();
    return stream;
  }
  function flip() { facing = facing === 'user' ? 'environment' : 'user'; return facing; }
  function facingMode() { return facing; }

  function stop() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  /** Grab a frame, burn the proof code + time into it, return a downscaled JPEG data URL. */
  function capture(videoEl, code, challenge, maxW = 720) {
    const w = videoEl.videoWidth || 640, h = videoEl.videoHeight || 480;
    const scale = Math.min(1, maxW / w);
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    if (facing === 'user') { ctx.save(); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(videoEl, 0, 0, c.width, c.height); ctx.restore(); }
    else ctx.drawImage(videoEl, 0, 0, c.width, c.height);
    // challenge banner across the top (wrapped)
    if (challenge) {
      const fs = Math.max(13, Math.round(c.width / 34));
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const words = challenge.split(' '), lines = []; let line = '';
      for (const w2 of words) { const t = line ? line + ' ' + w2 : w2; if (ctx.measureText(t).width > c.width - 32 && line) { lines.push(line); line = w2; } else line = t; }
      if (line) lines.push(line);
      const bh = lines.length * (fs + 6) + 14;
      ctx.fillStyle = 'rgba(10,40,28,.72)'; ctx.fillRect(0, 0, c.width, bh);
      ctx.fillStyle = '#f6dc97'; lines.forEach((l, i) => ctx.fillText(l, 16, 8 + fs + i * (fs + 6)));
    }
    // stamp
    const label = `${code}  ${new Date().toLocaleString()}`;
    ctx.font = `bold ${Math.max(14, Math.round(c.width / 28))}px system-ui, sans-serif`;
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(8, c.height - 36, tw, 28);
    ctx.fillStyle = '#fff'; ctx.fillText(label, 16, c.height - 15);
    return c.toDataURL('image/jpeg', 0.72);
  }

  global.Camera = { available, start, stop, capture, flip, facingMode };
})(window);
