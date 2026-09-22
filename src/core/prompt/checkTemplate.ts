// Run: node --experimental-strip-types src/core/prompt/checkTemplate.ts
import assert from 'node:assert'
import type { Character } from '../storage/types'
import { emptyColors } from '../storage/types.ts'
import { narratorCharacter, narratorId } from '../multiplayer/narrator.ts'
import {
  blocksMentionCondition,
  mentionsCondition,
  promptConditions,
  resolveTemplate,
  variableValues,
  type PromptConditions,
} from './template.ts'
import type { PromptBlock } from '../storage/types'

function character(name: string, id: number): Character {
  return {
    id,
    ownerId: 'local',
    name,
    avatar: '',
    description: `${name} is here.`,
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: '',
    altDescriptions: [],
    activeDescriptionIndex: -1,
    alternateGreetings: [],
    gallery: [],
    createdAt: 0,
    updatedAt: 0,
    colors: emptyColors(),
  }
}

const damien = character('Damien', 7)
const asha = character('Asha', 8)

const narrator: PromptConditions = { narrator: true, char1: true, char2: true }
const speaking: PromptConditions = { narrator: false, char1: true, char2: false }

// --- promptConditions reflects the speaker and the filled slots -----------
{
  const flags = promptConditions(narratorCharacter(), [damien, asha])
  assert.strictEqual(flags.narrator, true)
  assert.strictEqual(flags.char1, true)
  assert.strictEqual(flags.char2, true)
  assert.strictEqual(flags.char3, false)
  assert.strictEqual(flags.char4, false)

  const solo = promptConditions(damien)
  assert.strictEqual(solo.narrator, false)
  assert.strictEqual(solo.char1, false, 'no cast means no filled slots')

  assert.strictEqual(
    promptConditions(character('Fake', narratorId)).narrator,
    true,
    'narrator is decided by id, not by name',
  )
}

// --- if / else picks one branch and eats the directive lines --------------
{
  const text = '{% if Narrator %}\nnarrate\n{% else %}\nact\n{% endif %}'
  assert.strictEqual(resolveTemplate(text, narrator), 'narrate')
  assert.strictEqual(resolveTemplate(text, speaking), 'act')
}

// --- text outside the conditional is untouched, both sides ---------------
{
  const text = 'before\n{% if Narrator %}\nnarrate\n{% else %}\nact\n{% endif %}\nafter'
  assert.strictEqual(resolveTemplate(text, narrator), 'before\nnarrate\nafter')
  assert.strictEqual(resolveTemplate(text, speaking), 'before\nact\nafter')
}

// --- an [if] with no {% else %} simply drops --------------------------------
{
  const text = 'keep\n{% if Narrator %}\ngone\n{% endif %}\nkeep2'
  assert.strictEqual(resolveTemplate(text, speaking), 'keep\nkeep2')
  assert.strictEqual(resolveTemplate(text, narrator), 'keep\ngone\nkeep2')
}

// --- [not] inverts ------------------------------------------------------
{
  const text = '{% if not Narrator %}\nact\n{% endif %}'
  assert.strictEqual(resolveTemplate(text, speaking), 'act')
  assert.strictEqual(resolveTemplate(text, narrator), '')
}

// --- [elseif]: first match wins, later matches are skipped --------------
{
  const text = '{% if Narrator %}\na\n{% elif char1 %}\nb\n{% elif char2 %}\nc\n{% else %}\nd\n{% endif %}'
  assert.strictEqual(resolveTemplate(text, narrator), 'a', 'narrator matches first')
  assert.strictEqual(resolveTemplate(text, speaking), 'b', 'char1 wins, char2 not consulted')
  assert.strictEqual(resolveTemplate(text, { narrator: false }), 'd', 'nothing matched')
  assert.strictEqual(
    resolveTemplate(text, { narrator: false, char1: false, char2: true }),
    'c',
    'a later elseif can match',
  )
}

// --- {% elif not X %} -----------------------------------------------------
{
  const text = '{% if Narrator %}\na\n{% elif not char2 %}\nb\n{% else %}\nc\n{% endif %}'
  assert.strictEqual(resolveTemplate(text, speaking), 'b')
  assert.strictEqual(resolveTemplate(text, { narrator: false, char2: true }), 'c')
}

// --- nesting two deep ---------------------------------------------------
{
  const text = [
    '{% if Narrator %}',
    'narrating',
    '{% if char2 %}',
    'two of them',
    '{% else %}',
    'just one',
    '{% endif %}',
    'done',
    '{% else %}',
    'acting',
    '{% endif %}',
  ].join('\n')
  assert.strictEqual(resolveTemplate(text, narrator), 'narrating\ntwo of them\ndone')
  assert.strictEqual(
    resolveTemplate(text, { narrator: true, char2: false }),
    'narrating\njust one\ndone',
  )
  assert.strictEqual(resolveTemplate(text, speaking), 'acting', 'inner level drops with its parent')
}

