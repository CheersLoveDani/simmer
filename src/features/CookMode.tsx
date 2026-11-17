import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { keptPortions, packSteps, PLACE_LABELS, type Split } from '../domain/mealprep';
import { displayIngredient, scaleFactor } from '../domain/quantity';
import { prepBefore, prepDuring } from '../domain/prep';
import { ingredientsInStep } from '../domain/recipeText';
import type { Recipe } from '../domain/schema';
import { setKeepAwake } from '../platform/device';
import { useRecipe } from '../store/libraryStore';
import { useSession } from '../store/sessionStore';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { isTyping, useKey } from '../ui/hooks';
import { Button, IconButton } from '../ui/primitives';
import { ThemeArt, useRecipeLook } from '../ui/Themed';
import { Meanwhile } from './Recipe';
import { StepTimer } from './timers';
import { FinishSheet, PLACE_ICONS } from './mealprep';

export function CookMode() {
  const { id } = useParams();
  const recipe = useRecipe(id);
  const navigate = useNavigate();
  useEffect(() => {
    if (!recipe) navigate(id ? `/recipe/${id}` : '/', { replace: true });
  }, [recipe, id, navigate]);
  return recipe ? <Cooking recipe={recipe} /> : null;
}

function Cooking({ recipe }: { recipe: Recipe }) {
  const { look, style: themeStyle } = useRecipeLook(recipe);
  const navigate = useNavigate();
  const units = useUser((s) => s.settings.units);
  const keepAwake = useUser((s) => s.settings.keepAwake);
  const servings = useUser((s) => s.servings[recipe.id]) ?? recipe.serves;
  const plan = useSession((s) => s.cookPlan[recipe.id]);
  const [finishing, setFinishing] = useState(false);
  const saved = useSession((s) => s.step[recipe.id]) ?? 0;
  const setStep = useSession((s) => s.setStep);
  const direction = useRef(1);

  // A meal prep cook ends with packing the portions away.
  const packing = plan?.mode === 'prep' && keptPortions(plan.split) > 0 ? packSteps(recipe, plan.split) : [];
  const count = recipe.steps.length + (packing.length > 0 ? 1 : 0);
  const index = Math.min(saved, count - 1);
  const isPack = index >= recipe.steps.length;
  const step = recipe.steps[Math.min(index, recipe.steps.length - 1)]!;
  const factor = scaleFactor(recipe.serves, servings);
  const used = useMemo(() => (isPack ? [] : ingredientsInStep(step, recipe)), [step, recipe, isPack]);
  const last = index === count - 1;

  useEffect(() => {
    if (!keepAwake) return;
    setKeepAwake(true);
    return () => setKeepAwake(false);
  }, [keepAwake]);

  const exit = () => navigate(`/recipe/${recipe.id}`, { replace: true });
  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= count) return;
    direction.current = delta;
    setStep(recipe.id, next);
  };
  const finish = () => setFinishing(true);
  const finished = () => {
    setStep(recipe.id, 0);
    exit();
  };

  useKey((event) => {
    if (isTyping(event)) return;
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
      event.preventDefault();
      if (last) return;
      go(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'Escape') {
      exit();
    }
  }, !finishing);

  return (
    <div className={`cook ${look ? 'is-themed' : ''}`} style={themeStyle} data-testid="cook-mode">
      <ThemeArt look={look} />
      <header className="cook-head">
        <IconButton icon="close" label="Leave cook mode" onClick={exit} />
        <div className="cook-title">
          <span className="muted">{recipe.title}</span>
          <span className="tabular" aria-live="polite">
            Step {index + 1} of {count}
          </span>
        </div>
        <span className="cook-head-spacer" />
      </header>
      <div className="cook-progress" role="progressbar" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1} aria-label="Progress through the method">
        <motion.span animate={{ width: `${((index + 1) / count) * 100}%` }} transition={{ type: 'spring', stiffness: 260, damping: 34 }} />
      </div>

      <div className="cook-stage">
        <AnimatePresence mode="wait" initial={false} custom={direction.current}>
          <motion.div
            key={index}
            className="cook-step"
            custom={direction.current}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 36 }),
              centre: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -36 }),
            }}
            initial="enter"
            animate="centre"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.x < -70 || info.velocity.x < -500) go(1);
              else if (info.offset.x > 70 || info.velocity.x > 500) go(-1);
            }}
          >
            {isPack ? (
              <PackCard steps={packing} split={plan!.split} />
            ) : (
              <>
                {index === 0 && <Meanwhile title="Before you start" tasks={prepBefore(recipe).map((t) => t.text)} />}
                <p className="cook-text">{step.text}</p>
                {step.tip && <p className="step-tip">{step.tip}</p>}
              </>
            )}
            {used.length > 0 && (
              <ul className="cook-ingredients" aria-label="Ingredients for this step">
                {used.map((item) => {
                  const view = displayIngredient(item, factor, units);
                  return (
                    <li key={item.key}>
                      {view.amount && <strong className="tabular">{view.amount} </strong>}
                      {view.name}
                    </li>
                  );
                })}
              </ul>
            )}
            {!isPack && <Meanwhile tasks={prepDuring(recipe, index).map((t) => t.text)} />}
            {!isPack && step.timer && <StepTimer large id={`${recipe.id}:${index}`} label={step.timer.label} minutes={step.timer.minutes} recipeId={recipe.id} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="cook-foot">
        <Button icon="back" onClick={() => go(-1)} disabled={index === 0}>
          Back
        </Button>
        {last ? (
          <Button variant="primary" icon="check" onClick={finish} data-testid="cook-finish">
            Finish
          </Button>
        ) : (
          <Button variant="primary" onClick={() => go(1)}>
            Next step
          </Button>
        )}
      </footer>
      <FinishSheet recipe={recipe} open={finishing} onClose={() => setFinishing(false)} onFinished={finished} />
    </div>
  );
}

/** The last card of a meal prep cook: where every portion goes. */
function PackCard({ steps, split }: { steps: string[]; split: Split }) {
  const places = (['fridge', 'freezer', 'cupboard'] as const).filter((p) => split[p] > 0);
  return (
    <div className="pack-card">
      <p className="cook-text">Pack it away</p>
      <ul className="pack-split">
        {split.now > 0 && (
          <li>
            <Icon name="pot" size={20} />
            <strong className="tabular">{split.now}</strong> to eat now
          </li>
        )}
        {places.map((p) => (
          <li key={p}>
            <Icon name={PLACE_ICONS[p]} size={20} />
            <strong className="tabular">{split[p]}</strong> for the {p === 'cupboard' ? 'tin' : PLACE_LABELS[p].toLowerCase()}
          </li>
        ))}
      </ul>
      <ol className="pack-steps">
        {steps.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ol>
    </div>
  );
}
