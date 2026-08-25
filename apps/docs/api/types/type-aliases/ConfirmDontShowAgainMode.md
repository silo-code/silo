# Type Alias: ConfirmDontShowAgainMode

```ts
type ConfirmDontShowAgainMode = 
  | {
  kind: "confirm";
  danger?: boolean;
}
  | {
  kind: "info";
};
```

Defined in: [packages/sdk/src/ui-service.ts:217](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L217)

Which two-button shape [UiService.confirmWithDontShowAgain](../interfaces/UiService.md#confirmwithdontshowagain) renders:
`"confirm"` pairs Cancel with a primary/danger button, dismissible (Escape /
backdrop resolve like Cancel) — mirrors [UiService.confirm](../interfaces/UiService.md#confirm). `"info"`
is a single acknowledgement button, not dismissible — there's nothing to
cancel, so forcing the explicit click keeps the checkbox's fate unambiguous.
