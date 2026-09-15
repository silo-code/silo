# Interface: ThemeVars

Defined in: [packages/sdk/src/domain-types.ts:284](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L284)

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

Defined in: [packages/sdk/src/domain-types.ts:286](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L286)

***

### --silo-color-bg-hover

```ts
--silo-color-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:287](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L287)

***

### --silo-color-bg-active

```ts
--silo-color-bg-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:288](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L288)

***

### --silo-color-text

```ts
--silo-color-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:289](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L289)

***

### --silo-color-text-hi

```ts
--silo-color-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:290](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L290)

***

### --silo-color-text-lo

```ts
--silo-color-text-lo: string;
```

Defined in: [packages/sdk/src/domain-types.ts:291](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L291)

***

### --silo-color-accent

```ts
--silo-color-accent: string;
```

Defined in: [packages/sdk/src/domain-types.ts:292](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L292)

***

### --silo-color-accent-2

```ts
--silo-color-accent-2: string;
```

Defined in: [packages/sdk/src/domain-types.ts:293](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L293)

***

### --silo-color-border

```ts
--silo-color-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:294](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L294)

***

### --silo-color-border-strong

```ts
--silo-color-border-strong: string;
```

Defined in: [packages/sdk/src/domain-types.ts:295](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L295)

***

### --silo-color-ok

```ts
--silo-color-ok: string;
```

Defined in: [packages/sdk/src/domain-types.ts:296](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L296)

***

### --silo-color-warn

```ts
--silo-color-warn: string;
```

Defined in: [packages/sdk/src/domain-types.ts:297](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L297)

***

### --silo-color-err

```ts
--silo-color-err: string;
```

Defined in: [packages/sdk/src/domain-types.ts:298](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L298)

***

### --silo-color-input-bg

```ts
--silo-color-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:299](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L299)

***

### --silo-color-input-text

```ts
--silo-color-input-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:300](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L300)

***

### --silo-color-input-border

```ts
--silo-color-input-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:301](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L301)

***

### --silo-color-button-bg

```ts
--silo-color-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L302)

***

### --silo-color-button-text

```ts
--silo-color-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:303](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L303)

***

### --silo-color-toolbar-bg

```ts
--silo-color-toolbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:305](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L305)

***

### --silo-color-toolbar-text

```ts
--silo-color-toolbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:306](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L306)

***

### --silo-color-toolbar-text-disabled

```ts
--silo-color-toolbar-text-disabled: string;
```

Defined in: [packages/sdk/src/domain-types.ts:307](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L307)

***

### --silo-color-toolbar-input-bg

```ts
--silo-color-toolbar-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:308](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L308)

***

### --silo-color-content-bg

```ts
--silo-color-content-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L310)

***

### --silo-color-content-text

```ts
--silo-color-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:311](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L311)

***

### --silo-button-bg

```ts
--silo-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L317)

***

### --silo-button-text

```ts
--silo-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:318](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L318)

***

### --silo-button-border

```ts
--silo-button-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:319](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L319)

***

### --silo-button-primary-bg

```ts
--silo-button-primary-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:320](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L320)

***

### --silo-button-primary-text

```ts
--silo-button-primary-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:321](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L321)

***

### --silo-button-danger-bg

```ts
--silo-button-danger-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:322](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L322)

***

### --silo-button-danger-text

```ts
--silo-button-danger-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:323](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L323)

***

### --silo-font-ui?

```ts
optional --silo-font-ui?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:325](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L325)

***

### --silo-font-mono?

```ts
optional --silo-font-mono?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:326](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L326)

***

### --silo-content-text

```ts
--silo-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:328](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L328)

***

### --silo-content-terminal-bg

```ts
--silo-content-terminal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:329](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L329)

***

### --silo-content-editor-bg

```ts
--silo-content-editor-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:330](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L330)

***

### --silo-content-editor-selection

```ts
--silo-content-editor-selection: string;
```

Defined in: [packages/sdk/src/domain-types.ts:331](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L331)

***

### --silo-content-editor-selection-inactive

```ts
--silo-content-editor-selection-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:332](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L332)

***

### --silo-content-editor-text-dim

```ts
--silo-content-editor-text-dim: string;
```

Defined in: [packages/sdk/src/domain-types.ts:333](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L333)

***

### --silo-content-editor-text-faint

```ts
--silo-content-editor-text-faint: string;
```

Defined in: [packages/sdk/src/domain-types.ts:334](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L334)

***

### --silo-content-tab-bg

```ts
--silo-content-tab-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:335](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L335)

***

### --silo-content-tab-tray-bg

```ts
--silo-content-tab-tray-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:336](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L336)

***

### --silo-content-tab-tray-text

```ts
--silo-content-tab-tray-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:337](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L337)

***

### --silo-content-tab-text

```ts
--silo-content-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:338](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L338)

***

### --silo-content-tab-text-inactive

```ts
--silo-content-tab-text-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:339](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L339)

***

### --silo-content-tab-text-active

```ts
--silo-content-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:340](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L340)

***

### --silo-statusbar-bg

```ts
--silo-statusbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:342](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L342)

***

### --silo-statusbar-text

```ts
--silo-statusbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:343](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L343)

***

### --silo-statusbar-bg-hover

```ts
--silo-statusbar-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:344](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L344)

***

### --silo-tab-text

```ts
--silo-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:346](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L346)

***

### --silo-tab-text-active

```ts
--silo-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:347](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L347)

***

### --silo-tab-bg-hover

```ts
--silo-tab-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:348](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L348)

***

### --silo-tab-border-active

```ts
--silo-tab-border-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:349](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L349)

***

### --silo-menu-bg

```ts
--silo-menu-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:351](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L351)

***

### --silo-menu-text

```ts
--silo-menu-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:352](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L352)

***

### --silo-menu-item-hover-bg

```ts
--silo-menu-item-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:353](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L353)

***

### --silo-menu-border

```ts
--silo-menu-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:354](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L354)

***

### --silo-modal-bg

```ts
--silo-modal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:356](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L356)

***

### --silo-modal-border

```ts
--silo-modal-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:357](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L357)

***

### --silo-notify-bg

```ts
--silo-notify-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:359](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L359)

***

### --silo-notify-text

```ts
--silo-notify-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:360](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L360)

***

### --silo-notify-text-hi

```ts
--silo-notify-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:361](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L361)

***

### --silo-list-radius

```ts
--silo-list-radius: string;
```

Defined in: [packages/sdk/src/domain-types.ts:363](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L363)

***

### --silo-list-inset

```ts
--silo-list-inset: string;
```

Defined in: [packages/sdk/src/domain-types.ts:364](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L364)

***

### --silo-list-hover-bg

```ts
--silo-list-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:365](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L365)

***

### --silo-list-active-bg

```ts
--silo-list-active-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:366](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L366)

***

### --silo-list-active-outline

```ts
--silo-list-active-outline: string;
```

Defined in: [packages/sdk/src/domain-types.ts:368](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L368)

Selected-row outline — use a bordered selection instead of (or with) a fill.
