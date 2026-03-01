import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SchemaPreview } from './schema-preview';

describe('SchemaPreview', () => {
  it('shows successful validation text', () => {
    render(<SchemaPreview />);

    expect(screen.getByText('Shared schema status')).toBeInTheDocument();
    expect(screen.getByText('Sample payload is valid.')).toBeInTheDocument();
  });
});
