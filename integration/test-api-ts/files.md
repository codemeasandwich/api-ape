# TypeScript Controller Fixture

Controllers written in TypeScript, used by the Bun integration runner to prove that `apeBun({ selector: ['js', 'ts'] })` registers `.ts` controller files and that the default selector (`['js']`) ignores them.

## Directory Structure

```
test-api-ts/
└── tsEcho.ts                 # Echo controller written in TypeScript
```

## Files

### `tsEcho.ts`

Returns `{ success: true, runtime: 'ts', received }` for any payload. Reachable as type `tsEcho` only when the loader's selector includes `ts`.
