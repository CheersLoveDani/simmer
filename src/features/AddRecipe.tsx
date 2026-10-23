import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { draftFromRecipe, draftSchema, emptyDraft, type RecipeDraft } from '../domain/draft';
import { findPhoto } from '../import/photos';
import { draftRecipe, getApiKey } from '../import/assistant';
import { readRecipePage } from '../import/recipePage';
import { kvDelete, kvGet, kvSet } from '../store/db';
import { MINE } from '../store/recipeStore';
import { useRecipe } from '../store/libraryStore';
import { Icon, type IconName } from '../ui/Icon';
import { goBack } from '../ui/back';
import { useWide } from '../ui/hooks';
import { Button, IconButton, PageHeader } from '../ui/primitives';
import { RecipeEditor, type EditorPhoto } from './RecipeEditor';

const NEW_DRAFT_KEY = 'simmer.draft';

function Choice({ icon, title, lead, to }: { icon: IconName; title: string; lead: string; to: string }) {
  return (
    <Link to={to} className="add-choice">
      <span className="add-choice-icon">
        <Icon name={icon} size={24} />
      </span>
      <span className="add-choice-text">
        <span className="add-choice-title">{title}</span>
        <span className="muted">{lead}</span>
      </span>
      <Icon name="forward" size={18} />
    </Link>
  );
}

function EditorPage({ title, children }: { title: string; children: React.ReactNode }) {
  const wide = useWide();
  const navigate = useNavigate();
  return (
    <div className="page add-page">
      <div className="settings-title">
        {!wide && <IconButton icon="back" label="Back" onClick={() => (goBack() ? undefined : navigate('/'))} />}
        <PageHeader title={title} />
      </div>
      {children}
    </div>
  );
}

/** `/add`: the ways in to a new recipe. */
export function AddRecipe() {
  // undefined while checking for a recipe found earlier and not yet saved.
  const [found, setFound] = useState<Found | null | undefined>(undefined);
  const apiKey = useApiKey();

  useEffect(() => {
    let live = true;
    void loadFound().then((value) => live && setFound(value));
    return () => {
      live = false;
    };
  }, []);

  const take = (next: Found) => {
    void keepFound(next);
    setFound(next);
  };
  const discard = () => {
    void keepFound(null);
    setFound(null);
  };

  if (found === undefined) return null;
  if (found) {
    return (
      <EditorPage title="Check and save">
        <p className="muted">Here is what Simmer found. Look it over, change anything you like, then save it on the last step.</p>
        <RecipeEditor initial={found.draft} draftKey={FOUND_DRAFT_KEY} onStartAgain={discard} onSaved={() => void keepFound(null)} {...(found.photo ? { photo: found.photo } : {})} />
      </EditorPage>
    );
  }
  return (
    <EditorPage title="Add a recipe">
      <FromLink onFound={take} apiKey={apiKey} />
      <Describe onFound={take} apiKey={apiKey} />
      <div className="add-choices">
        <Choice icon="edit" title="Fill it in yourself" lead="A step-by-step form: basics, ingredients, method." to="/add/new" />
      </div>
    </EditorPage>
  );
}

type Found = { draft: RecipeDraft; photo?: EditorPhoto };

// A recipe found from a link or written by the assistant is kept until it is
// saved or thrown away, so leaving the page by accident does not lose it (or
// cost another assistant request). The text lives with the editor's draft;
// the photo, being a file, in the device's own storage.
const FOUND_DRAFT_KEY = 'simmer.draft.found';
const FOUND_PHOTO_KEY = 'draft.photo';

async function keepFound(found: Found | null): Promise<void> {
  try {
    if (found) sessionStorage.setItem(FOUND_DRAFT_KEY, JSON.stringify(found.draft));
    else sessionStorage.removeItem(FOUND_DRAFT_KEY);
  } catch {
    // Storage can be unavailable; the editor still works.
  }
  if (found?.photo) await kvSet(FOUND_PHOTO_KEY, found.photo);
  else await kvDelete(FOUND_PHOTO_KEY);
}

async function loadFound(): Promise<Found | null> {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(FOUND_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!saved) return null;
  const parsed = draftSchema.safeParse(JSON.parse(saved));
  if (!parsed.success) return null;
  const photo = await kvGet<EditorPhoto>(FOUND_PHOTO_KEY).catch(() => undefined);
  return photo?.blob ? { draft: parsed.data, photo } : { draft: parsed.data };
}

/** The AI key saved in Settings; undefined while it is being read. */
function useApiKey(): string | null | undefined {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void getApiKey().then((value) => live && setKey(value));
    return () => {
      live = false;
    };
  }, []);
  return key;
}

