# SillyTavern import

Reads SillyTavern presets and settings bundles into a prompt stack, samplers and text rules.
`importSillyTavern.ts` is the entry point.

`stMacros.ts` rewrites ST's runtime macros into stack features: leading comments become a prompt's
`info`, setvar/getvar pairs become checkbox variables and `{% if %}` branches. `{{roll}}` needs no
rewrite. The passes work on a list of pieces (`stBlock.ts`), and `stTemplate` writes it out as one
template.

Fixtures are real exports in `src/assets/testAssets/`.
