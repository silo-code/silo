# Function: useServiceState()

```ts
function useServiceState<T>(service): T;
```

Defined in: [packages/sdk/src/use-service-state.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-service-state.ts#L38)

Subscribe a React component to a `ctx` service's reactive state. Returns the
service's current state and re-renders when it changes — the one blessed
way to read service state in an extension. Use it for every domain
([workspaces](../interfaces/ExtensionContext.md#workspaces),
[layout](../interfaces/ExtensionContext.md#layout),
[theme](../interfaces/ExtensionContext.md#theme), …) rather than re-implementing the
`useSyncExternalStore` boilerplate per call site.

## Type Parameters

### T

`T`

## Parameters

### service

[`ReactiveService`](../interfaces/ReactiveService.md)\<`T`\>

## Returns

`T`

## Example

```tsx
function Panel({ ctx }: { ctx: ExtensionContext }) {
  const ws = useServiceState(ctx.workspaces);
  return <span>{ws.open.length} open workspaces</span>;
}
```
