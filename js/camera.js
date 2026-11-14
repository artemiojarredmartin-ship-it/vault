/* Vault — in-app camera for Tier 1 proof.
 * Camera only, no gallery picker: the point is a photo taken right now.
 */
(function (global) {
  'use strict';
  let stream = null;

  function available() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  async function start(videoEl) {
    stop();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  }

  function stop() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  /** Grab a frame, burn the proof code + time into it, return a downscaled JPEG data URL. */
  function capture(videoEl, code, maxW = 640) {
    const w = videoEl.videoWidth || 640, h = videoEl.videoHeight || 480;
    const scale = Math.min(1, maxW / w);
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, c.width, c.height);
    // stamp
    const label = `${code}  ${new Date().toLocaleString()}`;
    ctx.font = `bold ${Math.max(14, Math.round(c.width / 28))}px system-ui, sans-serif`;
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(8, c.height - 36, tw, 28);
    ctx.fillStyle = '#fff'; ctx.fillText(label, 16, c.height - 15);
    return c.toDataURL('image/jpeg', 0.72);
  }

  global.Camera = { available, start, stop, capture };
})(window);
