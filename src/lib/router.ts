import { useEffect, useState } from 'react';
import { getAppBasePath } from './formatters';

export function stripBasePath(fullPathname: string, overrideBase?: string): string {
  const base = getAppBasePath(overrideBase);
  if (base === '/') return fullPathname || '/';
  const baseNoTrailing = base.slice(0, -1);
  if (fullPathname === baseNoTrailing || fullPathname === base) {
    return '/';
  }
  if (fullPathname.startsWith(base)) {
    const rest = fullPathname.slice(base.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return fullPathname || '/';
}

export function toAppUrl(to: string, overrideBase?: string): string {
  const base = getAppBasePath(overrideBase);
  if (base === '/') return to || '/';
  const baseNoTrailing = base.slice(0, -1);
  if (to === baseNoTrailing || to.startsWith(`${baseNoTrailing}/`) || to.startsWith(`${baseNoTrailing}?`)) {
    return to;
  }
  if (to === '/' || to === '') {
    return base;
  }
  if (to.startsWith('/')) {
    return `${base}${to.slice(1)}`;
  }
  return `${base}${to}`;
}

function restoreGitHubPagesRedirect() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const redirected = params.get('p');
  if (redirected && redirected.startsWith('/') && !redirected.startsWith('//')) {
    window.history.replaceState(null, '', toAppUrl(redirected));
  }
}

restoreGitHubPagesRedirect();

export function navigate(to: string) {
  const targetUrl = toAppUrl(to);
  if (window.location.pathname + window.location.search === targetUrl) return;
  window.history.pushState({}, '', targetUrl);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function useRoute() {
  const [locationState, setLocationState] = useState(() => ({
    pathname: stripBasePath(window.location.pathname),
    search: window.location.search,
  }));

  useEffect(() => {
    const onPop = () => {
      setLocationState({
        pathname: stripBasePath(window.location.pathname),
        search: window.location.search,
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return locationState;
}
