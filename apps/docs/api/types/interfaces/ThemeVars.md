# Interface: ThemeVars

Defined in: [packages/sdk/src/domain-types.ts:154](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L154)

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

Defined in: [packages/sdk/src/domain-types.ts:156](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L156)

***

### --silo-color-bg-hover

```ts
--silo-color-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:157](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L157)

***

### --silo-color-bg-active

```ts
--silo-color-bg-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:158](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L158)

***

### --silo-color-text

```ts
--silo-color-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:159](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L159)

***

### --silo-color-text-hi

```ts
--silo-color-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:160](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L160)

***

### --silo-color-text-lo

```ts
--silo-color-text-lo: string;
```

Defined in: [packages/sdk/src/domain-types.ts:161](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L161)

***

### --silo-color-accent

```ts
--silo-color-accent: string;
```

Defined in: [packages/sdk/src/domain-types.ts:162](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L162)

***

### --silo-color-accent-2

```ts
--silo-color-accent-2: string;
```

Defined in: [packages/sdk/src/domain-types.ts:163](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L163)

***

### --silo-color-border

```ts
--silo-color-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L164)

***

### --silo-color-border-strong

```ts
--silo-color-border-strong: string;
```

Defined in: [packages/sdk/src/domain-types.ts:165](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L165)

***

### --silo-color-ok

```ts
--silo-color-ok: string;
```

Defined in: [packages/sdk/src/domain-types.ts:166](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L166)

***

### --silo-color-warn

```ts
--silo-color-warn: string;
```

Defined in: [packages/sdk/src/domain-types.ts:167](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L167)

***

### --silo-color-err

```ts
--silo-color-err: string;
```

Defined in: [packages/sdk/src/domain-types.ts:168](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L168)

***

### --silo-color-input-bg

```ts
--silo-color-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:169](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L169)

***

### --silo-color-input-text

```ts
--silo-color-input-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:170](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L170)

***

### --silo-color-button-bg

```ts
--silo-color-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L171)

***

### --silo-color-button-text

```ts
--silo-color-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:172](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L172)

***

### --silo-color-toolbar-bg

```ts
--silo-color-toolbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:174](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L174)

***

### --silo-color-toolbar-text

```ts
--silo-color-toolbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L175)

***

### --silo-color-toolbar-text-disabled

```ts
--silo-color-toolbar-text-disabled: string;
```

Defined in: [packages/sdk/src/domain-types.ts:176](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L176)

***

### --silo-color-toolbar-input-bg

```ts
--silo-color-toolbar-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:177](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L177)

***

### --silo-color-content-bg

```ts
--silo-color-content-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:179](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L179)

***

### --silo-color-content-text

```ts
--silo-color-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:180](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L180)

***

### --silo-font-ui?

```ts
optional --silo-font-ui?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:182](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L182)

***

### --silo-font-mono?

```ts
optional --silo-font-mono?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:183](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L183)

***

### --silo-content-text

```ts
--silo-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:185](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L185)

***

### --silo-content-terminal-bg

```ts
--silo-content-terminal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:186](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L186)

***

### --silo-content-editor-bg

```ts
--silo-content-editor-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L187)

***

### --silo-content-editor-selection

```ts
--silo-content-editor-selection: string;
```

Defined in: [packages/sdk/src/domain-types.ts:188](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L188)

***

### --silo-content-editor-selection-inactive

```ts
--silo-content-editor-selection-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L189)

***

### --silo-content-editor-text-dim

```ts
--silo-content-editor-text-dim: string;
```

Defined in: [packages/sdk/src/domain-types.ts:190](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L190)

***

### --silo-content-editor-text-faint

```ts
--silo-content-editor-text-faint: string;
```

Defined in: [packages/sdk/src/domain-types.ts:191](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L191)

***

### --silo-content-tab-bg

```ts
--silo-content-tab-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L192)

***

### --silo-content-tab-tray-bg

```ts
--silo-content-tab-tray-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:193](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L193)

***

### --silo-content-tab-tray-text

```ts
--silo-content-tab-tray-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:194](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L194)

***

### --silo-content-tab-text

```ts
--silo-content-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:195](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L195)

***

### --silo-content-tab-text-inactive

```ts
--silo-content-tab-text-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L196)

***

### --silo-content-tab-text-active

```ts
--silo-content-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:197](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L197)

***

### --silo-statusbar-bg

```ts
--silo-statusbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:199](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L199)

***

### --silo-statusbar-text

```ts
--silo-statusbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:200](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L200)

***

### --silo-statusbar-bg-hover

```ts
--silo-statusbar-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:201](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L201)

***

### --silo-tab-text

```ts
--silo-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L203)

***

### --silo-tab-text-active

```ts
--silo-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:204](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L204)

***

### --silo-tab-bg-hover

```ts
--silo-tab-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:205](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L205)

***

### --silo-tab-border-active

```ts
--silo-tab-border-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:206](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L206)

***

### --silo-menu-bg

```ts
--silo-menu-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:208](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L208)

***

### --silo-menu-text

```ts
--silo-menu-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:209](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L209)

***

### --silo-menu-item-hover-bg

```ts
--silo-menu-item-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:210](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L210)

***

### --silo-menu-border

```ts
--silo-menu-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:211](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L211)

***

### --silo-modal-bg

```ts
--silo-modal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:213](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L213)

***

### --silo-modal-border

```ts
--silo-modal-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L214)

***

### --silo-notify-bg

```ts
--silo-notify-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:216](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L216)

***

### --silo-notify-text

```ts
--silo-notify-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:217](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L217)

***

### --silo-notify-text-hi

```ts
--silo-notify-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:218](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L218)

***

### --silo-list-radius

```ts
--silo-list-radius: string;
```

Defined in: [packages/sdk/src/domain-types.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L220)

***

### --silo-list-inset

```ts
--silo-list-inset: string;
```

Defined in: [packages/sdk/src/domain-types.ts:221](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L221)

***

### --silo-list-hover-bg

```ts
--silo-list-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:222](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L222)

***

### --silo-list-active-bg

```ts
--silo-list-active-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:223](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L223)

***

### --silo-list-active-outline

```ts
--silo-list-active-outline: string;
```

Defined in: [packages/sdk/src/domain-types.ts:225](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L225)

Selected-row outline — use a bordered selection instead of (or with) a fill.
