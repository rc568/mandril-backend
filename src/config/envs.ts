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
