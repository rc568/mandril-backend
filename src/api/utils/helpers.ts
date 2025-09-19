export const createColumnReferences = <T extends Record<string, true>>(
  booleanColumns: T,
  tableColumns: Record<keyof T, any>,
): { [K in keyof T]: any } => {
  const result = {} as { [K in keyof T]: any };
  for (const key in booleanColumns) {
    result[key] = tableColumns[key];
  }

  return result;
};

export const isValueSerialSmall = (num: number): boolean => {
  if (Number.isInteger(num) && num > 0 && num < 32768) return true;
  return false;
};

export const isValidSlug = (slug: string, maxLength: number = 50): boolean => {
  const slugRegex = /^[0-9a-z-]+$/;
  return slugRegex.test(slug) && slug.length <= maxLength;
};
