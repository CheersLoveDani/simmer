import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { pasta } from '../test/fixtures';
import { Cover } from './Cover';
import { useToasts } from './hooks';
import { Chip, Empty, Segmented, Sheet, Stars, Stepper, Toasts } from './primitives';

describe('Stepper', () => {
  it('steps within its bounds', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper label="Servings" value={2} min={1} max={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    expect(onChange).toHaveBeenLastCalledWith(1);

    rerender(<Stepper label="Servings" value={3} min={1} max={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'More servings' })).toBeDisabled();
    rerender(<Stepper label="Servings" value={1} min={1} max={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Fewer servings' })).toBeDisabled();
  });

  it('shows the formatted value', () => {
    render(<Stepper label="Servings" value={4} onChange={() => {}} format={(v) => `${v} people`} />);
    expect(screen.getByRole('status')).toHaveTextContent('4 people');
  });
});

describe('Stars', () => {
  it('marks the stars up to the rating and reports a tap', async () => {
    const onChange = vi.fn();
    render(<Stars value={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '3 stars' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1 star' })).toHaveClass('is-on');
    expect(screen.getByRole('button', { name: '4 stars' })).not.toHaveClass('is-on');
    await userEvent.click(screen.getByRole('button', { name: '5 stars' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

describe('Segmented and Chip', () => {
  it('reports the chosen segment', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Units"
        value="metric"
        onChange={onChange}
        options={[
          { value: 'metric', label: 'Metric' },
          { value: 'us', label: 'US' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Metric' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'US' }));
    expect(onChange).toHaveBeenCalledWith('us');
  });

  it('exposes a chip as a toggle with its count', async () => {
    const onToggle = vi.fn();
    render(
      <Chip selected count={7} onToggle={onToggle}>
        Vegan
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: /Vegan/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveTextContent('7');
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('Sheet', () => {
  it('is a labelled dialog that closes on Escape and from its close button', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Filters" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveTextContent('Body');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} title="Filters" onClose={() => {}}>
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Toasts', () => {
  it('shows a message and runs its action', async () => {
    const run = vi.fn();
    render(<Toasts />);
    useToasts.getState().push('Added to shopping list', { label: 'View', run });
    expect(await screen.findByText('Added to shopping list')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(run).toHaveBeenCalledOnce();
  });

  it('keeps at most three on screen', () => {
    for (let i = 0; i < 6; i++) useToasts.getState().push(`Message ${i}`);
    expect(useToasts.getState().toasts).toHaveLength(3);
    expect(useToasts.getState().toasts.at(-1)?.message).toBe('Message 5');
  });
});

describe('Empty and Cover', () => {
  it('gives an empty screen a heading and guidance', () => {
    render(
      <Empty icon="heart" title="No favourites yet">
        <p>Tap the heart on any recipe.</p>
      </Empty>,
    );
    expect(screen.getByRole('heading', { name: 'No favourites yet' })).toBeInTheDocument();
    expect(screen.getByText('Tap the heart on any recipe.')).toBeInTheDocument();
  });

  it('draws a decorative cover for a recipe', () => {
    const { container } = render(<Cover recipe={pasta} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelectorAll('ellipse, circle, path, rect').length).toBeGreaterThan(8);
  });
});
