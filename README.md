Xenia (ξενία, zenee-a) - the ancient Greek concept of hospitality; "guest-friendship," rooted in generosity and reciprocity. 
[Encyclopedia Britannica](https://www.britannica.com/topic/xenia-sociology)

Alternate Names: Xenia, X.N, Xen (/zɛn/, zen)

# Xenia Nessuvia

Xenia Nessuvia is a character chat app inspired by SillyTavern. It runs entirely in the browser. Chats, characters, and settings live in IndexedDB. Model requests go from your browser to an OpenAI-compatible endpoint, using the key you provide.

There is no backend and no accounts. Download the source and run it fully locally if you prefer.

On [xenia.nessuvia.com](https://xenia.nessuvia.com/), the site installs as a PWA and runs in fullscreen.

## Why

I made this for myself after a long time using SillyTavern. I have plenty of appreciation for everyone who's contributed to that codebase. I wanted a statically served frontend, reachable from any device with internet access, with saves that stay portable. The Character Gallery accepts only links, not uploaded pictures. Persona and Character avatars still accept uploads.

**Multiplayer**

I haven't seen this built into any other frontend I've used. The host starts a session and shares a link. Guests open it, make a persona, and join the same chat without installing anything or making an account. Everyone sees the same messages stream in. A turn order can be rearranged. A Narrator role fills the DM seat when no character should be the one answering. Only the host holds an API key, and only the host talks to the model. The relay carries messages and presence between browsers, nothing more. Keys stay in the host's tab. Nothing is stored on the way through. To run your own relay instead of mine, see [Where data goes](#where-data-goes).

*[STMP](https://github.com/RossAscends/STMP) exists as an extension. I used it once, on the initial release version.

**Mobile**

Mobile support started small and is planned to grow into a first-class feature. Xenia Nessuvia runs as a PWA: add it to a phone's home screen and use it full screen, in the style of ST-android.

**Palette**

The Palette feature covers font loading, app-wide text colors, and panel styles, inspired by custom CSS in SillyTavern. Custom HTML and CSS backgrounds extend that: scoped CSS and placed HTML elements, on top of SillyTavern's custom CSS loading.

**Chat**

Chat is the most conventional feature here. It supports the full TavernV2 specification, plus extras: Alternate Descriptions, a Gallery, per-character text coloring. Lorebooks stay simple today: keyword-triggered world info entries that inject on a match, with no advanced insertion strategies yet.

Model output can be cleaned before it reaches the screen, two ways. The grammar hammer runs a rules pass over the displayed text and leaves the stored message untouched. Second Pass covers heavier cleanup: write post-processing rules, from stripping a repeated tic to long regex replacements. Both change only what you see, never what is saved.

**Write**

Write is the long-form half of the app, and the most rebuilt. Exports come out as HTML, plain text, or JSON.

The Plot Layout is the part I care about most. A Chapter is a row of beats, each with a word target: a plan for the model, not the word "continue." A Premise precedes the first Chapter and an Ending follows the last, marking where the story started and where it lands. Every Chapter also carries a summary and a switch for what it hands to the model (summary and beats, beats only, summary only, or nothing), the mechanism that lets old Chapters shrink to a recap while the current one stays whole. A Direction box holds the standing note that is neither a beat nor a prompt, the "stop having them sigh" kind of thing.

**Prompts**

Prompt handling is another feature inspired by SillyTavern: reusable prompt "blocks," easily rearranged, with XML-style tagging. The scroll-type block adjusts a target word count on the fly.

A live prompt preview tests a prompt stack, and Chat includes a raw request inspector showing the exact array and payload sent to your endpoint before it goes out.

**Ask**

Ask is small and single-use: a single icon at the bottom of the navbar. It sends a message to your LLM backend, nothing else. Loading a character to "be" the Assistant works the same way Stella did in the c.ai days: your character takes her seat.

## Models and samplers

Xenia connects to any OpenAI-compatible endpoint, local or hosted, for chat or text completion. Sampler parameters are data rows rather than hardcoded fields. A backend-specific sampler (Mirostat, Min-P, DRY, quadratic sampling, dynamic temperature) is a small JSON definition, no code release. It appears in the UI once the row exists.

Role-tag formatting for local backends (Llama-3 headers, `[INST]`, `<|im_start|>`, Command-R tags, and so on) is on the near-term roadmap.

## Where data goes

Everything stays in your browser, with one exception. Multiplayer messages pass through a Centrifugo relay the host runs. They are not stored there, and they are carried in plaintext. API keys are never sent to the relay.

A host can point a session at a Centrifugo relay on their own machine instead, set up in Settings under Multiplayer. [Click here for more information.](src/resources/self-hosted-relay.md)

## Stack

Vite, React, TypeScript, Zustand, Dexie (IndexedDB), React Router.

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

## AI assistance

Agentic LLM coding assistants wrote most of this codebase. The feature set, the interaction design, and what this app is are mine.

More on this in the [foreword](FOREWORD.md).

## License

GNU GPL v3. See [LICENSE](LICENSE).

```
Copyright (C) 2026 nessuvia

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.
```

Real documentation coming soon™.
