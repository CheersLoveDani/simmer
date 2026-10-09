import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// Animations add nothing to these tests, and the test DOM's animation
// support is incomplete.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
});
