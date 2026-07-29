import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { configure } from '@testing-library/react'

// Progress is lazy-loaded (router.tsx) so Recharts leaves the entry bundle;
// its chunk (Recharts plus every chart component) is large enough that
// Vitest's on-the-fly transform of it can outrun testing-library's 1000ms
// default `findBy*`/`waitFor` timeout on a cold module cache, well before
// the chunk has actually failed to load. Raised here (not per-test) so every
// async query gets the same headroom rather than each Progress test having
// to remember its own longer timeout.
configure({ asyncUtilTimeout: 5000 })
