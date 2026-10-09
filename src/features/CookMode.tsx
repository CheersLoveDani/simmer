import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toISODate } from '../domain/planner';
import { displayIngredient, scaleFactor } from '../domain/quantity';
import { ingredientsInStep } from '../domain/recipeText';
import type { Recipe } from '../domain/schema';
import { setKeepAwake } from '../platform/device';
import { useRecipe } from '../store/libraryStore';
import { useSession } from '../store/sessionStore';
import { useUser } from '../store/userStore';
import { isTyping, toast, useKey } from '../ui/hooks';
import { Button, IconButton } from '../ui/primitives';
import { StepTimer } from './timers';

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
  const navigate = useNavigate();
  const units = useUser((s) => s.settings.units);
  const keepAwake = useUser((s) => s.settings.keepAwake);
  const servings = useUser((s) => s.servings[recipe.id]) ?? recipe.serves;
  const logCooked = useUser((s) => s.logCooked);
  const saved = useSession((s) => s.step[recipe.id]) ?? 0;
  const setStep = useSession((s) => s.setStep);
  const direction = useRef(1);

  const count = recipe.steps.length;
  const index = Math.min(saved, count - 1);
  const step = recipe.steps[index]!;
  const factor = scaleFactor(recipe.serves, servings);
  const used = useMemo(() => ingredientsInStep(step, recipe), [step, recipe]);
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
  const finish = () => {
    logCooked(recipe.id, toISODate(new Date()));
    setStep(recipe.id, 0);
    toast('Enjoy. Logged as cooked today.');
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
  });

  return (
    <div className="cook" data-testid="cook-mode">
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
            <p className="cook-text">{step.text}</p>
            {step.tip && <p className="step-tip">{step.tip}</p>}
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
            {step.timer && <StepTimer large id={`${recipe.id}:${index}`} label={step.timer.label} minutes={step.timer.minutes} recipeId={recipe.id} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="cook-foot">
        <Button icon="back" onClick={() => go(-1)} disabled={index === 0}>
          Back
        </Button>
        {last ? (
          <Button variant="primary" icon="check" onClick={finish}>
            Finish
          </Button>
        ) : (
          <Button variant="primary" onClick={() => go(1)}>
            Next step
          </Button>
        )}
      </footer>
    </div>
  );
}
