# Interface: ProcessStats

Defined in: [packages/sdk/src/processes-service.ts:19](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L19)

Resource snapshot for the foreground leader of a PTY session. Only present
on a [ProcessInfo](ProcessInfo.md) when an extension has called
[ProcessesService.enableStats](ProcessesService.md#enablestats).

CPU% is a delta between consecutive samples (the first sample after calling
`enableStats` returns 0%; values stabilize after the second poll ~3 s later).

## Properties

### pid

```ts
pid: number;
```

Defined in: [packages/sdk/src/processes-service.ts:21](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L21)

The process id of the foreground leader (same as [ProcessInfo.pgid](ProcessInfo.md#pgid) by convention).

***

### cpuPercent

```ts
cpuPercent: number;
```

Defined in: [packages/sdk/src/processes-service.ts:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L23)

CPU percentage used since the previous sample, per-core (not system-wide total).

***

### memoryMb

```ts
memoryMb: number;
```

Defined in: [packages/sdk/src/processes-service.ts:25](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L25)

Resident memory in megabytes.
