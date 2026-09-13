// Run: node --experimental-strip-types src/core/prompt/checkConditions.ts
import assert from 'node:assert'
import type { Character } from '../storage/types'
import { emptyColors } from '../storage/types.ts'
import { narratorCharacter, narratorId } from '../multiplayer/narrator.ts'
import {
  blocksMentionCondition,
  mentionsCondition,
  promptConditions,
  resolveConditions,
  type PromptConditions,
} from './conditions.ts'
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
  const text = '[if Narrator]\nnarrate\n[else]\nact\n[endif]'
  assert.strictEqual(resolveConditions(text, narrator), 'narrate')
  assert.strictEqual(resolveConditions(text, speaking), 'act')
}

// --- text outside the conditional is untouched, both sides ---------------
{
  const text = 'before\n[if Narrator]\nnarrate\n[else]\nact\n[endif]\nafter'
  assert.strictEqual(resolveConditions(text, narrator), 'before\nnarrate\nafter')
  assert.strictEqual(resolveConditions(text, speaking), 'before\nact\nafter')
}

// --- an [if] with no [else] simply drops --------------------------------
{
  const text = 'keep\n[if Narrator]\ngone\n[endif]\nkeep2'
  assert.strictEqual(resolveConditions(text, speaking), 'keep\nkeep2')
  assert.strictEqual(resolveConditions(text, narrator), 'keep\ngone\nkeep2')
}

// --- [not] inverts ------------------------------------------------------
{
  const text = '[if not Narrator]\nact\n[endif]'
  assert.strictEqual(resolveConditions(text, speaking), 'act')
  assert.strictEqual(resolveConditions(text, narrator), '')
}

// --- [elseif]: first match wins, later matches are skipped --------------
{
  const text = '[if Narrator]\na\n[elseif char1]\nb\n[elseif char2]\nc\n[else]\nd\n[endif]'
  assert.strictEqual(resolveConditions(text, narrator), 'a', 'narrator matches first')
  assert.strictEqual(resolveConditions(text, speaking), 'b', 'char1 wins, char2 not consulted')
  assert.strictEqual(resolveConditions(text, { narrator: false }), 'd', 'nothing matched')
  assert.strictEqual(
    resolveConditions(text, { narrator: false, char1: false, char2: true }),
    'c',
    'a later elseif can match',
  )
}

// --- [elseif not X] -----------------------------------------------------
{
  const text = '[if Narrator]\na\n[elseif not char2]\nb\n[else]\nc\n[endif]'
  assert.strictEqual(resolveConditions(text, speaking), 'b')
  assert.strictEqual(resolveConditions(text, { narrator: false, char2: true }), 'c')
}

// --- nesting two deep ---------------------------------------------------
{
  const text = [
    '[if Narrator]',
    'narrating',
    '[if char2]',
    'two of them',
    '[else]',
    'just one',
    '[endif]',
    'done',
    '[else]',
    'acting',
    '[endif]',
  ].join('\n')
  assert.strictEqual(resolveConditions(text, narrator), 'narrating\ntwo of them\ndone')
  assert.strictEqual(
    resolveConditions(text, { narrator: true, char2: false }),
    'narrating\njust one\ndone',
  )
  assert.strictEqual(resolveConditions(text, speaking), 'acting', 'inner level drops with its parent')
}

// --- keywords and names are case-insensitive, indentation allowed --------
{
  const text = '  [IF nArRaToR]\nyes\n  [EndIf]'
  assert.strictEqual(resolveConditions(text, narrator), 'yes')
}

// --- an unknown condition is false, not an error ------------------------
{
  const text = '[if Wizard]\nspell\n[else]\nno spell\n[endif]'
  assert.strictEqual(resolveConditions(text, narrator), 'no spell')
}

// --- malformed directives stay literal ---------------------------------
{
  // Prose on the directive line: not a directive.
  const inline = '[if Narrator] narrate now'
  assert.strictEqual(resolveConditions(inline, narrator), inline)

  // A stray [endif] with nothing open.
  assert.strictEqual(resolveConditions('text\n[endif]\nmore', narrator), 'text\n[endif]\nmore')

  // [else] outside any [if].
  assert.strictEqual(resolveConditions('[else]\nx', narrator), '[else]\nx')

  // [if] with no condition name, and [else] with one.
  assert.strictEqual(resolveConditions('[if]\nx\n[endif]', narrator), '[if]\nx\n[endif]')
  assert.strictEqual(resolveConditions('[else Narrator]', narrator), '[else Narrator]')

  // An unclosed [if] comes back verbatim, branch directives included.
  const unclosed = 'a\n[if Narrator]\nb\n[else]\nc'
  assert.strictEqual(resolveConditions(unclosed, narrator), unclosed)
  assert.strictEqual(resolveConditions(unclosed, speaking), unclosed)

  // Text with no bracket at all is returned as-is.
  assert.strictEqual(resolveConditions('plain text', narrator), 'plain text')
}

