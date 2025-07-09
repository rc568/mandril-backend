import 'dotenv/config';
import { get } from 'env-var';

export default {
  PORT: get('PORT').required().asPortNumber(),
  PUBLIC_URL: get('PUBLIC_URL').required().asUrlString(),
};
