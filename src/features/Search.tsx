import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { activeFilterCount, applyFilters, facets, sortRecipes, type Filters, type SortKey } from '../domain/browse';
import { pantryItems, rankByPantry } from '../domain/pantry';
import { AISLES, DIETS, DIFFICULTIES, label, type Difficulty, type Recipe } from '../domain/schema';
import { fold } from '../domain/search';
import { AISLE_LABELS } from '../domain/shopping';
import { useLibrary } from '../store/libraryStore';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { CardGrid, RecipeCard } from '../ui/RecipeCard';
import { toast } from '../ui/hooks';
import { Button, Chip, Empty, Segmented, Sheet } from '../ui/primitives';

const TIMES = [15, 30, 45, 60];
const SORTS: { value: SortKey | 'best'; label: string }[] = [
  { value: 'best', label: 'Best match' },
  { value: 'title', label: 'A to Z' },
  { value: 'quickest', label: 'Quickest' },
  { value: 'easiest', label: 'Easiest' },
  { value: 'newest', label: 'Newest' },
];

const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : []);

function toggled(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function Search() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'pantry' ? 'pantry' : 'recipes';

  const set = (patch: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value == null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="page search">
      <header className="page-head">
        <h1>Search</h1>
        <Segmented
          label="Search by"
          value={mode}
          onChange={(value) => set({ mode: value === 'pantry' ? 'pantry' : null })}
          options={[
            { value: 'recipes', label: 'Recipes' },
            { value: 'pantry', label: 'What I have' },
          ]}
        />
      </header>
      {mode === 'recipes' ? <RecipeSearch params={params} set={set} /> : <PantrySearch />}
    </div>
  );
}

