# Sampler params

A sampler param is a data row (`ParamDef` in `paramDef.ts`), not code. A new sampler needs no
release. `builtins.ts` holds the rows that ship.

`InstructTemplate` (the text-completion format) and `templatePresets` are here too. How they're
used is in `core/prompt/README.md`. `templateFile.ts` is the standalone template export: it
carries no endpoint and no key by construction.
