import { useState } from 'react';
import useAuth from '../../hooks/useAuth';
import { runtimeConfig } from '../../config/runtime';
import { createCatalogApi, type CatalogApi } from './catalogApi';
import { createRestClient } from './restClient';

export function useCatalogApi(provided?: CatalogApi): CatalogApi {
  const { getIdToken, logout } = useAuth();
  const [defaultApi] = useState(() => createCatalogApi(
    createRestClient(runtimeConfig, getIdToken, logout),
  ));
  return provided ?? defaultApi;
}
