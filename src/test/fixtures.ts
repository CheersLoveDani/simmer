import type { Ingredient, Recipe } from '../domain/schema';

export function ing(partial: Partial<Ingredient> & { item: string }): Ingredient {
  return {
    qty: 1,
    unit: null,
    key: partial.item.toLowerCase(),
    aisle: 'pantry',
    ...partial,
  };
}

export function makeRecipe(partial: Partial<Recipe> & { id: string }): Recipe {
  return {
    hash: `h-${partial.id}`,
    title: partial.id.replace(/-/g, ' '),
    description: 'A test recipe.',
    course: 'main',
    cuisine: 'italian',
    tags: [],
    diet: [],
    difficulty: 'easy',
    serves: 2,
    time: { prep: 5, cook: 10, rest: 0, total: 15 },
    ingredients: [{ section: null, items: [ing({ item: 'salt', aisle: 'spices' })] }],
    steps: [{ text: 'Cook it.' }],
    equipment: [],
    tips: [],
    substitutions: [],
    cover: { hue: 30, motif: 'bowl' },
    author: 'Simmer',
    created: '2026-10-09',
    ...partial,
  };
}

export const pasta = makeRecipe({
  id: 'brown-butter-miso-pasta',
  title: 'Brown Butter Miso Pasta',
  description: 'Nutty brown butter and white miso in a glossy sauce.',
  cuisine: 'japanese',
  tags: ['weeknight', 'umami', 'pasta'],
  diet: ['vegetarian'],
  time: { prep: 5, cook: 12, rest: 0, total: 17 },
  ingredients: [
    {
      section: null,
      items: [
        ing({ qty: 200, unit: 'g', item: 'spaghetti' }),
        ing({ qty: 50, unit: 'g', item: 'unsalted butter', key: 'butter', aisle: 'dairy-eggs' }),
        ing({ qty: 2, unit: 'tbsp', item: 'white miso', key: 'miso' }),
        ing({ qty: 2, unit: 'clove', item: 'garlic', aisle: 'produce', prep: 'finely grated' }),
        ing({ qty: null, unit: null, item: 'black pepper', aisle: 'spices', note: 'lots' }),
      ],
    },
  ],
  steps: [
    { text: 'Boil the spaghetti until just shy of al dente.', timer: { minutes: 9, label: 'Spaghetti' } },
    { text: 'Brown the butter, then whisk in the miso and garlic.', tip: 'Use a pale pan.' },
    { text: 'Toss everything together with black pepper.' },
  ],
});

export const curry = makeRecipe({
  id: 'chickpea-spinach-curry',
  title: 'Chickpea & Spinach Curry',
  description: 'A quick vegan curry with coconut milk.',
  cuisine: 'indian',
  tags: ['weeknight', 'one-pot'],
  diet: ['vegan', 'vegetarian', 'gluten-free'],
  serves: 4,
  time: { prep: 10, cook: 25, rest: 0, total: 35 },
  ingredients: [
    {
      section: null,
      items: [
        ing({ qty: 1, unit: null, item: 'onion', aisle: 'produce' }),
        ing({ qty: 3, unit: 'clove', item: 'garlic', aisle: 'produce' }),
        ing({ qty: 2, unit: 'can', item: 'chickpeas', aisle: 'tins-jars' }),
        ing({ qty: 400, unit: 'ml', item: 'coconut milk', aisle: 'tins-jars' }),
        ing({ qty: 200, unit: 'g', item: 'spinach', aisle: 'produce' }),
        ing({ qty: 1, unit: 'tsp', item: 'ground cumin', key: 'cumin', aisle: 'spices' }),
        ing({ qty: null, unit: null, item: 'salt', aisle: 'spices' }),
      ],
    },
  ],
});

export const brownies = makeRecipe({
  id: 'fudgy-brownies',
  title: 'Fudgy Brownies',
  description: 'Dense, dark and crackle-topped.',
  course: 'baking',
  cuisine: 'american',
  tags: ['chocolate', 'traybake'],
  diet: ['vegetarian'],
  difficulty: 'medium',
  serves: 16,
  time: { prep: 15, cook: 25, rest: 60, total: 100 },
  ingredients: [
    {
      section: null,
      items: [
        ing({ qty: 200, unit: 'g', item: 'dark chocolate' }),
        ing({ qty: 150, unit: 'g', item: 'butter', aisle: 'dairy-eggs' }),
        ing({ qty: 3, unit: null, item: 'eggs', key: 'egg', aisle: 'dairy-eggs' }),
        ing({ qty: 250, unit: 'g', item: 'caster sugar' }),
        ing({ qty: 100, unit: 'g', item: 'plain flour' }),
      ],
    },
  ],
});

export const library = [pasta, curry, brownies];
