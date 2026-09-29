import { parseSillyTavern } from './src/core/sillytavern/importSillyTavern.ts'
import { readFileSync } from 'node:fs'
const src = readFileSync('C:/Users/Dominique/Downloads/Realistic Frankenstein 2.2 — Nuts & Bolts.json','utf8')
const r = parseSillyTavern(src, 'x.json')
for (const v of r.stack.variables) console.log(v.id, v.value, (v.info||'').length, /colou?r/i.test(v.info||'')?'COLOR: '+(v.info.match(/[^.\n]*colou?r[^.\n]*/gi)||[]).join(' // ').slice(0,300):'')
const j = JSON.parse(src); const rd = j.prompts.find(p=>/README/.test(p.name)).content
console.log((rd.match(/[^\n]*colou?r[^\n]*/gi)||[]).join('\n'))
for (const b of r.stack.active) if (b.info) console.log('INFO on', b.label.slice(0,20), b.info.length)
