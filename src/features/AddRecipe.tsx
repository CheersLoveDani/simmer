import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { draftFromRecipe, emptyDraft } from '../domain/draft';
import { MINE } from '../store/recipeStore';
import { useRecipe } from '../store/libraryStore';
import { Icon, type IconName } from '../ui/Icon';
import { goBack } from '../ui/back';
import { useWide } from '../ui/hooks';
import { IconButton, PageHeader } from '../ui/primitives';
import { RecipeEditor } from './RecipeEditor';

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
  return (
    <EditorPage title="Add a recipe">
      <div className="add-choices">
        <Choice icon="link" title="From a link" lead="Paste a recipe’s web address and Simmer reads it." soon />
        <Choice icon="sparkle" title="Describe it" lead="A rough list or a few words, and an assistant writes it up." soon />
        <Choice icon="edit" title="Fill it in yourself" lead="A step-by-step form: basics, ingredients, method." to="/add/new" />
      </div>
    </EditorPage>
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
