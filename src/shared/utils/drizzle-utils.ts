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
