import { createApp } from './../src/app.js';
import request from 'supertest';

export function makeApp() {
  return createApp();
}

const V1 = '/api/doomy-vision/v1';

export async function registerDevice(app, deviceId = 'test-device') {
  const res = await request(app)
    .post(`${V1}/device/register`)
    .set('x-doomy-vision-key', process.env.DOOMY_VISION_INTERNAL_KEY)
    .send({ device_id: deviceId });
  return res.body.access_token;
}

export async function createSession(app, token, extra = {}) {
  const res = await request(app)
    .post(`${V1}/session`)
    .set('authorization', `Bearer ${token}`)
    .send(extra);
  return res.body;
}

export const V1_PREFIX = V1;

// 1x1 JPEG válido, para pruebas de subida de imagen.
export const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
