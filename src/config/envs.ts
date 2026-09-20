import 'dotenv/config';
import { get } from 'env-var';
import type { StringValue } from 'ms';

const parseJwtDuration = (duration: string): number | StringValue => {
  if (/^\d+$/.test(duration)) {
    return Number.parseInt(duration);
  }
  return duration as StringValue;
};

const envs = {
  STORAGE_BUCKET: get('STORAGE_BUCKET').asString(),
  STORAGE_REGION: get('STORAGE_REGION').asString(),
  STORAGE_ENDPOINT: get('STORAGE_ENDPOINT').asUrlString(),
  STORAGE_PUBLIC_URL: get('STORAGE_PUBLIC_URL').asUrlString(),
  STORAGE_ACCESS_KEY_ID: get('STORAGE_ACCESS_KEY_ID').asString(),
  STORAGE_SECRET_ACCESS_KEY: get('STORAGE_SECRET_ACCESS_KEY').asString(),
  PORT: get('PORT').required().asPortNumber(),
  PUBLIC_URL: get('PUBLIC_URL').required().asUrlString(),
  DATABASE_URL: get('DATABASE_URL').required().asString(),
  NODE_ENV: get('NODE_ENV').required().asEnum(['production', 'development']),
  JWT_SECRET_KEY: get('JWT_SECRET_KEY').required().asString(),
  JWT_REFRESH_SECRET_KEY: get('JWT_REFRESH_SECRET_KEY').required().asString(),
  JWT_DURATION: parseJwtDuration(get('JWT_DURATION').required().asString()),
  JWT_REFRESH_DURATION: parseJwtDuration(get('JWT_REFRESH_DURATION').required().asString()),
};

export default envs;
