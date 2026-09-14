import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@rb/server',
    // These tests run real argon2 hashing against an embedded Postgres, several
    // files at once. Each is quick alone, but under that contention the default
    // five seconds is a coin toss for whichever test happens to run first.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
