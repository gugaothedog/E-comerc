export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const num = bytes / Math.pow(1024, i);
  return `${num.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function formatDateTime(ts: unknown): string {
  if (!ts) return '—';
  let date: Date;
  if (typeof ts === 'number') {
    date = new Date(ts);
  } else if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    date = (ts as { toDate: () => Date }).toDate();
  } else if (ts instanceof Date) {
    date = ts;
  } else {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function sanitizeId(text: string): string {
  return text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function getAppBasePath(overrideBase?: string): string {
  const raw =
    overrideBase ??
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/');
  if (!raw || raw === '/') return '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export function resolveAssetUrl(url: string, overrideBase?: string): string {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const base = getAppBasePath(overrideBase);
  if (base === '/') return url;
  if (url.startsWith(base)) return url;
  if (url.startsWith('/')) {
    return `${base}${url.slice(1)}`;
  }
  return `${base}${url}`;
}

export function isValidSafeUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/src/assets/') || url.startsWith('/E-comerc/src/assets/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  pagamento_aprovado: 'Pagamento aprovado',
  em_preparacao: 'Em preparação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};
