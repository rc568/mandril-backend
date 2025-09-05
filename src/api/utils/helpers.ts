export const objectValueToBoolean = (obj: Record<string, any>): Record<string, boolean> => {
  const newObj: Record<string, boolean> = {};
  for (const key of Object.keys(obj)) {
    newObj[key] = true;
  }
  return newObj;
};

export const isValueSerialSmall = (num: number): boolean => {
  if (Number.isInteger(num) && num > 0 && num < 32768) return true;
  return false;
};
