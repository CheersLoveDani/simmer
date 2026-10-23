import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { draftFromRecipe, emptyDraft, type RecipeDraft } from '../domain/draft';
import { findPhoto } from '../import/photos';
import { readRecipePage } from '../import/recipePage';
import { MINE } from '../store/recipeStore';
import { useRecipe } from '../store/libraryStore';
import { Icon, type IconName } from '../ui/Icon';
import { goBack } from '../ui/back';
import { useWide } from '../ui/hooks';
import { Button, IconButton, PageHeader } from '../ui/primitives';
import { RecipeEditor, type EditorPhoto } from './RecipeEditor';

const NEW_DRAFT_KEY = 'simmer.draft';

function Choice({ icon, title, lead, to, soon }: { icon: IconName; title: string; lead: string; to?: string; soon?: boolean }) {
  const body = (
    <>
      <span className="add-choice-icon">
        <Icon name={icon} size={24} />
      </span>
      <span className="add-choice-text">
        <span className="add-choice-title">{title}</span>
        <span className="muted">{soon ? 'Coming soon' : lead}</span>
      </span>
      {!soon && <Icon name="forward" size={18} />}
    </>
  );
  return to && !soon ? (
    <Link to={to} className="add-choice">
      {body}
    </Link>
  ) : (
    <div className="add-choice is-disabled" aria-disabled="true">
      {body}
    </div>
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
  const [found, setFound] = useState<{ draft: RecipeDraft; photo?: EditorPhoto } | null>(null);

  if (found) {
    return (
      <EditorPage title="Check and save">
        <p className="muted">Here is what Simmer found. Look it over, change anything you like, then save it on the last step.</p>
        <RecipeEditor initial={found.draft} {...(found.photo ? { photo: found.photo } : {})} />
      </EditorPage>
    );
  }
  return (
    <EditorPage title="Add a recipe">
      <FromLink onFound={setFound} />
      <div className="add-choices">
        <Choice icon="sparkle" title="Describe it" lead="A rough list or a few words, and an assistant writes it up." soon />
        <Choice icon="edit" title="Fill it in yourself" lead="A step-by-step form: basics, ingredients, method." to="/add/new" />
      </div>
    </EditorPage>
  );
}

/** Find a photo to go with a draft, without holding things up if none turns up. */
async function withPhoto(draft: RecipeDraft): Promise<{ draft: RecipeDraft; photo?: EditorPhoto }> {
  const photo = await findPhoto(draft.photoQuery || draft.title);
  return photo ? { draft, photo: { blob: photo.blob, credit: photo.credit } } : { draft };
}

function FromLink({ onFound }: { onFound(found: { draft: RecipeDraft; photo?: EditorPhoto }): void }) {
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'idle' | 'reading' | 'unreadable'>('idle');
  const [error, setError] = useState<string | null>(null);

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
        {status === 'unreadable' && (
          <p>
            That page has no recipe Simmer can read. <span className="muted">Add a free AI key in Settings to read pages like this.</span>
          </p>
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
