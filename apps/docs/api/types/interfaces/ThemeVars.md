# Interface: ThemeVars

Defined in: [packages/sdk/src/domain-types.ts:201](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L201)

The full theme-override surface, in type form: every `--silo-*` token a theme
preset's `vars` may recolor. Per the theming contract it spans **the design
tokens' generic colors + font families** _and_ **all the component tokens**.
The keys are the literal CSS custom-property names; renaming a key here
renames the token in `theme.css` in lockstep. Font-sizes and the radius scale
are intentionally absent (not theme-overridable).

## See

docs/architecture-audit/theming-contract.md

## Properties

### --silo-color-bg

```ts
--silo-color-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L203)

***

### --silo-color-bg-hover

```ts
--silo-color-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:204](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L204)

***

### --silo-color-bg-active

```ts
--silo-color-bg-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:205](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L205)

***

### --silo-color-text

```ts
--silo-color-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:206](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L206)

***

### --silo-color-text-hi

```ts
--silo-color-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:207](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L207)

***

### --silo-color-text-lo

```ts
--silo-color-text-lo: string;
```

Defined in: [packages/sdk/src/domain-types.ts:208](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L208)

***

### --silo-color-accent

```ts
--silo-color-accent: string;
```

Defined in: [packages/sdk/src/domain-types.ts:209](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L209)

***

### --silo-color-accent-2

```ts
--silo-color-accent-2: string;
```

Defined in: [packages/sdk/src/domain-types.ts:210](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L210)

***

### --silo-color-border

```ts
--silo-color-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:211](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L211)

***

### --silo-color-border-strong

```ts
--silo-color-border-strong: string;
```

Defined in: [packages/sdk/src/domain-types.ts:212](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L212)

***

### --silo-color-ok

```ts
--silo-color-ok: string;
```

Defined in: [packages/sdk/src/domain-types.ts:213](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L213)

***

### --silo-color-warn

```ts
--silo-color-warn: string;
```

Defined in: [packages/sdk/src/domain-types.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L214)

***

### --silo-color-err

```ts
--silo-color-err: string;
```

Defined in: [packages/sdk/src/domain-types.ts:215](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L215)

***

### --silo-color-input-bg

```ts
--silo-color-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:216](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L216)

***

### --silo-color-input-text

```ts
--silo-color-input-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:217](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L217)

***

### --silo-color-input-border

```ts
--silo-color-input-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:218](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L218)

***

### --silo-color-button-bg

```ts
--silo-color-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:219](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L219)

***

### --silo-color-button-text

```ts
--silo-color-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L220)

***

### --silo-color-toolbar-bg

```ts
--silo-color-toolbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:222](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L222)

***

### --silo-color-toolbar-text

```ts
--silo-color-toolbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:223](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L223)

***

### --silo-color-toolbar-text-disabled

```ts
--silo-color-toolbar-text-disabled: string;
```

Defined in: [packages/sdk/src/domain-types.ts:224](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L224)

***

### --silo-color-toolbar-input-bg

```ts
--silo-color-toolbar-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:225](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L225)

***

### --silo-color-content-bg

```ts
--silo-color-content-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:227](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L227)

***

### --silo-color-content-text

```ts
--silo-color-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:228](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L228)

***

### --silo-button-bg

```ts
--silo-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L234)

***

### --silo-button-text

```ts
--silo-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L235)

***

### --silo-button-border

```ts
--silo-button-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:236](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L236)

***

### --silo-button-primary-bg

```ts
--silo-button-primary-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L237)

***

### --silo-button-primary-text

```ts
--silo-button-primary-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L238)

***

### --silo-button-danger-bg

```ts
--silo-button-danger-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L239)

***

### --silo-button-danger-text

```ts
--silo-button-danger-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L240)

***

### --silo-font-ui?

```ts
optional --silo-font-ui?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L242)

***

### --silo-font-mono?

```ts
optional --silo-font-mono?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L243)

***

### --silo-content-text

```ts
--silo-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:245](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L245)

***

### --silo-content-terminal-bg

```ts
--silo-content-terminal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:246](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L246)

***

### --silo-content-editor-bg

```ts
--silo-content-editor-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:247](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L247)

***

### --silo-content-editor-selection

```ts
--silo-content-editor-selection: string;
```

Defined in: [packages/sdk/src/domain-types.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L248)

***

### --silo-content-editor-selection-inactive

```ts
--silo-content-editor-selection-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:249](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L249)

***

### --silo-content-editor-text-dim

```ts
--silo-content-editor-text-dim: string;
```

Defined in: [packages/sdk/src/domain-types.ts:250](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L250)

***

### --silo-content-editor-text-faint

```ts
--silo-content-editor-text-faint: string;
```

Defined in: [packages/sdk/src/domain-types.ts:251](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L251)

***

### --silo-content-tab-bg

```ts
--silo-content-tab-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:252](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L252)

***

### --silo-content-tab-tray-bg

```ts
--silo-content-tab-tray-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L253)

***

### --silo-content-tab-tray-text

```ts
--silo-content-tab-tray-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L254)

***

### --silo-content-tab-text

```ts
--silo-content-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L255)

***

### --silo-content-tab-text-inactive

```ts
--silo-content-tab-text-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:256](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L256)

***

### --silo-content-tab-text-active

```ts
--silo-content-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L257)

***

### --silo-statusbar-bg

```ts
--silo-statusbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L259)

***

### --silo-statusbar-text

```ts
--silo-statusbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L260)

***

### --silo-statusbar-bg-hover

```ts
--silo-statusbar-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:261](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L261)

***

### --silo-tab-text

```ts
--silo-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:263](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L263)

***

### --silo-tab-text-active

```ts
--silo-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:264](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L264)

***

### --silo-tab-bg-hover

```ts
--silo-tab-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:265](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L265)

***

### --silo-tab-border-active

```ts
--silo-tab-border-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:266](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L266)

***

### --silo-menu-bg

```ts
--silo-menu-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:268](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L268)

***

### --silo-menu-text

```ts
--silo-menu-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L269)

***

### --silo-menu-item-hover-bg

```ts
--silo-menu-item-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:270](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L270)

***

### --silo-menu-border

```ts
--silo-menu-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L271)

***

### --silo-modal-bg

```ts
--silo-modal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:273](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L273)

***

### --silo-modal-border

```ts
--silo-modal-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:274](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L274)

***

### --silo-notify-bg

```ts
--silo-notify-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L276)

***

### --silo-notify-text

```ts
--silo-notify-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:277](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L277)

***

### --silo-notify-text-hi

```ts
--silo-notify-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:278](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L278)

***

### --silo-list-radius

```ts
--silo-list-radius: string;
```

Defined in: [packages/sdk/src/domain-types.ts:280](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L280)

***

### --silo-list-inset

```ts
--silo-list-inset: string;
```

Defined in: [packages/sdk/src/domain-types.ts:281](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L281)

***

### --silo-list-hover-bg

```ts
--silo-list-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:282](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L282)

***

### --silo-list-active-bg

```ts
--silo-list-active-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:283](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L283)

***

### --silo-list-active-outline

```ts
--silo-list-active-outline: string;
```

Defined in: [packages/sdk/src/domain-types.ts:285](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L285)

Selected-row outline — use a bordered selection instead of (or with) a fill.
