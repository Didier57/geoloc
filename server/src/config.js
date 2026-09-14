import 'dotenv/config';

function boolFromEnv(value) {
  if (value === undefined || value === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const appUrl = process.env.APP_URL || 'http://localhost:8080';

export const config = {
  port: Number(process.env.SERVER_PORT || 4000),
  appUrl,
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret',
  cookieEncKey: process.env.COOKIE_ENC_KEY || '',
  cookieSecure: boolFromEnv(process.env.COOKIE_SECURE) ?? appUrl.startsWith('https://'),
  isProduction: process.env.NODE_ENV === 'production',
  dataFile: process.env.DATA_FILE || './data/geoloc.json',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },
};
