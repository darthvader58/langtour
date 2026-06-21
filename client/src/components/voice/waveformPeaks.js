const DB_FLOOR = -50; // dBFS

export function computePeaks(buffer, width) {
  const bins = Math.max(1, Math.floor(width));
  const samplesPerBin = Math.floor(buffer.length / bins);
  const peaks = [];

  for (let i = 0; i < bins; i++) {
    let peak = 0;
    const start = i * samplesPerBin;
    const end = Math.min(start + samplesPerBin, buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let s = start; s < end; s++) {
        const v = Math.abs(data[s] ?? 0);
        if (v > peak) peak = v;
      }
    }
    peaks.push(peak);
  }

  return peaks.map((v) => {
    if (v <= 0) return 0;
    const db = 20 * Math.log10(v);
    return Math.max(0, Math.min(1, (db - DB_FLOOR) / (-DB_FLOOR)));
  });
}
