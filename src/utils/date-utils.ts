export const getMilisecondDifference = (startDate: string, endDate: string) => {
  const a = new Date(startDate);
  const b = new Date(endDate);
  return Math.abs(a.getTime() - b.getTime());
};
