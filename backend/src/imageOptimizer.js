import sharp from 'sharp';
import { config } from './config.js';
import { VisionError } from './errors.js';

/**
 * ImageOptimizer (sección 40).
 * No manda imágenes originales enormes: redimensiona al lado largo
 * configurado y comprime a JPEG con calidad configurable. Todos los
 * valores vienen de config (env), nunca hardcodeados.
 */
export async function optimizeImage(buffer, { longEdgePx, quality } = {}) {
  const targetLongEdge = longEdgePx ?? config.limits.visionMaxLongEdgePx;
  const targetQuality = quality ?? config.limits.visionJpegQuality;
  const originalBytes = buffer.length;
  const t0 = Date.now();

  let image;
  try {
    image = sharp(buffer, { failOn: 'none' });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      throw new VisionError('No se pudo leer la imagen (formato no soportado o corrupta)');
    }

    const longEdge = Math.max(meta.width, meta.height);
    const resizeOpts = longEdge > targetLongEdge
      ? (meta.width >= meta.height ? { width: targetLongEdge } : { height: targetLongEdge })
      : null;

    let pipeline = image.rotate(); // respeta EXIF orientation
    if (resizeOpts) pipeline = pipeline.resize(resizeOpts);
    pipeline = pipeline.jpeg({ quality: targetQuality, mozjpeg: true });

    const output = await pipeline.toBuffer({ resolveWithObject: true });
    const compressionMs = Date.now() - t0;

    return {
      buffer: output.data,
      mime: 'image/jpeg',
      width: output.info.width,
      height: output.info.height,
      original_bytes: originalBytes,
      compressed_bytes: output.data.length,
      compression_ms: compressionMs,
    };
  } catch (err) {
    if (err instanceof VisionError) throw err;
    throw new VisionError('Fallo al optimizar la imagen', { cause: err });
  }
}

/** Miniatura pequeña para diagnósticos / dev console (no para el LLM). */
export async function makeThumbnail(buffer, { size = 96 } = {}) {
  try {
    const out = await sharp(buffer).rotate().resize(size, size, { fit: 'inside' }).jpeg({ quality: 60 }).toBuffer();
    return out.toString('base64');
  } catch {
    return null;
  }
}
