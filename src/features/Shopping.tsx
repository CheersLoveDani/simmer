import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { label } from '../domain/schema';
import { AISLE_LABELS, formatAmount, groupByAisle, toText } from '../domain/shopping';
import { shareText } from '../platform/device';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/hooks';
import { Button, Empty, IconButton, PageHeader } from '../ui/primitives';

export function Shopping() {
  const items = useUser((s) => s.shopping);
  const units = useUser((s) => s.settings.units);
  const addManualItem = useUser((s) => s.addManualItem);
  const toggle = useUser((s) => s.toggleShoppingItem);
  const remove = useUser((s) => s.removeShoppingItem);
  const clearChecked = useUser((s) => s.clearCheckedShopping);
  const clearAll = useUser((s) => s.clearShopping);
  const [draft, setDraft] = useState('');

  const groups = groupByAisle(items);
  const left = items.filter((item) => !item.checked).length;
  const ticked = items.length - left;

  const share = async () => {
    const outcome = await shareText('Shopping list', toText(items, units));
    if (outcome === 'copied') toast('Shopping list copied');
    if (outcome === 'failed') toast('Could not share the list');
  };

  const clearEverything = () => {
    const before = items;
    clearAll();
    toast('Shopping list cleared', {
      label: 'Undo',
      run: () => useUser.setState({ shopping: before }),
    });
  };

  return (
    <div className="page shopping">
      <PageHeader title="Shopping list" lead={items.length === 0 ? undefined : left === 0 ? 'All done' : `${left} to get`}>
        {items.length > 0 && <IconButton icon="share" label="Share list" onClick={() => void share()} />}
      </PageHeader>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          addManualItem(draft);
          setDraft('');
        }}
      >
        <input type="text" value={draft} placeholder="Add something else" aria-label="Add an item" onChange={(event) => setDraft(event.target.value)} enterKeyHint="done" />
        <Button type="submit" variant="primary" icon="plus" disabled={draft.trim() === ''}>
          Add
        </Button>
      </form>

      {items.length === 0 ? (
        <Empty icon="basket" title="Nothing to buy yet">
          <p>Open a recipe and choose “Add to shopping list”, or send a whole week across from the meal plan.</p>
          <Link to="/plan" className="btn btn-quiet">
            Open meal plan
          </Link>
        </Empty>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.aisle} className="aisle" aria-label={AISLE_LABELS[group.aisle]}>
              <h2>{AISLE_LABELS[group.aisle]}</h2>
              <ul>
                <AnimatePresence initial={false}>
                  {group.items.map((item) => {
                    const amount = formatAmount(item, units);
                    return (
                      <motion.li
                        key={item.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 42 }}
                        className="shop-row"
                        data-testid="shopping-item"
                      >
                        <label className={`ingredient ${item.checked ? 'is-done' : ''}`}>
                          <input type="checkbox" checked={item.checked} onChange={() => toggle(item.id)} />
                          <span className="tick" aria-hidden="true">
                            <Icon name="check" size={14} />
                          </span>
                          <span className="ingredient-text">
                            <span>{item.sources.length ? label(item.name) : item.name}</span>
                            {amount && <strong className="tabular shop-amount"> {amount}</strong>}
                            {item.sources.length > 0 && <span className="shop-source muted">{item.sources.map((s) => s.title).join(', ')}</span>}
                          </span>
                        </label>
                        <IconButton icon="close" label={`Remove ${item.name}`} onClick={() => remove(item.id)} />
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </section>
          ))}
          <div className="page-foot">
            <Button onClick={clearChecked} disabled={ticked === 0}>
              Remove {ticked || ''} ticked
            </Button>
            <Button variant="plain" onClick={clearEverything}>
              Clear list
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
