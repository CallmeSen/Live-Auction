const MEDIA_KEY_PREFIX = 'items/';

export function mediaUrlForKey(
  mediaBaseUrl: string,
  imageKey: string | undefined,
): string | null {
  if (
    !imageKey
    || !imageKey.startsWith(MEDIA_KEY_PREFIX)
    || imageKey.includes('?')
    || imageKey.includes('#')
    || imageKey.includes('\\')
  ) {
    return null;
  }

  const segments = imageKey.split('/');
  if (
    segments.length !== 4
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return null;
  }

  try {
    const base = new URL(`${mediaBaseUrl.replace(/\/+$/, '')}/`);
    base.pathname += segments.map(encodeURIComponent).join('/');
    return base.toString();
  } catch {
    return null;
  }
}