// --- keywords and names are case-insensitive, indentation allowed --------
{
  const text = '  {% IF nArRaToR %}\nyes\n  {% EndIf %}'
  assert.strictEqual(resolveTemplate(text, narrator), 'yes')
}

// --- an unknown condition is false, not an error ------------------------
{
  const text = '{% if Wizard %}\nspell\n{% else %}\nno spell\n{% endif %}'
  assert.strictEqual(resolveTemplate(text, narrator), 'no spell')
}

// --- malformed directives stay literal ---------------------------------
{
  // An inline tag that never closes on its line.
  const inline = '{% if Narrator %} narrate now'
  assert.strictEqual(resolveTemplate(inline, narrator), inline)

  // A stray {% endif %} with nothing open.
  assert.strictEqual(resolveTemplate('text\n{% endif %}\nmore', narrator), 'text\n{% endif %}\nmore')

  // {% else %} outside any [if].
  assert.strictEqual(resolveTemplate('{% else %}\nx', narrator), '{% else %}\nx')

  // [if] with no condition name, and {% else %} with one.
  assert.strictEqual(resolveTemplate('{% if %}\nx\n{% endif %}', narrator), '{% if %}\nx\n{% endif %}')
  assert.strictEqual(resolveTemplate('{% else Narrator %}', narrator), '{% else Narrator %}')

  // An unclosed [if] comes back verbatim, branch directives included.
  const unclosed = 'a\n{% if Narrator %}\nb\n{% else %}\nc'
  assert.strictEqual(resolveTemplate(unclosed, narrator), unclosed)
  assert.strictEqual(resolveTemplate(unclosed, speaking), unclosed)

  // Text with no bracket at all is returned as-is.
  assert.strictEqual(resolveTemplate('plain text', narrator), 'plain text')
}

// --- an unclosed inner [if] does not swallow the outer one --------------
{
  const text = '{% if Narrator %}\nkept\n{% if char3 %}\nragged\n{% endif %}'
  // The outer {% endif %} closes the inner [if]; the outer level is then unclosed and restored.
  assert.strictEqual(resolveTemplate(text, narrator), '{% if Narrator %}\nkept')
}

// --- tokens inside a dropped branch are never seen by the caller --------
{
  const text = '{% if Narrator %}\n{{char3}}\n{% else %}\n{{charDescription}}\n{% endif %}'
  assert.ok(!resolveTemplate(text, speaking).includes('{{char3}}'))
  assert.strictEqual(resolveTemplate(text, speaking), '{{charDescription}}')
}

// --- the game flags ------------------------------------------------------
{
  const off = promptConditions(damien)
  assert.strictEqual(off.game, false)
  assert.strictEqual(off.blackjack, undefined)

  const dealing = promptConditions(damien, undefined, 'blackjack')
  assert.strictEqual(dealing.game, true)
  assert.strictEqual(dealing.blackjack, true)
  // The other game is absent, not false, which reads the same to render().
  assert.strictEqual(dealing.gofish, undefined)

  // The name is written as it is in GameKind and folded on the way in.
  const fishing = promptConditions(damien, undefined, 'goFish')
  assert.strictEqual(fishing.gofish, true)

  const text = ['{% if blackjack %}', 'deal', '{% elif goFish %}', 'ask', '{% else %}', 'chat', '{% endif %}'].join('\n')
  assert.strictEqual(resolveTemplate(text, dealing), 'deal')
  assert.strictEqual(resolveTemplate(text, fishing), 'ask')
  assert.strictEqual(resolveTemplate(text, off), 'chat')
}

// --- mentionsCondition ---------------------------------------------------
{
  assert.strictEqual(mentionsCondition('{% if Narrator %}\nx\n{% endif %}', 'narrator'), true)
  assert.strictEqual(mentionsCondition('{% if not narrator %}\nx\n{% endif %}', 'narrator'), true)
  assert.strictEqual(mentionsCondition('{% if game %}\nx\n{% elif Narrator %}\ny\n{% endif %}', 'narrator'), true)
  assert.strictEqual(mentionsCondition('  {% if narrator %}  ', 'narrator'), true, 'the line is trimmed')

  assert.strictEqual(mentionsCondition('plain prose about a narrator', 'narrator'), false)
  assert.strictEqual(mentionsCondition('', 'narrator'), false)
  // The same near-misses resolveTemplate treats as prose.
  assert.strictEqual(mentionsCondition('{% if narrator', 'narrator'), false)
  assert.strictEqual(mentionsCondition('{% if narrator %} and then', 'narrator'), true, 'inline tags count')
  // {% else %} and {% endif %} carry no name, so neither counts as branching on one.
  assert.strictEqual(mentionsCondition('{% else %}\n{% endif %}', 'narrator'), false)
  assert.strictEqual(mentionsCondition('{% if game %}\nx\n{% endif %}', 'narrator'), false)
}

