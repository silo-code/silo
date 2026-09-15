# Interface: ThemeVars

Defined in: [packages/sdk/src/domain-types.ts:266](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L266)

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

Defined in: [packages/sdk/src/domain-types.ts:268](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L268)

***

### --silo-color-bg-hover

```ts
--silo-color-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L269)

***

### --silo-color-bg-active

```ts
--silo-color-bg-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:270](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L270)

***

### --silo-color-text

```ts
--silo-color-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L271)

***

### --silo-color-text-hi

```ts
--silo-color-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:272](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L272)

***

### --silo-color-text-lo

```ts
--silo-color-text-lo: string;
```

Defined in: [packages/sdk/src/domain-types.ts:273](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L273)

***

### --silo-color-accent

```ts
--silo-color-accent: string;
```

Defined in: [packages/sdk/src/domain-types.ts:274](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L274)

***

### --silo-color-accent-2

```ts
--silo-color-accent-2: string;
```

Defined in: [packages/sdk/src/domain-types.ts:275](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L275)

***

### --silo-color-border

```ts
--silo-color-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L276)

***

### --silo-color-border-strong

```ts
--silo-color-border-strong: string;
```

Defined in: [packages/sdk/src/domain-types.ts:277](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L277)

***

### --silo-color-ok

```ts
--silo-color-ok: string;
```

Defined in: [packages/sdk/src/domain-types.ts:278](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L278)

***

### --silo-color-warn

```ts
--silo-color-warn: string;
```

Defined in: [packages/sdk/src/domain-types.ts:279](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L279)

***

### --silo-color-err

```ts
--silo-color-err: string;
```

Defined in: [packages/sdk/src/domain-types.ts:280](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L280)

***

### --silo-color-input-bg

```ts
--silo-color-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:281](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L281)

***

### --silo-color-input-text

```ts
--silo-color-input-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:282](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L282)

***

### --silo-color-input-border

```ts
--silo-color-input-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:283](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L283)

***

### --silo-color-button-bg

```ts
--silo-color-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:284](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L284)

***

### --silo-color-button-text

```ts
--silo-color-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:285](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L285)

***

### --silo-color-toolbar-bg

```ts
--silo-color-toolbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:287](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L287)

***

### --silo-color-toolbar-text

```ts
--silo-color-toolbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:288](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L288)

***

### --silo-color-toolbar-text-disabled

```ts
--silo-color-toolbar-text-disabled: string;
```

Defined in: [packages/sdk/src/domain-types.ts:289](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L289)

***

### --silo-color-toolbar-input-bg

```ts
--silo-color-toolbar-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:290](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L290)

***

### --silo-color-content-bg

```ts
--silo-color-content-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:292](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L292)

***

### --silo-color-content-text

```ts
--silo-color-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:293](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L293)

***

### --silo-button-bg

```ts
--silo-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:299](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L299)

***

### --silo-button-text

```ts
--silo-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:300](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L300)

***

### --silo-button-border

```ts
--silo-button-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:301](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L301)

***

### --silo-button-primary-bg

```ts
--silo-button-primary-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L302)

***

### --silo-button-primary-text

```ts
--silo-button-primary-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:303](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L303)

***

### --silo-button-danger-bg

```ts
--silo-button-danger-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:304](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L304)

***

### --silo-button-danger-text

```ts
--silo-button-danger-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:305](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L305)

***

### --silo-font-ui?

```ts
optional --silo-font-ui?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:307](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L307)

***

### --silo-font-mono?

```ts
optional --silo-font-mono?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:308](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L308)

***

### --silo-content-text

```ts
--silo-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L310)

***

### --silo-content-terminal-bg

```ts
--silo-content-terminal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:311](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L311)

***

### --silo-content-editor-bg

```ts
--silo-content-editor-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:312](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L312)

***

### --silo-content-editor-selection

```ts
--silo-content-editor-selection: string;
```

Defined in: [packages/sdk/src/domain-types.ts:313](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L313)

***

### --silo-content-editor-selection-inactive

```ts
--silo-content-editor-selection-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:314](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L314)

***

### --silo-content-editor-text-dim

```ts
--silo-content-editor-text-dim: string;
```

Defined in: [packages/sdk/src/domain-types.ts:315](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L315)

***

### --silo-content-editor-text-faint

```ts
--silo-content-editor-text-faint: string;
```

Defined in: [packages/sdk/src/domain-types.ts:316](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L316)

***

### --silo-content-tab-bg

```ts
--silo-content-tab-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L317)

***

### --silo-content-tab-tray-bg

```ts
--silo-content-tab-tray-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:318](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L318)

***

### --silo-content-tab-tray-text

```ts
--silo-content-tab-tray-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:319](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L319)

***

### --silo-content-tab-text

```ts
--silo-content-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:320](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L320)

***

### --silo-content-tab-text-inactive

```ts
--silo-content-tab-text-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:321](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L321)

***

### --silo-content-tab-text-active

```ts
--silo-content-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:322](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L322)

***

### --silo-statusbar-bg

```ts
--silo-statusbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:324](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L324)

***

### --silo-statusbar-text

```ts
--silo-statusbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:325](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L325)

***

### --silo-statusbar-bg-hover

```ts
--silo-statusbar-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:326](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L326)

***

### --silo-tab-text

```ts
--silo-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:328](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L328)

***

### --silo-tab-text-active

```ts
--silo-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:329](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L329)

***

### --silo-tab-bg-hover

```ts
--silo-tab-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:330](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L330)

***

### --silo-tab-border-active

```ts
--silo-tab-border-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:331](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L331)

***

### --silo-menu-bg

```ts
--silo-menu-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:333](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L333)

***

### --silo-menu-text

```ts
--silo-menu-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:334](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L334)

***

### --silo-menu-item-hover-bg

```ts
--silo-menu-item-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:335](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L335)

***

### --silo-menu-border

```ts
--silo-menu-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:336](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L336)

***

### --silo-modal-bg

```ts
--silo-modal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:338](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L338)

***

### --silo-modal-border

```ts
--silo-modal-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:339](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L339)

***

### --silo-notify-bg

```ts
--silo-notify-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:341](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L341)

***

### --silo-notify-text

```ts
--silo-notify-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:342](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L342)

***

### --silo-notify-text-hi

```ts
--silo-notify-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:343](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L343)

***

### --silo-list-radius

```ts
--silo-list-radius: string;
```

Defined in: [packages/sdk/src/domain-types.ts:345](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L345)

***

### --silo-list-inset

```ts
--silo-list-inset: string;
```

Defined in: [packages/sdk/src/domain-types.ts:346](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L346)

***

### --silo-list-hover-bg

```ts
--silo-list-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:347](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L347)

***

### --silo-list-active-bg

```ts
--silo-list-active-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:348](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L348)

***

### --silo-list-active-outline

```ts
--silo-list-active-outline: string;
```

Defined in: [packages/sdk/src/domain-types.ts:350](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L350)

Selected-row outline — use a bordered selection instead of (or with) a fill.
