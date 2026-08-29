import { useState } from 'react';
import type { Config, PackSummary } from '../../shared/types.js';

interface Props {
  config: Config;
  packs: PackSummary[];
  setPacks: (packs: PackSummary[]) => void;
  patch: (partial: Partial<Config>) => Promise<void>;
}

/** The shape `settings:packs:write` reports failures in. */
interface Issue {
  line?: number;
  message: string;
}

function issueText(issue: Issue): string {
  return issue.line === undefined ? issue.message : `Line ${issue.line}: ${issue.message}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function PacksPane({ config, packs, setPacks, patch }: Props): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  // What the file held when the editor opened, so "unsaved" is a fact rather
  // than a guess about whether the user touched anything.
  const [saved, setSaved] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const editing = packs.find((p) => p.id === editingId) ?? null;
  const dirty = editingId !== null && text !== saved;
  const anyBroken = packs.some((p) => p.error !== undefined);

  function reset(): void {
    setEditingId(null);
    setText('');
    setSaved('');
    setIssues([]);
  }

  /**
   * Ask before throwing away typed lines. The editor is the one place in
   * settings where work is held rather than applied, so it is the one place a
   * click can silently discard something the user wrote.
   */
  function mayDiscard(): boolean {
    return !dirty || window.confirm('Discard your unsaved changes to this pack?');
  }

  async function edit(id: string): Promise<void> {
    if (!mayDiscard()) return;
    try {
      const body = await window.waterSettings.readPack(id);
      setEditingId(id);
      setText(body);
      setSaved(body);
      setIssues([]);
      setError(null);
    } catch (err: unknown) {
      setError(`Could not open that pack: ${describe(err)}`);
    }
  }

  async function save(): Promise<void> {
    if (editingId === null) return;
    try {
      const result = await window.waterSettings.writePack(editingId, text);
      if (!result.ok) {
        // The textarea is left exactly as typed: the errors name line numbers,
        // and a reformatted body would move the lines they point at.
        setIssues(result.errors);
        return;
      }
      setPacks(result.packs);
      reset();
      setError(null);
    } catch (err: unknown) {
      setError(`Could not save that pack: ${describe(err)}`);
    }
  }

  async function revert(id: string): Promise<void> {
    if (
      !window.confirm('Replace your copy with the pack the app ships? Your edits to it are deleted.')
    ) {
      return;
    }
    try {
      setPacks(await window.waterSettings.revertPack(id));
      // The file the editor was showing has just been deleted. Leaving it open
      // would let Save write the reverted-away text straight back.
      if (editingId === id) reset();
      setError(null);
    } catch (err: unknown) {
      setError(`Could not revert that pack: ${describe(err)}`);
    }
  }

  function toggleActive(id: string): void {
    const next = config.activePackIds.includes(id)
      ? config.activePackIds.filter((packId) => packId !== id)
      : [...config.activePackIds, id];
    // normalizeConfig replaces an empty activePackIds with the default pack, so
    // an unchecked last box comes back checked with nothing said about why.
    // Refuse it here, where the note below can explain the refusal.
    if (next.length === 0) return;
    void patch({ activePackIds: next });
  }

  return (
    <div className="pane">
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ul className="packs">
        {packs.map((pack) => (
          <li key={pack.id} className="pack">
            <label className="pack-active">
              <input
                type="checkbox"
                checked={config.activePackIds.includes(pack.id)}
                onChange={() => toggleActive(pack.id)}
              />
              <span className="pack-name">{pack.name}</span>
            </label>

            {pack.error === undefined ? (
              <span className="note">{`${pack.lineCount} lines`}</span>
            ) : (
              // Verbatim, including the id: the message is a parser error about
              // a file, and the user has to find the file to fix it.
              <span className="pack-broken">{`${pack.id}.json — ${pack.error}`}</span>
            )}

            {pack.customised && <span className="badge">Customised</span>}

            <span className="pack-actions">
              <button
                type="button"
                onClick={() => void edit(pack.id)}
                disabled={pack.error !== undefined}
              >
                Edit
              </button>
              {pack.customised && (
                <button type="button" className="danger" onClick={() => void revert(pack.id)}>
                  Revert to shipped
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {config.activePackIds.length === 1 && (
        // The same rule, and the same reason, as the schedule's last day.
        <p className="note">At least one pack has to stay on, so the last one cannot be cleared.</p>
      )}

      {anyBroken && (
        // Edit is disabled on a pack that would not parse, because the editor
        // would open empty and Save would then look like the way to fix it.
        <p className="note">
          A pack that failed to load cannot be edited here. Fix or delete its file in the packs
          folder, then reopen settings.
        </p>
      )}

      {editing !== null && (
        <div className="editor">
          <p className="note">
            One line per row. <code>[0]</code> or <code>[0,1]</code> tags which escalation stages a
            line suits. Untagged lines can appear at any stage.
          </p>
          <textarea
            aria-label={`Lines in ${editing.name}`}
            spellCheck={false}
            rows={16}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
          />

          {issues.length > 0 && (
            <ul className="issues" role="alert">
              {issues.map((issue, index) => (
                <li key={`${issue.line ?? 0}-${index}`}>{issueText(issue)}</li>
              ))}
            </ul>
          )}

          <div className="row">
            <button type="button" className="primary" onClick={() => void save()}>
              Save
            </button>
            <button type="button" onClick={() => mayDiscard() && reset()}>
              Cancel
            </button>
            {/* Every other control in settings applies as you type; this one
                does not, so it has to say so rather than look broken. */}
            <span className="note">
              {dirty ? 'Unsaved — pack edits only apply when you save.' : 'Saved.'}
            </span>
          </div>
        </div>
      )}

      <div className="row">
        <button type="button" onClick={() => window.waterSettings.revealPacks()}>
          Reveal packs folder
        </button>
        <span className="note">
          Editing a pack copies it to your own packs folder. The app&rsquo;s own copies are never
          changed.
        </span>
      </div>
    </div>
  );
}
