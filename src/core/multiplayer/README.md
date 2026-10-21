# Multiplayer

A host shares a link; guests open it, make a persona and join the host's chat. Only the host holds
an API key and talks to the model. The relay is a Centrifugo instance the user runs (setup in
`relay/self-hosted-relay.md`). It carries broadcast and presence and stores nothing.

- `channel.ts` is the interface and `centrifugoChannel.ts` the implementation. Nothing above it
  touches the relay client.
- `protocol.ts` holds the event shapes, `protocolVersion` (guests reject a mismatch) and the
  240 KB event cap.
- `hostSession.ts`, `turnOrder.ts`, `rosterAvatar.ts` sit on top.
- Guests enter through `/join/:sessionId`, which `App.tsx` mounts outside the app shell. A guest
  never loads the sidebar. `modules/join` isn't a registered module.

## Narrator

`narrator.ts` lives here by origin but isn't multiplayer-only. `narratorId` is -1,
`narratorCharacter()` is a synthetic card, and `isNarrator` is how you test for it.

In an ordinary chat it answers two ways: pinned in `ResponderPicker` (`Chat.respondWith = -1`) for
a stretch, or `/narrate <text>` for one turn. `chatStore.retry` branches on it before the
round-robin maths and never moves `lastSpeakerIndex`, so narrating costs nobody their turn.

Its instructions: a stack with an `{% if narrator %}` branch owns the Narrator outright. Any other
stack gets its `narrator` misc prompt, passed to `narratorCharacter()` as the card's
`systemPrompt`. `mentionsCondition` in `core/prompt/template.ts` decides which.

The Narrator has no lorebooks of its own, so it borrows every participant's
(`core/chat/narratorBooks.ts`): it narrates the world the characters can see.
