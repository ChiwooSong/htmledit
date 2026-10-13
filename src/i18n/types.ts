import type { en } from './en';

export type MessageKey = keyof typeof en;
export type Catalog = { [K in MessageKey]: string };
type Slots<S extends string> = S extends `${string}{${infer P}}${infer R}` ? P | Slots<R> : never;
export type Params<K extends MessageKey> = Record<Slots<(typeof en)[K]>, string | number>;
export type Arguments<K extends MessageKey> = [Slots<(typeof en)[K]>] extends [never]
  ? []
  : [params: Params<K>];
export type Message = { [K in MessageKey]: { key: K; params: Params<K> } }[MessageKey];
export type DisplayMessage = Message | string;
