import type { ReactElement } from 'react';
import {
  render,
  type RenderOptions,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type RenderWithRouterOptions = Omit<RenderOptions, 'wrapper'> & {
  route?: string;
};

export function renderWithRouter(
  ui: ReactElement,
  options: RenderWithRouterOptions = {},
) {
  const { route = '/', ...renderOptions } = options;

  return render(
    <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>,
    renderOptions,
  );
}
