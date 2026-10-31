// Minimal .zip writer (no compression: the files are JPGs, which don't shrink anyway).
// const z = new Zip(); z.add("folder/a.jpg", blob); const blob = await z.blob();

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class Zip {
  constructor() { this.files = []; }
  add(name, data) { this.files.push({ name, data }); }
  async blob() {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const f of this.files) {
      const bytes = f.data instanceof Uint8Array ? f.data
        : typeof f.data === "string" ? enc.encode(f.data) : new Uint8Array(await f.data.arrayBuffer());
      const name = enc.encode(f.name), crc = crc32(bytes);
      const head = (sig, extra) => {
        const b = new DataView(new ArrayBuffer(extra ? 46 : 30));
        let o = 0; const u16 = (v) => { b.setUint16(o, v, true); o += 2; }, u32 = (v) => { b.setUint32(o, v, true); o += 4; };
        u32(sig); if (extra) u16(20);
        u16(20); u16(0x0800); u16(0); u16(time); u16(date);   // version, UTF-8 names, stored
        u32(crc); u32(bytes.length); u32(bytes.length); u16(name.length); u16(0);
        if (extra) { u16(0); u16(0); u16(0); u32(0); u32(offset); }
        return new Uint8Array(b.buffer);
      };
      const local = head(0x04034b50, false);
      parts.push(local, name, bytes);
      central.push(head(0x02014b50, true), name);
      offset += local.length + name.length + bytes.length;
    }
    const size = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.files.length, true); end.setUint16(10, this.files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }
}