// --- blocksMentionCondition ----------------------------------------------
{
  const block = (patch: Partial<PromptBlock>): PromptBlock => ({
    id: 'b',
    label: 'Block',
    source: 'text',
    role: 'system',
    content: '',
    ...patch,
  })

  assert.strictEqual(blocksMentionCondition([], 'narrator'), false)
  assert.strictEqual(blocksMentionCondition([block({ content: '{% if narrator %}' })], 'narrator'), true)
  assert.strictEqual(blocksMentionCondition([block({ content: 'nothing' })], 'narrator'), false)
  assert.strictEqual(
    blocksMentionCondition([block({ closeContent: '{% if narrator %}' })], 'narrator'),
    true,
    'the closing half counts',
  )

  // A disabled block contributes nothing to the prompt, so it is not the stack having an opinion.
  assert.strictEqual(
    blocksMentionCondition([block({ content: '{% if narrator %}', disabled: true })], 'narrator'),
    false,
  )

  // Nested, and past a sibling that says nothing.
  assert.strictEqual(
    blocksMentionCondition(
      [block({ content: 'a' }), block({ children: [block({ content: '{% if narrator %}' })] })],
      'narrator',
    ),
    true,
  )
  // A disabled container takes its children with it.
  assert.strictEqual(
    blocksMentionCondition(
      [block({ disabled: true, children: [block({ content: '{% if narrator %}' })] })],
      'narrator',
    ),
    false,
  )
}

// --- tracker comparisons ---------------------------------------------------
{
  const flags: PromptConditions = { affection: 60, mood: 'Angry', inventory: ['rope', 'Sword'], narrator: false }
  const r = (cond: string) => resolveTemplate(`{% if ${cond} %}\nyes\n{% else %}\nno\n{% endif %}`, flags)
  assert.strictEqual(r('affection > 50'), 'yes')
  assert.strictEqual(r('affection>60'), 'no')
  assert.strictEqual(r('affection >= 60'), 'yes')
  assert.strictEqual(r('affection <= 59.5'), 'no')
  assert.strictEqual(r('affection != 60'), 'no')
  assert.strictEqual(r('not affection < 10'), 'yes')
  assert.strictEqual(r('affection > lots'), 'no', 'a non-number never compares')
  assert.strictEqual(r('mood = angry'), 'yes')
  assert.strictEqual(r('mood = "angry"'), 'yes')
  assert.strictEqual(r('mood > angry'), 'no', 'text takes = and != only')
  assert.strictEqual(r('inventory = sword'), 'yes')
  assert.strictEqual(r('inventory != rope'), 'no')
  assert.strictEqual(r('inventory'), 'yes')
  assert.strictEqual(r('charm > 1'), 'no', 'an unknown name is false')
  assert.strictEqual(r('narrator = 1'), 'no', 'a boolean never compares')
  // An operator with nothing after it is prose.
  assert.strictEqual(resolveTemplate('{% if affection > %}', flags), '{% if affection > %}')
  // elseif compares too.
  assert.strictEqual(
    resolveTemplate('{% if affection > 80 %}\nlove\n{% elif affection > 40 %}\nlike\n{% endif %}', flags),
    'like',
  )
}

// --- inline tags close on their own line ----------------------------------
{
  assert.strictEqual(resolveTemplate('Be {% if narrator %}wry{% else %}plain{% endif %}.', narrator), 'Be wry.')
  assert.strictEqual(resolveTemplate('Be {% if narrator %}wry{% else %}plain{% endif %}.', speaking), 'Be plain.')
  // An inline if left open stays literal; one line never reaches into the next.
  assert.strictEqual(resolveTemplate('a {% if narrator %}b\nc {% endif %}', narrator), 'a {% if narrator %}b\nc {% endif %}')
  // `==` reads as `=`, Django's spelling.
  assert.strictEqual(resolveTemplate('{% if mood == calm %}x{% endif %}', { mood: 'Calm' }), 'x')
}

// --- stack variables --------------------------------------------------------
{
  const vars = variableValues([
    { id: 'Tone', label: 'Tone', kind: 'dropdown', options: ['dark', 'light'], value: 'dark' },
    { id: 'words', label: 'Words', kind: 'sliderRange', min: 0, max: 500, step: 10, value: [150, 300] },
    { id: 'gore', label: 'Gore', kind: 'checkbox', value: false },
  ])
  assert.deepStrictEqual(vars, { tone: 'dark', words_start: 150, words_end: 300, gore: false })
  assert.strictEqual(resolveTemplate('{{words_start}} to {{WORDS_END}} words', {}, vars), '150 to 300 words')
  assert.strictEqual(resolveTemplate('{{tone}} {{unknown}} {{char}}', {}, vars), 'dark {{unknown}} {{char}}')
  const text = '{% if tone = light %}\nsun\n{% elif words_end > 200 %}\nlong\n{% endif %}\n{% if gore %}\nblood\n{% endif %}'
  assert.strictEqual(resolveTemplate(text, {}, vars), 'long')
  // A variable wins a clash with a built-in name.
  assert.strictEqual(resolveTemplate('{% if narrator %}\nyes\n{% endif %}', narrator, { narrator: false }), '')
}

console.log('ok')
