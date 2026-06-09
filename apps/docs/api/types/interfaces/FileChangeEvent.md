# Interface: FileChangeEvent

Defined in: [packages/sdk/src/file-service.ts:34](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L34)

A filesystem change event delivered to a [FileService.watch](FileService.md#watch) listener,
for changes under that watch's path.

## Properties

### paths

```ts
paths: string[];
```

Defined in: [packages/sdk/src/file-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L36)

The paths that changed in this event.

***

### kind

```ts
kind: string;
```

Defined in: [packages/sdk/src/file-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L38)

The backend's change kind (e.g. `"create"`, `"modify"`, `"remove"`).
