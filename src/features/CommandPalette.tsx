import { AnimatePresence, motion } from 'motion/react';
import { useBackToClose } from '../ui/back';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatMinutes } from '../domain/quantity';
import { useLibrary } from '../store/libraryStore';
import { Icon, type IconName } from '../ui/Icon';
import { Highlighted } from '../ui/RecipeCard';
import { useKey } from '../ui/hooks';

interface Entry {
  key: string;
  title: string;
  hint?: string;
  icon: IconName;
  to: string;
  terms?: string[];
}

const PLACES: Entry[] = [
  { key: 'go-home', title: 'Home', icon: 'home', to: '/' },
  { key: 'go-search', title: 'Search', icon: 'search', to: '/search' },
  { key: 'go-pantry', title: 'What can I make with what I have?', icon: 'basket', to: '/search?mode=pantry' },
  { key: 'go-plan', title: 'Meal plan', icon: 'calendar', to: '/plan' },
  { key: 'go-shopping', title: 'Shopping list', icon: 'basket', to: '/shopping' },
  { key: 'go-saved', title: 'Saved', icon: 'heart', to: '/saved' },
  { key: 'go-settings', title: 'Settings', icon: 'settings', to: '/settings' },
];

/** Ctrl/Cmd+K: jump to any recipe or screen from the keyboard. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const index = useLibrary((s) => s.index);
  const byId = useLibrary((s) => s.byId);
  const listRef = useRef<HTMLUListElement>(null);

  useKey((event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setOpen((value) => !value);
    } else if (event.key === 'Escape' && open) {
      setOpen(false);
    }
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return PLACES;
    const recipes = index.search(query, 8).flatMap((hit) => {
      const recipe = byId.get(hit.id);
      if (!recipe) return [];
      const hint = hit.ingredients.length ? `With ${hit.ingredients.slice(0, 2).join(', ')}` : formatMinutes(recipe.time.total);
      return [{ key: recipe.id, title: recipe.title, hint, icon: 'pot' as const, to: `/recipe/${recipe.id}`, terms: hit.terms }];
    });
    const places = PLACES.filter((place) => place.title.toLowerCase().includes(trimmed));
    // A screen named outright is what was meant; recipes follow.
    return [...places, ...recipes, { key: 'search-all', title: `Search for “${query.trim()}”`, icon: 'search', to: `/search?q=${encodeURIComponent(query.trim())}` }];
  }, [query, index, byId]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    navigate(entry.to);
  };

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <AnimatePresence>
      {open && (
        <div className="palette-layer">
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onClick={() => setOpen(false)} />
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Go to"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          >
            <label className="palette-input">
              <Icon name="search" size={20} />
              <span className="visually-hidden">Go to a recipe or screen</span>
              <input
                autoFocus
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={entries[cursor] ? `palette-${entries[cursor].key}` : undefined}
                value={query}
                placeholder="Find a recipe or go somewhere"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setCursor((c) => Math.min(entries.length - 1, c + 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    choose(entries[cursor]);
                  }
                }}
              />
              <kbd>Esc</kbd>
            </label>
            <ul id="palette-list" ref={listRef} role="listbox" className="palette-list">
              {entries.map((entry, i) => (
                <li
                  key={entry.key}
                  id={`palette-${entry.key}`}
                  role="option"
                  aria-selected={i === cursor}
                  className={`palette-item ${i === cursor ? 'is-active' : ''}`}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => choose(entry)}
                >
                  <Icon name={entry.icon} size={18} />
                  <span className="palette-title">
                    <Highlighted text={entry.title} terms={entry.terms} />
                  </span>
                  {entry.hint && <span className="muted palette-hint">{entry.hint}</span>}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
