import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Mode, folderNameRejection, modFolderRejection, nameRejection } from './fs'

interface Props {
  /** The folder being created in. Shown, because it is about to be written to. */
  modName: string
  /**
   * The picked folder is the mods folder, not a mod, so a mod folder has to be made first. The
   * plugin loads each child of mods/ separately; a character put straight in would never load.
   */
  insideModsRoot: boolean
  onCancel: () => void
  onCreate: (name: string, mode: Mode, modFolder: string | null) => void
}

/**
 * The one place the editor creates rather than opens. Both rejections are checked as the name is
 * typed rather than on submit: the Lethe truncation in particular renames the character silently
 * in game, and finding that out after the folder exists means deleting it and starting again.
 */
export default function NewCharacter({ modName, insideModsRoot, onCancel, onCreate }: Props) {
  const [name, setName] = useState('')
  const [mod, setMod] = useState('')
  const [mode, setMode] = useState<Mode>('appearance')

  const modRejection = insideModsRoot ? modFolderRejection(mod) : null
  const nameFault = folderNameRejection(name) ?? nameRejection(name, mode)
  // The first fault in the order the fields are read, so the message sits under the field it is
  // about rather than jumping to whichever check happened to run first.
  const rejection = modRejection ?? nameFault
  const rootName = mode === 'appearance' ? 'motion_appearances' : 'custom_motions'
  const modPath = insideModsRoot ? `${modName}/${mod || '…'}` : modName

  function submit() {
    if (!rejection) onCreate(name, mode, insideModsRoot ? mod : null)
  }

  return (
    <div className="mt-6 rounded-lg border p-4">
      <p className="text-sm font-medium">
        {insideModsRoot ? `New mod in ${modName}` : `New character in ${modName}`}
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {insideModsRoot && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="modname" className="text-xs">Mod folder</Label>
            <Input
              id="modname"
              autoFocus
              value={mod}
              placeholder="MyMod"
              onChange={(e) => setMod(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            />
            <p className="text-xs text-muted-foreground">
              Made inside <code>{modName}</code>. This is the folder the plugin loads as one mod.
            </p>
            {mod !== '' && modRejection && (
              <p className="text-xs text-destructive">{modRejection}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kind" className="text-xs">Kind</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger id="kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="appearance">A character of my own</SelectItem>
              <SelectItem value="override">An override of an existing character</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {mode === 'appearance'
              ? 'Registers as a new appearance, cloning a vanilla rig you pick afterwards.'
              : 'Replaces the motions of an appearance that already exists. The name is its appearance ID.'}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="charname" className="text-xs">
            {mode === 'appearance' ? 'Name' : 'Appearance ID'}
          </Label>
          <Input
            id="charname"
            autoFocus={!insideModsRoot}
            value={name}
            placeholder={mode === 'appearance' ? 'MyGuy' : '10101_YiSang'}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />
          <p className="font-mono text-xs text-muted-foreground">
            {modPath}/{rootName}/{name || '…'}/motions/
          </p>
          {name !== '' && nameFault && <p className="text-xs text-destructive">{nameFault}</p>}
        </div>

        <div className="flex gap-2">
          <Button size="sm" disabled={rejection !== null} onClick={submit}>
            {insideModsRoot ? 'Create mod and character' : 'Create character'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
