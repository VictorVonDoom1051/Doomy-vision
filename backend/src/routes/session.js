import { Router } from 'express';
import { requireAccessToken } from './../middleware/auth.js';
import { sessionStore } from './../state.js';

export const sessionRouter = Router();

/**
 * POST /session — sección 15.
 * Body: { device_type?, mode? } (mode: real|mock|phone — sección 6)
 */
sessionRouter.post('/session', requireAccessToken, (req, res) => {
  const { device_type, mode } = req.body || {};
  const session = sessionStore.create({
    deviceId: req.deviceId,
    deviceType: device_type,
    mode,
  });
  res.status(201).json(toPublicSession(session));
});

sessionRouter.get('/session/:id', requireAccessToken, (req, res, next) => {
  try {
    const session = sessionStore.get(req.params.id);
    res.json(toPublicSession(session));
  } catch (err) {
    next(err);
  }
});

/** Reset explícito (sección 43 "Reset session"). */
sessionRouter.post('/session/:id/reset', requireAccessToken, (req, res, next) => {
  try {
    const session = sessionStore.get(req.params.id);
    session.history = [];
    session.lastImage = null;
    session.turns = 0;
    res.json(toPublicSession(session));
  } catch (err) {
    next(err);
  }
});

function toPublicSession(session) {
  const activeImage = sessionStore.getActiveImage(session);
  return {
    session_id: session.id,
    device_id: session.deviceId,
    device_type: session.deviceType,
    mode: session.mode,
    created_at: new Date(session.createdAt).toISOString(),
    turns: session.turns,
    has_active_image: !!activeImage,
    active_image_summary: activeImage?.summary || null,
  };
}
