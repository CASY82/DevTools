import { LocalAdapter } from './local.js';
import { GasAdapter } from './gas.js';

export const ADAPTERS = [LocalAdapter, GasAdapter];

/** 설정값으로부터 어댑터 인스턴스를 만든다. 실패 시 로컬로 안전하게 되돌린다. */
export function createAdapter(settings) {
  const Cls = ADAPTERS.find((a) => a.id === settings.adapter) || LocalAdapter;
  return Cls === GasAdapter
    ? new GasAdapter({ endpoint: settings.gasEndpoint, token: settings.gasToken, session: settings.authSession })
    : new LocalAdapter({ namespace: settings.namespace });
}

export { LocalAdapter, GasAdapter };
export * from './base.js';