function RecipeSearch({ params, set }: { params: URLSearchParams; set(patch: Record<string, string | null>): void }) {
  const recipes = useLibrary((s) => s.recipes);
  const byId = useLibrary((s) => s.byId);
  const index = useLibrary((s) => s.index);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const query = params.get('q') ?? '';
  const deferredQuery = useDeferredValue(query);
  const filters: Filters = useMemo(
    () => ({
      courses: list(params.get('course')),
      cuisines: list(params.get('cuisine')),
      diets: list(params.get('diet')),
      difficulties: list(params.get('difficulty')) as Difficulty[],
      maxTime: params.get('time') ? Number(params.get('time')) || null : null,
    }),
    [params],
  );
  const sort = (params.get('sort') ?? 'best') as SortKey | 'best';
  const filterCount = activeFilterCount(filters);

  useEffect(() => {
    // Typing anywhere on wide screens should land in the box; on phones the
    // keyboard would cover the results, so wait for a tap.
    if (window.matchMedia('(min-width: 900px)').matches) input.current?.focus();
  }, []);

  const { results, terms, matched } = useMemo(() => {
    const searching = deferredQuery.trim() !== '';
    const hits = searching ? index.search(deferredQuery, 200) : [];
    const pool = searching ? hits.map((h) => byId.get(h.id)).filter((r): r is Recipe => !!r) : recipes;
    const filtered = applyFilters(pool, filters);
    const ordered = sort === 'best' ? (searching ? filtered : sortRecipes(filtered, 'title')) : sortRecipes(filtered, sort);
    return {
      results: ordered,
      terms: [...new Set(hits.flatMap((h) => h.terms))],
      matched: new Map(hits.map((h) => [h.id, h.ingredients])),
    };
  }, [deferredQuery, index, byId, recipes, filters, sort]);

  const courseFacets = useMemo(() => facets(recipes, (r) => r.course), [recipes]);
  const cuisineFacets = useMemo(() => facets(recipes, (r) => r.cuisine), [recipes]);
  const clearFilters = () => set({ course: null, cuisine: null, diet: null, difficulty: null, time: null });

  return (
    <>
      <div className="search-bar">
        <label className="search-field">
          <Icon name="search" size={20} />
          <span className="visually-hidden">Search recipes</span>
          <input
            ref={input}
            type="search"
            value={query}
            placeholder="Try “miso”, “vegan”, or “chicken lemon”"
            onChange={(event) => set({ q: event.target.value })}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="search-clear" aria-label="Clear search" onClick={() => set({ q: null })}>
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
        <button type="button" className={`btn btn-quiet filter-btn ${filterCount ? 'has-filters' : ''}`} onClick={() => setFiltersOpen(true)}>
          <Icon name="filter" size={18} />
          Filters
          {filterCount > 0 && <span className="badge">{filterCount}</span>}
        </button>
      </div>

      <div className="result-bar">
        <p className="muted" data-testid="result-count" aria-live="polite">
          {results.length} {results.length === 1 ? 'recipe' : 'recipes'}
        </p>
        <label className="sort">
          <span className="muted">Sort</span>
          <select value={sort} onChange={(event) => set({ sort: event.target.value === 'best' ? null : event.target.value })}>
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {results.length > 0 ? (
        <CardGrid>
          {results.map((recipe) => {
            const why = matched.get(recipe.id) ?? [];
            return (
              <RecipeCard key={recipe.id} recipe={recipe} terms={terms}>
                {why.length > 0 && <p className="card-why muted">With {why.slice(0, 3).join(', ')}</p>}
              </RecipeCard>
            );
          })}
        </CardGrid>
      ) : (
        <Empty icon="search" title="Nothing matches that">
          <p>Check the spelling, try a single ingredient, or loosen the filters.</p>
          {filterCount > 0 && <Button onClick={clearFilters}>Clear filters</Button>}
        </Empty>
      )}

      <Sheet
        open={filtersOpen}
        title="Filters"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <Button variant="plain" onClick={clearFilters} disabled={filterCount === 0}>
              Clear all
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              Show {results.length} {results.length === 1 ? 'recipe' : 'recipes'}
            </Button>
          </>
        }
      >
        <FilterGroup title="Ready in">
          {TIMES.map((minutes) => (
            <Chip key={minutes} selected={filters.maxTime === minutes} onToggle={() => set({ time: filters.maxTime === minutes ? null : String(minutes) })}>
              {minutes} min or less
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup title="Diet">
          {DIETS.map((diet) => (
            <Chip key={diet} selected={filters.diets.includes(diet)} onToggle={() => set({ diet: toggled(filters.diets, diet).join(',') })}>
              {label(diet)}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup title="Course">
          {courseFacets.map((facet) => (
            <Chip key={facet.value} count={facet.count} selected={filters.courses.includes(facet.value)} onToggle={() => set({ course: toggled(filters.courses, facet.value).join(',') })}>
              {label(facet.value)}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup title="Difficulty">
          {DIFFICULTIES.map((difficulty) => (
            <Chip
              key={difficulty}
              selected={filters.difficulties.includes(difficulty)}
              onToggle={() => set({ difficulty: toggled(filters.difficulties, difficulty).join(',') })}
            >
              {label(difficulty)}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup title="Cuisine">
          {cuisineFacets.map((facet) => (
            <Chip key={facet.value} count={facet.count} selected={filters.cuisines.includes(facet.value)} onToggle={() => set({ cuisine: toggled(filters.cuisines, facet.value).join(',') })}>
              {label(facet.value)}
            </Chip>
          ))}
        </FilterGroup>
      </Sheet>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      <div className="chip-wrap">{children}</div>
    </fieldset>
  );
}

function PantrySearch() {
  const recipes = useLibrary((s) => s.recipes);
  const pantry = useUser((s) => s.pantry);
  const togglePantry = useUser((s) => s.togglePantry);
  const clearPantry = useUser((s) => s.clearPantry);
  const addManualItem = useUser((s) => s.addManualItem);
  const [find, setFind] = useState('');

  const items = useMemo(() => pantryItems(recipes), [recipes]);
  const have = useMemo(() => new Set(pantry), [pantry]);
  const matches = useMemo(() => rankByPantry(recipes, have), [recipes, have]);

  const needle = fold(find.trim());
  const visible = needle ? items.filter((item) => fold(item.key).includes(needle)) : items;
  const groups = AISLES.map((aisle) => ({ aisle, items: visible.filter((item) => item.aisle === aisle).sort((a, b) => a.key.localeCompare(b.key)) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <div className="pantry">
      <section className="pantry-picker" aria-label="Your ingredients">
        <div className="pantry-picker-head">
          <label className="search-field">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Find an ingredient</span>
            <input type="search" value={find} placeholder="Find an ingredient" onChange={(event) => setFind(event.target.value)} autoComplete="off" />
          </label>
          {pantry.length > 0 && (
            <Button variant="plain" onClick={clearPantry}>
              Clear {pantry.length}
            </Button>
          )}
        </div>
        <div className="pantry-groups">
          {groups.map((group) => (
            <fieldset key={group.aisle} className="filter-group">
              <legend>{AISLE_LABELS[group.aisle]}</legend>
              <div className="chip-wrap">
                {group.items.map((item) => (
                  <Chip key={item.key} selected={have.has(item.key)} onToggle={() => togglePantry(item.key)}>
                    {label(item.key)}
                  </Chip>
                ))}
              </div>
            </fieldset>
          ))}
          {groups.length === 0 && <p className="muted">No ingredient called “{find}” in the library.</p>}
        </div>
      </section>

      <section className="pantry-results" aria-label="Recipes you can make">
        {pantry.length === 0 ? (
          <Empty icon="basket" title="Tick what is in your kitchen">
            <p>Simmer ranks every recipe by how much of it you already have. Salt, pepper and water are assumed.</p>
          </Empty>
        ) : matches.length === 0 ? (
          <Empty icon="search" title="No recipe uses those yet">
            <p>Add a few more ingredients.</p>
          </Empty>
        ) : (
          <>
            <p className="muted" data-testid="pantry-count">
              {matches.length} {matches.length === 1 ? 'recipe uses' : 'recipes use'} what you have
            </p>
            <CardGrid>
              {matches.map((match) => (
                <div key={match.recipe.id} className="pantry-match">
                  <RecipeCard recipe={match.recipe}>
                    <div className="coverage" aria-hidden="true">
                      <span style={{ width: `${Math.round(match.coverage * 100)}%` }} />
                    </div>
                    <p className="card-why muted">
                      {match.missing.length === 0
                        ? 'You have everything'
                        : `Missing ${match.missing.slice(0, 3).join(', ')}${match.missing.length > 3 ? ` and ${match.missing.length - 3} more` : ''}`}
                    </p>
                  </RecipeCard>
                  {match.missing.length > 0 && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        match.missing.forEach((name) => addManualItem(label(name)));
                        toast(`Added ${match.missing.length} to your shopping list`);
                      }}
                    >
                      Add missing to shopping list
                    </button>
                  )}
                </div>
              ))}
            </CardGrid>
          </>
        )}
      </section>
    </div>
  );
}
