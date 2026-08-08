import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter } from './render';

describe('frontend test harness', () => {
  it('renders accessible content', () => {
    renderWithRouter(<main aria-label="auction application" />);

    expect(
      screen.getByRole('main', { name: 'auction application' }),
    ).toBeInTheDocument();
  });
});
