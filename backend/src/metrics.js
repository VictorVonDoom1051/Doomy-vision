// Métricas básicas en memoria (sección 25). No requiere plataforma externa;
// extensible más adelante (Prometheus, etc.) sin cambiar el contrato de
// /diagnostics.

function pctl(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

class Metrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.latencies = { total: [], stt: [], vision: [], llm: [], tts: [] };
    this.cameraFailures = 0;
    this.audioRouteFailures = 0;
    this.reconnections = 0;
    this.startedAt = Date.now();
  }

  recordRequest({ success, totalMs, sttMs, visionMs, llmMs, ttsMs }) {
    this.totalRequests += 1;
    if (success) this.successCount += 1; else this.failureCount += 1;
    if (totalMs != null) this._push('total', totalMs);
    if (sttMs != null) this._push('stt', sttMs);
    if (visionMs != null) this._push('vision', visionMs);
    if (llmMs != null) this._push('llm', llmMs);
    if (ttsMs != null) this._push('tts', ttsMs);
  }

  recordCameraFailure() { this.cameraFailures += 1; }
  recordAudioRouteFailure() { this.audioRouteFailures += 1; }
  recordReconnection() { this.reconnections += 1; }

  _push(bucket, value) {
    const arr = this.latencies[bucket];
    arr.push(value);
    if (arr.length > 500) arr.shift(); // ventana acotada
  }

  _avg(arr) {
    if (arr.length === 0) return null;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  snapshot() {
    const successRate = this.totalRequests > 0 ? this.successCount / this.totalRequests : null;
    const sortedTotal = [...this.latencies.total].sort((a, b) => a - b);
    return {
      uptime_s: Math.round((Date.now() - this.startedAt) / 1000),
      total_requests: this.totalRequests,
      success_count: this.successCount,
      failure_count: this.failureCount,
      success_rate: successRate,
      average_latency_ms: this._avg(this.latencies.total),
      p50_latency_ms: pctl(sortedTotal, 50),
      p95_latency_ms: pctl(sortedTotal, 95),
      stt_latency_ms: this._avg(this.latencies.stt),
      vision_latency_ms: this._avg(this.latencies.vision),
      llm_latency_ms: this._avg(this.latencies.llm),
      tts_latency_ms: this._avg(this.latencies.tts),
      camera_failures: this.cameraFailures,
      audio_route_failures: this.audioRouteFailures,
      reconnections: this.reconnections,
    };
  }
}

export const metrics = new Metrics();
