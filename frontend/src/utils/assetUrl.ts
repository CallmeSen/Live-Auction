const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:8000/api/v1';

export const resolveBackendAssetUrl = (
  assetUrl: string | null | undefined,
): string | null => {
  if (!assetUrl) return null;

  if (
    assetUrl.startsWith('http://') ||
    assetUrl.startsWith('https://') ||
    assetUrl.startsWith('blob:') ||
    assetUrl.startsWith('data:')
  ) {
    return assetUrl;
  }

  try {
    const backendOrigin = new URL(
      apiBaseUrl,
      window.location.origin,
    ).origin;

    return new URL(assetUrl, backendOrigin).toString();
  } catch {
    return assetUrl;
  }
};
