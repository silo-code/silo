# Type Alias: TabIndicatorFlash

```ts
type TabIndicatorFlash = TabIndicatorContribution & object;
```

Defined in: [packages/sdk/src/tab-adornment.ts:109](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L109)

Payload for [EditorService.flashIndicator](../interfaces/EditorService.md#flashindicator) /
[TerminalService.flashIndicator](../interfaces/TerminalService.md#flashindicator) — timed one-shot; no stable `id`
(auto-cleared after `durationMs`).

## Type Declaration

### durationMs?

```ts
optional durationMs?: number;
```

How long to show the flash. Defaults to host choice (typically ~800ms).
