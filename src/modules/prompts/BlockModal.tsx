import type { PromptBlock, StackVariable } from '../../core/storage/types'
import type { StackKind } from './stackKinds'

const roles: PromptBlock['role'][] = ['system', 'user', 'assistant']

/** The {{tokens}} each kind of stack understands, as [token, what it stands for]. Chat's come from
 *  `swapTokens`, Story's from `storyTokens`, keep both lists in step with those files. */
const tokenGuide: Record<StackKind, [string, string][]> = {
  chat: [
    ['{{char}}', "The character's name"],
    ['{{user}}', "The persona's name"],
    ['{{charDescription}}', 'The active description variant'],
    ['{{charPersonality}}', "The card's personality field"],
    ['{{charScenario}}', "The card's scenario field"],
    ['{{charExampleDialogue}}', "The card's example dialogue"],
    ['{{personaDescription}}', "The persona's description"],
    ['{{char1}} … {{char4}}', 'Names by roster position, in a multiplayer session'],
    ['{{char1Desc}} … {{char4Desc}}', 'Their descriptions'],
    ['{{personas}}', 'Everyone in the session, one per line'],
    ['{{game}}', 'The game being played, in a game'],
  ],
  story: [
    ['{{storyTitle}}', "The Story's title"],
    ['{{premise}}', 'The opening situation, from the Plot Layout tab'],
    ['{{ending}}', 'The intended ending, from the Plot Layout tab'],
    ['{{castNames}}', 'Enabled cast members by name, comma separated'],
    ['{{chapterNumber}}', 'Which Chapter is being written into, counting from 1'],
    ['{{chapterCount}}', 'How many Chapters the Story has'],
    ['{{chapterTitle}}', "The active Chapter's title"],
    ['{{chapterSummary}}', "The active Chapter's recap"],
    ['{{previousChapterSummary}}', "The Chapter before it, recapped"],
    ['{{nextChapterTitle}}', 'The Chapter after it'],
    ['{{nextChapterBeats}}', 'Its planned beats, one per line'],
    ['{{beat}}', 'The instructions for the Block being written'],
    ['{{beatTargetWords}}', 'Its word target. Blank when unset'],
    ['{{otherBeats}}', 'Every other beat in this Chapter, one per line'],
  ],
}

/** Every edit goes straight into the stack draft, which autosaves. There's no Save button. */
export default function BlockModal({
  block,
  kind,
  nested,
  variables,
  onChange,
  onDelete,
  onClose,
}: {
  block: PromptBlock
  /** Which token list the guide shows. */
  kind: StackKind
  /** Inside another block: it shares the parent's role. There's no role to pick. */
  nested: boolean
  /** The stack's declared variables, listed in the guide. */
  variables: StackVariable[]
  onChange: (block: PromptBlock) => void
  onDelete: () => void
  onClose: () => void
}) {
  // Controlled by the stack draft above, no local copy to keep in sync.
  const draft = block
  const set = (patch: Partial<PromptBlock>) => onChange({ ...draft, ...patch })
  const hasChildren = !!draft.children

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit block</h3>

        <label>
          Name
          <input value={draft.label} onChange={(e) => set({ label: e.target.value })} />
        </label>

        {nested ? (
          <p className="hint">Nested blocks take their parent's role.</p>
        ) : (
          <>
            <label>
              Role
              <select
                value={draft.role}
                disabled={draft.source === 'chatHistory'}
                onChange={(e) => set({ role: e.target.value as PromptBlock['role'] })}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {draft.source === 'chatHistory' && (
              <p className="hint">History messages carry their own roles.</p>
            )}
          </>
        )}

        {draft.source === 'authorNote' && (
          <>
            <label>
              Depth
              <input
                type="number"
                min={0}
                value={draft.depth ?? ''}
                onChange={(e) =>
                  set({ depth: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            <p className="hint">
              Messages from the end of the chat history. 0 is after the last message. Empty puts the
              note where the block sits in the stack. With a depth, dragging the block does not
              change where the note lands. A chat can set its own depth in chat settings.
            </p>
          </>
        )}

        {draft.source === 'text' && (
          <label>
            {hasChildren ? 'Text before children' : 'Content'}
            <textarea
              rows={hasChildren ? 3 : 8}
              value={draft.content}
              onChange={(e) => set({ content: e.target.value })}
            />
          </label>
        )}

        {hasChildren && (
          <>
            <label>
              Text after children
              <textarea
                rows={3}
                value={draft.closeContent ?? ''}
                onChange={(e) => set({ closeContent: e.target.value })}
              />
            </label>
            <p className="hint">
              {draft.children!.length} block{draft.children!.length === 1 ? '' : 's'} inside, joined
              by newlines between these two. Leave both empty to group without adding text.
            </p>
          </>
        )}

        {draft.source !== 'chatHistory' && (
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={!!draft.toggleable}
              onChange={(e) => set({ toggleable: e.target.checked })}
            />
            Make toggleable
          </label>
        )}

        <details className="blockInfo">
          <summary>Variables</summary>
          <dl className="tokenGuide">
            {tokenGuide[kind].map(([token, means]) => (
              <div key={token}>
                <dt>{token}</dt>
                <dd>{means}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">
            {kind === 'story'
              ? 'Usable in this block’s text. A line whose variables are all empty is dropped: a sentence about a field that is not set does not get sent. A variable in the Story prose itself is left alone.'
              : 'Usable in this block’s text. An unknown variable is left as it is.'}
          </p>
          {variables.length > 0 && (
            <dl className="tokenGuide">
              {variables.map((v) => (
                <div key={v.id}>
                  <dt>{v.kind === 'sliderRange' ? `{{${v.id}_start}} {{${v.id}_end}}` : `{{${v.id}}}`}</dt>
                  <dd>{v.label}, from this stack's variables</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="hint">
            {'{% if name %}'}, {'{% elif name > 3 %}'}, {'{% else %}'} and {'{% endif %}'} include text only when
            the condition holds. A name is a variable id, a tracker key, narrator, char1 to char4, or game.
            Comparisons: = != &gt; &lt; &gt;= &lt;=. A tag on its own line can span lines; a tag inside a line
            closes on that line.
          </p>
        </details>

        <details className="blockInfo">
          <summary>Information</summary>
          <textarea
            rows={3}
            value={draft.info ?? ''}
            onChange={(e) => set({ info: e.target.value })}
          />
          <p className="hint">Shown when hovering this block's control in chat settings.</p>
        </details>

        <div className="dialogActions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
