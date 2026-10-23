import type { Recipe } from '../domain/schema';
import type { UserData } from './backup';
import { useLibrary } from './libraryStore';
import { useUser } from './userStore';

/**
 * Put a backup in place. The backup's recipe books replace the device's, so
 * the recipes of any book it does not list are forgotten, and the books it
 * does list are synced straight away rather than at the next timer.
 */
export async function restoreBackup({ data, recipes }: { data: UserData; recipes: Recipe[] }): Promise<void> {
  const kept = new Set(data.books.map((b) => b.key));
  const dropped = useUser
    .getState()
    .books.map((b) => b.key)
    .filter((key) => !kept.has(key));
  useUser.getState().replaceAll(data);
  const library = useLibrary.getState();
  for (const key of dropped) await library.removeBook(key);
  for (const recipe of recipes) await library.saveOwn(recipe);
  await library.sync();
}
