import { useRef, useState } from 'react'
import type { InstructTemplate, NamesBehavior } from '../../core/params/paramDef'
import { defaultTemplate, templatePresets } from '../../core/params/paramDef'
import { templateFromJson, templateToJson } from '../../core/params/templateFile'
import FormatPreview from './FormatPreview'

const sequences: { key: keyof InstructTemplate; label: string; hint?: string }[] = [
  { key: 'systemPrefix', label: 'System prefix' },
  { key: 'systemSuffix', label: 'System suffix' },
  { key: 'userPrefix', label: 'User prefix' },
  { key: 'userSuffix', label: 'User suffix' },
  { key: 'modelPrefix', label: 'Model prefix' },
  { key: 'modelSuffix', label: 'Model suffix' },
]

const overrides: { key: keyof InstructTemplate; label: string; hint: string }[] = [
  { key: 'firstPrefix', label: 'Start of prompt', hint: 'Written once at the very front. The BOS token.' },
  { key: 'firstModelPrefix', label: 'First model prefix', hint: 'Replaces the model prefix on the first reply in the history.' },
  { key: 'lastModelPrefix', label: 'Last model prefix', hint: 'Replaces it on the reply being written now.' },
]

const nameOptions: [NamesBehavior, string][] = [
  ['never', 'Never'],
  ['group', 'Group chats only'],
  ['always', 'Always'],
]

/** The sequences that wrap each message for a text-completion endpoint, and what they produce. */
export default function TemplateEditor({
  template,
  name,
  onChange,
}: {
  template: InstructTemplate
  /** The connection's name, so an exported file says which model it is for. */
  name: string
  onChange: (template: InstructTemplate) => void
}) {
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof InstructTemplate>(key: K, value: InstructTemplate[K]) =>
    onChange({ ...template, [key]: value })

  function download() {
    const blob = new Blob([templateToJson(name, template)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${name.replace(/[^\w-]+/g, '-') || 'template'}.template.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function upload(file: File) {
    setError('')
    try {
      onChange(templateFromJson(await file.text()).template)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  return (
    <div className="templateEditor">
      <div className="templateColumn">
        <div className="templatePresetRow">
          <label className="templatePresetPicker">
            Format
            <select
              value=""
              onChange={(e) => {
                const preset = templatePresets.find((p) => p.name === e.target.value)
                // The preset replaces the sequences and keeps nothing: a half-applied format is a
                // prompt that looks right and parses wrong.
                if (preset) onChange({ ...preset.template(), reasoning: template.reasoning })
              }}
            >
              <option value="">Load a format…</option>
              {templatePresets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" onClick={download}>
            Export
          </button>
          <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="templateFileInput"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
        </div>
        {error && <p className="templateError">{error}</p>}

        <div className="templateGrid">
          {sequences.map(({ key, label }) => (
            <label key={key} className="templateField">
              {label}
              <input
                value={(template[key] as string) ?? ''}
                onChange={(e) => set(key, e.target.value as InstructTemplate[typeof key])}
              />
            </label>
          ))}
        </div>

        <div className="templateGrid">
          {overrides.map(({ key, label, hint }) => (
            <label key={key} className="templateField">
              {label}
              <input
                value={(template[key] as string) ?? ''}
                onChange={(e) => set(key, e.target.value as InstructTemplate[typeof key])}
              />
              <span className="templateHint">{hint}</span>
            </label>
          ))}
          <label className="templateField">
            Start reply with
            <input
              value={template.prefill ?? ''}
              onChange={(e) => set('prefill', e.target.value)}
            />
            <span className="templateHint">
              Written at the end of the prompt. The reply continues it.
            </span>
          </label>
          <label className="templateField">
            Speaker names
            <select
              value={template.names ?? 'never'}
              onChange={(e) => set('names', e.target.value as NamesBehavior)}
            >
              {nameOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="templateHint">Puts `Name: ` in front of each turn.</span>
          </label>
        </div>

        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={template.wrapNewlines ?? false}
            onChange={(e) => set('wrapNewlines', e.target.checked)}
          />
          Put each sequence on its own line
        </label>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={template.systemAsUser ?? false}
            onChange={(e) => set('systemAsUser', e.target.checked)}
          />
          Wrap system turns in the user sequences
        </label>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={template.expandMacros !== false}
            onChange={(e) => set('expandMacros', e.target.checked)}
          />
          Expand {'{{char}}'} and {'{{user}}'} inside the sequences
        </label>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={template.trimTrailingSpace}
            onChange={(e) => set('trimTrailingSpace', e.target.checked)}
          />
          Trim trailing whitespace from the prompt
        </label>

        <div className="editorActions">
          <button type="button" className="secondary" onClick={() => onChange(defaultTemplate())}>
            Reset to ChatML
          </button>
        </div>
      </div>

      <FormatPreview template={template} />
    </div>
  )
}
