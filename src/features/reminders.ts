import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { freshness, sortStash, type StashItem } from '../domain/mealprep';
import { fromISODate, toISODate } from '../domain/planner';
import { canScheduleNotifications, cancelNotification, scheduleNotification } from '../platform/device';
import { kvGet, kvSet } from '../store/db';
import { useUser } from '../store/userStore';
import { toast } from '../ui/hooks';

const NUDGED = 'stash.nudgedOn';
const SCHEDULED = 'stash.reminderIds';
/** Kept clear of the ids timers use for their alerts. */
const ID_BASE = 700_000;
const REMIND_HOUR = 9;

export function reminderId(item: Pick<StashItem, 'id'>): number {
  let hash = 0;
  for (const char of item.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ID_BASE + (hash % 100_000);
}

/** Portions that need eating today, or are already past it, most urgent first. */
export function dueItems(stash: StashItem[], today: string): StashItem[] {
  return sortStash(stash).filter((item) => item.place !== 'freezer' && ['today', 'past'].includes(freshness(item, today)));
}

/** The message for the morning a batch should be eaten. */
export function reminderText(item: StashItem): { title: string; body: string } {
  const where = item.place === 'cupboard' ? 'tin' : item.place;
  return {
    title: `Eat the ${item.title.toLowerCase()} today`,
    body: `${item.portions} ${item.portions === 1 ? 'portion' : 'portions'} in the ${where} ${item.portions === 1 ? 'is' : 'are'} at the end of ${item.portions === 1 ? 'its' : 'their'} keeping time.`,
  };
}

/**
 * Remind the cook to eat prepped food while it is good: a nudge in the app
 * once a day, and on Android a notification on the morning of its last day.
 */
export function useStashReminders(): void {
  const stash = useUser((s) => s.stash);
  const enabled = useUser((s) => s.settings.useByReminders);
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    const today = toISODate(new Date());
    void (async () => {
      if ((await kvGet<string>(NUDGED)) === today) return;
      const due = dueItems(useUser.getState().stash, today);
      if (due.length === 0) return;
      await kvSet(NUDGED, today);
      const first = due[0]!;
      const past = freshness(first, today) === 'past';
      const message =
        due.length > 1 ? `${due.length} meal prep batches need eating` : past ? `${first.title} is past its keeping time` : `Eat the ${first.title.toLowerCase()} today`;
      toast(message, { label: 'View', run: () => navigate('/prep') });
    })();
    // Only once the app has opened, not on every change to the stash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!canScheduleNotifications) return;
    const timer = setTimeout(() => {
      void (async () => {
        const previous = (await kvGet<number[]>(SCHEDULED)) ?? [];
        const now = new Date();
        const wanted = enabled
          ? stash.filter((item) => item.place !== 'freezer').flatMap((item) => {
              const at = fromISODate(item.useBy);
              at.setHours(REMIND_HOUR, 0, 0, 0);
              return at > now ? [{ item, at }] : [];
            })
          : [];
        const ids = wanted.map(({ item }) => reminderId(item));
        for (const id of previous) if (!ids.includes(id)) await cancelNotification(id);
        for (const { item, at } of wanted) {
          const { title, body } = reminderText(item);
          await scheduleNotification(reminderId(item), title, body, at);
        }
        await kvSet(SCHEDULED, ids);
      })();
    }, 1500);
    return () => clearTimeout(timer);
  }, [stash, enabled]);
}