// --- an unclosed inner [if] does not swallow the outer one --------------
{
  const text = '[if Narrator]\nkept\n[if char3]\nragged\n[endif]'
  // The outer [endif] closes the inner [if]; the outer level is then unclosed and restored.
  assert.strictEqual(resolveConditions(text, narrator), '[if Narrator]\nkept')
}

// --- tokens inside a dropped branch are never seen by the caller --------
{
  const text = '[if Narrator]\n{{char3}}\n[else]\n{{charDescription}}\n[endif]'
  assert.ok(!resolveConditions(text, speaking).includes('{{char3}}'))
  assert.strictEqual(resolveConditions(text, speaking), '{{charDescription}}')
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

  const text = ['[if blackjack]', 'deal', '[elseif goFish]', 'ask', '[else]', 'chat', '[endif]'].join('\n')
  assert.strictEqual(resolveConditions(text, dealing), 'deal')
  assert.strictEqual(resolveConditions(text, fishing), 'ask')
  assert.strictEqual(resolveConditions(text, off), 'chat')
}

// --- mentionsCondition ---------------------------------------------------
{
  assert.strictEqual(mentionsCondition('[if Narrator]\nx\n[endif]', 'narrator'), true)
  assert.strictEqual(mentionsCondition('[if not narrator]\nx\n[endif]', 'narrator'), true)
  assert.strictEqual(mentionsCondition('[if game]\nx\n[elseif Narrator]\ny\n[endif]', 'narrator'), true)
  assert.strictEqual(mentionsCondition('  [if narrator]  ', 'narrator'), true, 'the line is trimmed')

  assert.strictEqual(mentionsCondition('plain prose about a narrator', 'narrator'), false)
  assert.strictEqual(mentionsCondition('', 'narrator'), false)
  // The same near-misses resolveConditions treats as prose.
  assert.strictEqual(mentionsCondition('[if narrator', 'narrator'), false)
  assert.strictEqual(mentionsCondition('[if narrator] and then', 'narrator'), false)
  // [else] and [endif] carry no name, so neither counts as branching on one.
  assert.strictEqual(mentionsCondition('[else]\n[endif]', 'narrator'), false)
  assert.strictEqual(mentionsCondition('[if game]\nx\n[endif]', 'narrator'), false)
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
  assert.strictEqual(blocksMentionCondition([block({ content: '[if narrator]' })], 'narrator'), true)
  assert.strictEqual(blocksMentionCondition([block({ content: 'nothing' })], 'narrator'), false)
  assert.strictEqual(
    blocksMentionCondition([block({ closeContent: '[if narrator]' })], 'narrator'),
    true,
    'the closing half counts',
  )

  // A disabled block contributes nothing to the prompt, so it is not the stack having an opinion.
  assert.strictEqual(
    blocksMentionCondition([block({ content: '[if narrator]', disabled: true })], 'narrator'),
    false,
  )

  // Nested, and past a sibling that says nothing.
  assert.strictEqual(
    blocksMentionCondition(
      [block({ content: 'a' }), block({ children: [block({ content: '[if narrator]' })] })],
      'narrator',
    ),
    true,
  )
  // A disabled container takes its children with it.
  assert.strictEqual(
    blocksMentionCondition(
      [block({ disabled: true, children: [block({ content: '[if narrator]' })] })],
      'narrator',
    ),
    false,
  )

  // Only the selected variant of an options block is read: the others are not in the prompt.
  const options = [
    { name: 'plain', content: 'nothing' },
    { name: 'narrated', content: '[if narrator]' },
  ]
  assert.strictEqual(blocksMentionCondition([block({ options })], 'narrator'), false, 'defaults to 0')
  assert.strictEqual(blocksMentionCondition([block({ options, activeOption: 1 })], 'narrator'), true)
  assert.strictEqual(
    blocksMentionCondition([block({ options, activeOption: 9, content: '[if narrator]' })], 'narrator'),
    false,
    'an out-of-range option reads as empty rather than falling back to content',
  )
}

console.log('ok')
