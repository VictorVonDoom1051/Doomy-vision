import { Router } from 'express';
import { verifyInternalKey, signAccessToken } from './../middleware/auth.js';
import { requireFields } from './../middleware/validate.js';
import { config } from './../config.js';

export const deviceRouter = Router();

/**
 * POST /device/register — sección 27.
 * Body: { device_id, device_type? }
 * Header: x-doomy-vision-key: <DOOMY_VISION_INTERNAL_KEY>
 * -> { access_token, expires_in_min, device_id }
 */
deviceRouter.post('/device/register', verifyInternalKey, (req, res, next) => {
  try {
    requireFields(req.body || {}, ['device_id']);
    const { device_id, device_type } = req.body;
    const token = signAccessToken({ deviceId: device_id });
    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in_min: config.auth.accessTokenTtlMin,
      device_id,
      device_type: device_type || 'rayban_meta',
    });
  } catch (err) {
    next(err);
  }
});
