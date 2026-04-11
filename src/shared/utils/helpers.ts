export const isValueSerialSmall = (num: number): boolean => {
  if (Number.isInteger(num) && num > 0 && num < 32768) return true;
  return false;
};

export const isValidSlug = (slug: string, maxLength: number = 50): boolean => {
  const slugRegex = /^[0-9a-z-]+$/;
  return slugRegex.test(slug) && slug.length <= maxLength;
};

export const isOneOf = <T extends readonly unknown[]>(value: unknown, allowedValues: T): value is T[number] => {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return false;
  }
  return allowedValues.includes(value as T[number]);
};
