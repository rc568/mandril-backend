import { expect } from 'vitest';
import type { ZodSafeParseResult } from 'zod';
import type { $ZodIssue } from 'zod/v4/core';

const joinErrors = (arr: Array<$ZodIssue>) => arr.map((v) => v.path.join('/'));

export const expectZodError = <T>(result: ZodSafeParseResult<T>, path: string) => {
  expect(result.success).toBe(false);
  expect(joinErrors(result.error?.issues ?? [])).toContain(path);
};
