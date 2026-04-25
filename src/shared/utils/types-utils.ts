export type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never;

export type DistributivePick<T, K extends keyof any> = T extends unknown ? Pick<T, Extract<keyof T, K>> : never;
