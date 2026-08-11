/** Hapus ANSI / VT escape sequences agar log di UI tetap plain text. */
export const stripAnsi = (input) => {
  const text = String(input);
  return (
    text
      // CSI (warna, bold, cursor, dll): ESC [ ... final-byte
      .replace(/\u001b\[[\d;?]*[ -/]*[@-~]/g, "")
      // OSC: ESC ] ... BEL atau ST
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
      // Single-char escapes (charset, dll)
      .replace(/\u001b[@-Z\\-_]/g, "")
      // C1 CSI (0x9B)
      .replace(/\u009b[\d;?]*[ -/]*[@-~]/g, "")
      // Sisa CR dari progress/spinner
      .replace(/\r/g, "")
  );
};

export class LogBuffer {
  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.buffers = new Map();
  }

  #ensure(projectId) {
    if (!this.buffers.has(projectId)) {
      this.buffers.set(projectId, []);
    }
    return this.buffers.get(projectId);
  }

  append(projectId, line, stream = "stdout") {
    const list = this.#ensure(projectId);
    const entry = {
      line: stripAnsi(line).replace(/\n$/g, ""),
      stream,
      ts: Date.now(),
    };
    list.push(entry);
    if (list.length > this.maxSize) {
      list.splice(0, list.length - this.maxSize);
    }
    return entry;
  }

  get(projectId, limit = 500) {
    const list = this.#ensure(projectId);
    if (!limit || limit >= list.length) return [...list];
    return list.slice(-limit);
  }

  clear(projectId) {
    this.buffers.set(projectId, []);
  }
}
