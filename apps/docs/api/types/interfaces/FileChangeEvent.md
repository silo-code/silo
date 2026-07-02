# Interface: FileChangeEvent

Defined in: [packages/sdk/src/file-service.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L44)

A filesystem change event delivered to a [FileService.watch](FileService.md#watch) listener,
for changes under that watch's path.

## Properties

### paths

```ts
paths: string[];
```

Defined in: [packages/sdk/src/file-service.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L46)

The paths that changed in this event.

***

### kind

```ts
kind: FileChangeKind;
```

Defined in: [packages/sdk/src/file-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L52)

Normalized change kind. The host maps the backend's vocabulary to this
closed union; backend-specific kinds that don't match arrive as `"other"`.
Always compare against the union values — never against raw backend strings.
