import { useEffect, useState } from 'preact/hooks';

/** Hash-router: werkt op GitHub Pages zonder serverconfig. */
export function parseHash(hash: string): { route: string; params: string[] } {
  const clean = hash.replace(/^#\/?/, '');
  const [route = '', ...params] = clean.split('/').filter(Boolean);
  return { route: route || 'vandaag', params: params.map(decodeURIComponent) };
}

export function useRoute() {
  const [state, setState] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setState(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return state;
}

export function go(path: string) {
  location.hash = `#/${path.replace(/^\//, '')}`;
}