function Describe({ onFound, apiKey }: { onFound(found: Found): void; apiKey: string | null | undefined }) {
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = async () => {
    if (!apiKey) return;
    setWorking(true);
    setError(null);
    let pageText: string | undefined;
    let url: string | undefined;
    if (link.trim()) {
      const page = await readRecipePage(link);
      if (!page.ok) {
        setError(page.error);
        setWorking(false);
        return;
      }
      // A page with recipe data needs no AI at all.
      if (page.draft) {
        onFound(await withPhoto(page.draft));
        return;
      }
      pageText = page.text;
      url = page.url;
    }
    const result = await draftRecipe({ notes, ...(pageText ? { pageText } : {}), ...(url ? { url } : {}) }, { apiKey });
    if (!result.ok) {
      setError(result.error);
      setWorking(false);
      return;
    }
    onFound(await withPhoto(result.draft));
  };

  return (
    <section className="add-link" aria-labelledby="add-describe-title">
      <div className="add-link-head">
        <span className="add-choice-icon">
          <Icon name="sparkle" size={24} />
        </span>
        <div>
          <h2 id="add-describe-title" className="add-choice-title">
            Describe it
          </h2>
          <p className="muted">A rough list or a few words, and an assistant writes the whole recipe.</p>
        </div>
      </div>
      {apiKey === null ? (
        <p>
          Describing a recipe needs an AI key. A Google Gemini key is free.{' '}
          <Link to="/settings" className="link-btn">
            Add a key in Settings
          </Link>
        </p>
      ) : (
        <form
          className="add-describe"
          onSubmit={(event) => {
            event.preventDefault();
            if (notes.trim() || link.trim()) void write();
          }}
        >
          <textarea rows={4} value={notes} aria-label="Describe the recipe" placeholder="My nan’s lamb hotpot: lamb neck, potatoes, onions, stock, two hours in the oven." onChange={(event) => setNotes(event.target.value)} />
          <div className="inline-form">
            <input type="text" inputMode="url" value={link} aria-label="Link (optional)" placeholder="Link (optional)" autoComplete="off" spellCheck={false} onChange={(event) => setLink(event.target.value)} />
            <Button type="submit" variant="primary" icon="sparkle" disabled={working || apiKey === undefined || (!notes.trim() && !link.trim())}>
              {working ? 'Writing…' : 'Write it'}
            </Button>
          </div>
        </form>
      )}
      <div role="status" className="add-link-status">
        {working && <p className="muted">Writing your recipe…</p>}
        {error && <p>{error}</p>}
      </div>
    </section>
  );
}

/** Find a photo to go with a draft, without holding things up if none turns up. */
async function withPhoto(draft: RecipeDraft): Promise<Found> {
  const photo = await findPhoto(draft.photoQuery || draft.title);
  return photo ? { draft, photo: { blob: photo.blob, credit: photo.credit } } : { draft };
}

function FromLink({ onFound, apiKey }: { onFound(found: Found): void; apiKey: string | null | undefined }) {
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'idle' | 'reading' | 'unreadable' | 'writing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState<{ text: string; url: string } | null>(null);

  const askAssistant = async () => {
    if (!apiKey || !unread) return;
    setStatus('writing');
    setError(null);
    const result = await draftRecipe({ pageText: unread.text, url: unread.url }, { apiKey });
    if (!result.ok) {
      setError(result.error);
      setStatus('unreadable');
      return;
    }
    onFound(await withPhoto(result.draft));
  };

  const importPage = async () => {
    setStatus('reading');
    setError(null);
    const page = await readRecipePage(address);
    if (!page.ok) {
      setError(page.error);
      setStatus('idle');
      return;
    }
    if (!page.draft) {
      setUnread({ text: page.text, url: page.url });
      setStatus('unreadable');
      return;
    }
    onFound(await withPhoto(page.draft));
  };

  return (
    <section className="add-link" aria-labelledby="add-link-title">
      <div className="add-link-head">
        <span className="add-choice-icon">
          <Icon name="link" size={24} />
        </span>
        <div>
          <h2 id="add-link-title" className="add-choice-title">
            From a link
          </h2>
          <p className="muted">Paste a recipe’s web address. Most recipe sites work.</p>
        </div>
      </div>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (address.trim()) void importPage();
        }}
      >
        <input type="text" inputMode="url" value={address} placeholder="https://" aria-label="Link to a recipe" autoComplete="off" spellCheck={false} onChange={(event) => setAddress(event.target.value)} />
        <Button type="submit" variant="primary" disabled={status === 'reading' || address.trim() === ''}>
          {status === 'reading' ? 'Reading…' : 'Import'}
        </Button>
      </form>
      <div role="status" className="add-link-status">
        {status === 'reading' && <p className="muted">Reading the page…</p>}
        {error && <p>{error}</p>}
        {status === 'writing' && <p className="muted">Writing your recipe…</p>}
        {status === 'unreadable' && (
          <div className="add-link-unread">
            <p>That page has no recipe Simmer can read.</p>
            {apiKey ? (
              <Button icon="sparkle" onClick={() => void askAssistant()}>
                Ask the assistant to read it
              </Button>
            ) : (
              <p className="muted">
                <Link to="/settings" className="link-btn">
                  Add a free AI key in Settings
                </Link>{' '}
                to read pages like this.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** `/add/new`: the guided form, empty. */
export function NewRecipe() {
  return (
    <EditorPage title="New recipe">
      <RecipeEditor initial={emptyDraft()} draftKey={NEW_DRAFT_KEY} />
    </EditorPage>
  );
}

/** `/recipe/:id/edit`: only your own recipes can be changed. */
export function EditRecipe() {
  const { id } = useParams();
  const recipe = useRecipe(id);
  const navigate = useNavigate();
  const editable = recipe?.source === MINE;

  useEffect(() => {
    if (!editable) navigate(id ? `/recipe/${id}` : '/', { replace: true });
  }, [editable, id, navigate]);

  if (!recipe || !editable) return null;
  return (
    <EditorPage title="Edit recipe">
      <RecipeEditor key={recipe.id} initial={draftFromRecipe(recipe)} recipe={recipe} />
    </EditorPage>
  );
}
