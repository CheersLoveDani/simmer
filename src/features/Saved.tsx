import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatDay, toISODate } from '../domain/planner';
import type { Recipe } from '../domain/schema';
import { useLibrary } from '../store/libraryStore';
import { useUser } from '../store/userStore';
import { CardGrid, RecipeCard } from '../ui/RecipeCard';
import { toast } from '../ui/hooks';
import { Button, Empty, IconButton, PageHeader, Segmented } from '../ui/primitives';

type Tab = 'favourites' | 'collections' | 'cooked';

export function Saved() {
  const [params, setParams] = useSearchParams();
  const tab = (['favourites', 'collections', 'cooked'].includes(params.get('tab') ?? '') ? params.get('tab') : 'favourites') as Tab;
  const collectionId = params.get('collection');

  return (
    <div className="page saved">
      <PageHeader title="Saved">
        <Segmented
          label="Show"
          value={tab}
          onChange={(value) => setParams(value === 'favourites' ? {} : { tab: value }, { replace: true })}
          options={[
            { value: 'favourites', label: 'Favourites' },
            { value: 'collections', label: 'Collections' },
            { value: 'cooked', label: 'Cooked' },
          ]}
        />
      </PageHeader>
      {tab === 'favourites' && <Favourites />}
      {tab === 'collections' && (collectionId ? <CollectionView id={collectionId} /> : <Collections />)}
      {tab === 'cooked' && <Cooked />}
    </div>
  );
}

function useKnown(ids: string[]): Recipe[] {
  const byId = useLibrary((s) => s.byId);
  return ids.map((id) => byId.get(id)).filter((r): r is Recipe => r !== undefined);
}

function Favourites() {
  const recipes = useKnown(useUser((s) => s.favourites));
  if (recipes.length === 0) {
    return (
      <Empty icon="heart" title="No favourites yet">
        <p>Tap the heart on any recipe and it will wait for you here.</p>
        <Link to="/search" className="btn btn-quiet">
          Browse recipes
        </Link>
      </Empty>
    );
  }
  return (
    <CardGrid>
      {[...recipes].reverse().map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </CardGrid>
  );
}

function Collections() {
  const collections = useUser((s) => s.collections);
  const createCollection = useUser((s) => s.createCollection);
  const [name, setName] = useState('');
  return (
    <>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (createCollection(name)) setName('');
        }}
      >
        <input type="text" value={name} placeholder="New collection name" aria-label="New collection name" onChange={(event) => setName(event.target.value)} />
        <Button type="submit" variant="primary" icon="plus" disabled={name.trim() === ''}>
          Create
        </Button>
      </form>
      {collections.length === 0 ? (
        <Empty icon="folder" title="No collections yet">
          <p>Group recipes however suits you: Sunday lunches, quick lunches, bakes to try.</p>
        </Empty>
      ) : (
        <ul className="collection-list">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link to={`/saved?tab=collections&collection=${collection.id}`} className="collection-link">
                <span>{collection.name}</span>
                <span className="muted tabular">{collection.recipeIds.length}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CollectionView({ id }: { id: string }) {
  const collection = useUser((s) => s.collections.find((c) => c.id === id));
  const deleteCollection = useUser((s) => s.deleteCollection);
  const renameCollection = useUser((s) => s.renameCollection);
  const recipes = useKnown(collection?.recipeIds ?? []);
  const [, setParams] = useSearchParams();
  const back = () => setParams({ tab: 'collections' }, { replace: true });

  if (!collection) {
    return (
      <Empty icon="folder" title="That collection has gone">
        <Button onClick={back}>All collections</Button>
      </Empty>
    );
  }
  return (
    <>
      <div className="collection-head">
        <IconButton icon="back" label="All collections" onClick={back} />
        <input className="title-input" aria-label="Collection name" defaultValue={collection.name} onBlur={(event) => renameCollection(id, event.target.value)} />
        <IconButton
          icon="trash"
          label="Delete collection"
          onClick={() => {
            deleteCollection(id);
            toast(`Deleted “${collection.name}”`);
            back();
          }}
        />
      </div>
      {recipes.length === 0 ? (
        <Empty icon="folder" title="Nothing in here yet">
          <p>Open a recipe and use the folder button to add it.</p>
        </Empty>
      ) : (
        <CardGrid>
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </CardGrid>
      )}
    </>
  );
}

function Cooked() {
  const cooked = useUser((s) => s.cooked);
  const removeCooked = useUser((s) => s.removeCooked);
  const byId = useLibrary((s) => s.byId);
  const today = toISODate(new Date());
  const entries = [...cooked].sort((a, b) => b.date.localeCompare(a.date));

  if (entries.length === 0) {
    return (
      <Empty icon="pot" title="Your cooking log is empty">
        <p>Finish a recipe in cook mode, or tap “I cooked this”, and it is recorded here.</p>
      </Empty>
    );
  }
  return (
    <ul className="log">
      {entries.map((entry) => {
        const recipe = byId.get(entry.recipeId);
        const day = formatDay(entry.date, today);
        return (
          <li key={`${entry.recipeId}-${entry.date}`} className="log-row">
            <span className="log-date muted tabular">{day.isToday ? 'Today' : `${day.weekday} ${day.day}`}</span>
            {recipe ? (
              <Link to={`/recipe/${recipe.id}`} viewTransition className="log-title">
                {recipe.title}
              </Link>
            ) : (
              <span className="log-title muted">A recipe no longer in the library</span>
            )}
            <IconButton icon="close" label="Remove from log" onClick={() => removeCooked(entry.recipeId, entry.date)} />
          </li>
        );
      })}
    </ul>
  );
}
