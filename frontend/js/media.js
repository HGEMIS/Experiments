/* Media + geolocation helpers.
   - getGeo(): fresh high-accuracy position
   - capture(): open camera, watermark the photo with coords+timestamp+label,
     downscale to keep uploads small, return a JPEG data URL.
   The watermark is burned into the pixels so the location/time cannot be
   removed without re-editing the image; the server also stores a SHA-256 hash. */

const Media = {
  getGeo() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        (e) => reject(new Error('Location unavailable: ' + e.message)),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  },

  fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  },

  pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = () => (input.files && input.files[0]) ? resolve(input.files[0]) : reject(new Error('cancelled'));
      input.click();
    });
  },

  async watermark(dataUrl, meta) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const maxW = 1280;
    let w = img.width, h = img.height;
    if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const time = new Date().toLocaleString();
    const lat = meta.lat != null ? meta.lat.toFixed(6) : '?';
    const lng = meta.lng != null ? meta.lng.toFixed(6) : '?';
    const stamp = `${meta.label || ''}  Lat ${lat}  Lng ${lng}  ${time}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 46, w, 46);
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(stamp, 8, h - 23);
    return canvas.toDataURL('image/jpeg', 0.8);
  },

  dataUrlToBase64(d) { return d.split(',')[1]; },

  // Capture one watermarked photo. Returns {dataUrl, base64, lat, lng, time}.
  async capture(meta) {
    let geo = { lat: null, lng: null };
    try { geo = await this.getGeo(); } catch (e) { /* proceed without coords if denied */ }
    const file = await this.pickFile();
    const raw = await this.fileToDataUrl(file);
    const dataUrl = await this.watermark(raw, { lat: geo.lat, lng: geo.lng, label: meta.label || '' });
    return { dataUrl, base64: this.dataUrlToBase64(dataUrl), lat: geo.lat, lng: geo.lng, time: new Date().toISOString() };
  }
};
