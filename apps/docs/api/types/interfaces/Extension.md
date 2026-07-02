# Interface: Extension\<API\>

Defined in: [packages/sdk/src/types.ts:732](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L732)

The shape of a Silo extension: a stable id plus an
[activate](#activate) function the host calls once, passing
the [ExtensionContext](ExtensionContext.md). This is the unit the host loads — built-ins
today, external packages later.

## Type Parameters

### API

`API` = `unknown`

the type of the API this extension publishes, if any (the
return type of [Extension.activate](#activate)). Defaults to `unknown`; omit it for
extensions that publish nothing.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:738](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L738)

Unique extension id, conventionally namespaced: `core.*` for Silo's core
feature set, `silo.*` for its optional bundled features, `<vendor>.*` for
third parties (e.g. `"core.editor"`, `"silo.git"`, `"acme.foo"`).

***

### manifest?

```ts
optional manifest?: ExtensionManifest;
```

Defined in: [packages/sdk/src/types.ts:745](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L745)

Optional display metadata for the **Extensions** settings page. Built-in
extensions declare it here so they can be listed (and disabled) with a name
and description; third-party extensions supply the equivalent through their
package manifest instead. See [ExtensionManifest](ExtensionManifest.md).

## Methods

### activate()

```ts
activate(ctx): void | API;
```

Defined in: [packages/sdk/src/types.ts:752](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L752)

Called once by the host; register contributions against `ctx` here.
**Optionally return an API object** to publish it for other extensions to
consume via [ExtensionContext.getExtension](ExtensionContext.md#getextension). Return nothing if the
extension publishes no API.

#### Parameters

##### ctx

[`ExtensionContext`](ExtensionContext.md)

#### Returns

`void` \| `API`

***

### deactivate()?

```ts
optional deactivate(): void;
```

Defined in: [packages/sdk/src/types.ts:754](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L754)

Optional cleanup hook (reserved for dynamic load/unload).

#### Returns

`void`
