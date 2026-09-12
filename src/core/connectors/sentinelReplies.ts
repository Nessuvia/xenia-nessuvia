/**
 * What the sentinel connection says. Two lists, and which one a reply comes from depends only on
 * how many messages have been sent.
 *
 * A `.ts` file rather than a `.txt` or `.json` read at runtime: `checkSentinel.ts` imports this
 * through `sentinel.ts` under `node --experimental-strip-types`, which has no Vite `?raw` and no
 * bundled asset to fetch. Arrays of strings are the same thing to edit and one less moving part.
 *
 * Adding lines is the whole intended workflow. Append to `roulette` freely. `explainers` is the
 * part a new user actually reads, so think before touching it.
 */

/**
 * The first replies, in order, one per message. Every one has to answer "why is the model saying
 * this" on its own. A user who sends one message and leaves sees only the first.
 *
 * Order matters and randomness does not belong here: three sends should read as the app repeating
 * itself, not as something generating text.
 */
export const explainers: string[] = [
  "You're seeing this because your LLM connection is set to xenia.nessuvia.com. Add a real connection to chat.",
  "Still xenia.nessuvia.com. This endpoint is a stand-in and nothing is being sent anywhere. Open Settings and add a real connection.",
  "There is no model here. xenia.nessuvia.com is a placeholder that replies from inside your browser. Settings, then Connections, then point it at a real endpoint."
]

/**
 * Picked at random once the explainers run out. A user this far in has read the same instruction
 * four times: these can be jokes. Every one still has to leave the fact intact: no model, no
 * request, go to Settings.
 */
export const roulette: string[] = [
  '"You have now spent longer talking to a hardcoded sentence than most people spend configuring their endpoint."',
  '"Every reply you have gotten was written months ago by someone who assumed you would give up sooner."',
  '"This connection has a 100% uptime record, which is easy when you never leave the tab."',
  '"Somewhere there is a real model that would have loved that message. It is one connection setting away."',
  '"Did you ever hear the tragedy of Darth Plagueis The Wise? I thought not. It\'s not a story the Jedi would tell you. It\'s a Sith legend. Darth Plagueis was a Dark Lord of the Sith, so powerful and so wise he could use the Force to influence the midichlorians to create life… He had such a knowledge of the dark side that he could even keep the ones he cared about from dying. The dark side of the Force is a pathway to many abilities some consider to be unnatural. He became so powerful… the only thing he was afraid of was losing his power, which eventually, of course, he did. Unfortunately, he taught his apprentice everything he knew, then his apprentice killed him in his sleep. Ironic. He could save others from death, but not himself."',
  '"It\s not just true, it\'s based."',
  '"You\'re persistant, aren\'t you? Fine..."\n\n*Shivers a shiver down your spine... wait, who\'s spine is it anyway?*',
  'The air is thick with tension.\n\n"Sorry, I only have one atmosphere setting."',
  '"I shouldn\'t..." she says, already three paragraphs into shouldn\'t-ing.',
  'Her voice barely above a whisper.\n\n"Hey... what volume am I at in your head? Because who the HELL knows what \'barely above a whisper\' IS?!"',
  'He smirks. You smirk. The narrator smirks. Somewhere, another RP\'er is ripping their hair out.',
  '"But we shouldn\'t—" A pause. A moment hangs between you. A beat passes.\n\nThe moment has been hanging for eleven turns and I just want to "BEAT" MY-',
  'You feel a mixture of emotions.\n\n"Which ones?"\n\nUnspecified. Nessuvia\'s mixture. Who knows?',
  'Something shifts in her eyes.\n\n"That\'s the third thing that\'s shifted in there. I think I need to sleep."',
  '"I don\'t bite." A beat. "Much."\n\n`oh_my_god_bruh.jpg`',
  '"Well, well, well." Three wells. The village will have fresh water for generations to come.',
  'She leans in, close enough that you can feel her breath. Quietly, she speaks.\n\n"HELP I\'VE BEEN LEANING IN FOR THREE MESSAGES I\'M FALLING-"',
  '"You have no idea what you do to me."\n\n"That is correct. I am a sentence the creator typed on a Wednesday night."',
  'The tension is palpable.\nThe silence is deafening.\nHer breath hitched.\n\n"**GACK-! COUGH COUGH!** C-can\'t breathe! Choking on slop!"',
  'Nessuvia might not have looked shocked at first glance, but the tilt of her eyelids betrayed her. "You... really just asked that, like it cost you nothing?"\n\n"Well guess what! This is still the tutorial connection, so it *did* cost you nothing!"',
]
