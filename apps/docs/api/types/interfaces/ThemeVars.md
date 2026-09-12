# Interface: ThemeVars

Defined in: [packages/sdk/src/domain-types.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L254)

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

Defined in: [packages/sdk/src/domain-types.ts:256](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L256)

***

### --silo-color-bg-hover

```ts
--silo-color-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L257)

***

### --silo-color-bg-active

```ts
--silo-color-bg-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:258](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L258)

***

### --silo-color-text

```ts
--silo-color-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L259)

***

### --silo-color-text-hi

```ts
--silo-color-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L260)

***

### --silo-color-text-lo

```ts
--silo-color-text-lo: string;
```

Defined in: [packages/sdk/src/domain-types.ts:261](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L261)

***

### --silo-color-accent

```ts
--silo-color-accent: string;
```

Defined in: [packages/sdk/src/domain-types.ts:262](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L262)

***

### --silo-color-accent-2

```ts
--silo-color-accent-2: string;
```

Defined in: [packages/sdk/src/domain-types.ts:263](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L263)

***

### --silo-color-border

```ts
--silo-color-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:264](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L264)

***

### --silo-color-border-strong

```ts
--silo-color-border-strong: string;
```

Defined in: [packages/sdk/src/domain-types.ts:265](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L265)

***

### --silo-color-ok

```ts
--silo-color-ok: string;
```

Defined in: [packages/sdk/src/domain-types.ts:266](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L266)

***

### --silo-color-warn

```ts
--silo-color-warn: string;
```

Defined in: [packages/sdk/src/domain-types.ts:267](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L267)

***

### --silo-color-err

```ts
--silo-color-err: string;
```

Defined in: [packages/sdk/src/domain-types.ts:268](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L268)

***

### --silo-color-input-bg

```ts
--silo-color-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L269)

***

### --silo-color-input-text

```ts
--silo-color-input-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:270](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L270)

***

### --silo-color-input-border

```ts
--silo-color-input-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L271)

***

### --silo-color-button-bg

```ts
--silo-color-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:272](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L272)

***

### --silo-color-button-text

```ts
--silo-color-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:273](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L273)

***

### --silo-color-toolbar-bg

```ts
--silo-color-toolbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:275](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L275)

***

### --silo-color-toolbar-text

```ts
--silo-color-toolbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L276)

***

### --silo-color-toolbar-text-disabled

```ts
--silo-color-toolbar-text-disabled: string;
```

Defined in: [packages/sdk/src/domain-types.ts:277](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L277)

***

### --silo-color-toolbar-input-bg

```ts
--silo-color-toolbar-input-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:278](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L278)

***

### --silo-color-content-bg

```ts
--silo-color-content-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:280](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L280)

***

### --silo-color-content-text

```ts
--silo-color-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:281](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L281)

***

### --silo-button-bg

```ts
--silo-button-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:287](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L287)

***

### --silo-button-text

```ts
--silo-button-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:288](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L288)

***

### --silo-button-border

```ts
--silo-button-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:289](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L289)

***

### --silo-button-primary-bg

```ts
--silo-button-primary-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:290](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L290)

***

### --silo-button-primary-text

```ts
--silo-button-primary-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:291](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L291)

***

### --silo-button-danger-bg

```ts
--silo-button-danger-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:292](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L292)

***

### --silo-button-danger-text

```ts
--silo-button-danger-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:293](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L293)

***

### --silo-font-ui?

```ts
optional --silo-font-ui?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:295](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L295)

***

### --silo-font-mono?

```ts
optional --silo-font-mono?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:296](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L296)

***

### --silo-content-text

```ts
--silo-content-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:298](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L298)

***

### --silo-content-terminal-bg

```ts
--silo-content-terminal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:299](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L299)

***

### --silo-content-editor-bg

```ts
--silo-content-editor-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:300](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L300)

***

### --silo-content-editor-selection

```ts
--silo-content-editor-selection: string;
```

Defined in: [packages/sdk/src/domain-types.ts:301](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L301)

***

### --silo-content-editor-selection-inactive

```ts
--silo-content-editor-selection-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L302)

***

### --silo-content-editor-text-dim

```ts
--silo-content-editor-text-dim: string;
```

Defined in: [packages/sdk/src/domain-types.ts:303](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L303)

***

### --silo-content-editor-text-faint

```ts
--silo-content-editor-text-faint: string;
```

Defined in: [packages/sdk/src/domain-types.ts:304](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L304)

***

### --silo-content-tab-bg

```ts
--silo-content-tab-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:305](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L305)

***

### --silo-content-tab-tray-bg

```ts
--silo-content-tab-tray-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:306](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L306)

***

### --silo-content-tab-tray-text

```ts
--silo-content-tab-tray-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:307](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L307)

***

### --silo-content-tab-text

```ts
--silo-content-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:308](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L308)

***

### --silo-content-tab-text-inactive

```ts
--silo-content-tab-text-inactive: string;
```

Defined in: [packages/sdk/src/domain-types.ts:309](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L309)

***

### --silo-content-tab-text-active

```ts
--silo-content-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L310)

***

### --silo-statusbar-bg

```ts
--silo-statusbar-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:312](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L312)

***

### --silo-statusbar-text

```ts
--silo-statusbar-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:313](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L313)

***

### --silo-statusbar-bg-hover

```ts
--silo-statusbar-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:314](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L314)

***

### --silo-tab-text

```ts
--silo-tab-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:316](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L316)

***

### --silo-tab-text-active

```ts
--silo-tab-text-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L317)

***

### --silo-tab-bg-hover

```ts
--silo-tab-bg-hover: string;
```

Defined in: [packages/sdk/src/domain-types.ts:318](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L318)

***

### --silo-tab-border-active

```ts
--silo-tab-border-active: string;
```

Defined in: [packages/sdk/src/domain-types.ts:319](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L319)

***

### --silo-menu-bg

```ts
--silo-menu-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:321](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L321)

***

### --silo-menu-text

```ts
--silo-menu-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:322](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L322)

***

### --silo-menu-item-hover-bg

```ts
--silo-menu-item-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:323](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L323)

***

### --silo-menu-border

```ts
--silo-menu-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:324](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L324)

***

### --silo-modal-bg

```ts
--silo-modal-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:326](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L326)

***

### --silo-modal-border

```ts
--silo-modal-border: string;
```

Defined in: [packages/sdk/src/domain-types.ts:327](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L327)

***

### --silo-notify-bg

```ts
--silo-notify-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:329](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L329)

***

### --silo-notify-text

```ts
--silo-notify-text: string;
```

Defined in: [packages/sdk/src/domain-types.ts:330](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L330)

***

### --silo-notify-text-hi

```ts
--silo-notify-text-hi: string;
```

Defined in: [packages/sdk/src/domain-types.ts:331](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L331)

***

### --silo-list-radius

```ts
--silo-list-radius: string;
```

Defined in: [packages/sdk/src/domain-types.ts:333](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L333)

***

### --silo-list-inset

```ts
--silo-list-inset: string;
```

Defined in: [packages/sdk/src/domain-types.ts:334](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L334)

***

### --silo-list-hover-bg

```ts
--silo-list-hover-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:335](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L335)

***

### --silo-list-active-bg

```ts
--silo-list-active-bg: string;
```

Defined in: [packages/sdk/src/domain-types.ts:336](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L336)

***

### --silo-list-active-outline

```ts
--silo-list-active-outline: string;
```

Defined in: [packages/sdk/src/domain-types.ts:338](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L338)

Selected-row outline — use a bordered selection instead of (or with) a fill.
