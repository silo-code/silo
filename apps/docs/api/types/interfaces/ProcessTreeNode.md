# Interface: ProcessTreeNode

Defined in: [packages/sdk/src/processes-service.ts:35](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L35)

One process in a session's descendant tree. Only produced while an extension
holds `enableStats({ trees: true })` — see [ProcessInfo.tree](ProcessInfo.md#tree).

## Properties

### pid

```ts
readonly pid: number;
```

Defined in: [packages/sdk/src/processes-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L36)

***

### command

```ts
readonly command: string;
```

Defined in: [packages/sdk/src/processes-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L38)

Executable name (e.g. `"node"`), not a full command line.

***

### cpuPercent

```ts
readonly cpuPercent: number;
```

Defined in: [packages/sdk/src/processes-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L40)

CPU% delta since the previous sample, per-core. 0 on the first sample after the process appears.

***

### memoryMb

```ts
readonly memoryMb: number;
```

Defined in: [packages/sdk/src/processes-service.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L42)

Resident memory in megabytes.

***

### children

```ts
readonly children: readonly ProcessTreeNode[];
```

Defined in: [packages/sdk/src/processes-service.ts:43](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L43)
