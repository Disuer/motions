import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MOTION_NAMES, isSkill } from './motions'
import { cn } from '@/lib/utils'

/**
 * The game's enum in declaration order, split into the groups an author actually thinks in. A flat
 * list of ~70 names is what the native <datalist> gave, and it is why finding "Damaged_2" meant
 * scrolling an unlabelled strip. Order within each group stays as declared - it is the enum's own
 * order, and S10 following S9 matters more than alphabetising would.
 *
 * No coin entries here. A coin is a variant of a motion rather than a motion of its own, so it is
 * added from the coin row under the skill's own tab, where the skill it belongs to is not a
 * guess.
 */
const GROUPS: { label: string; names: string[] }[] = [
  { label: 'Skills', names: MOTION_NAMES.filter(isSkill) },
  {
    label: 'States',
    names: MOTION_NAMES.filter((n) => !isSkill(n) && !n.startsWith('Duel_') && !n.startsWith('Parrying')),
  },
  { label: 'Parrying', names: MOTION_NAMES.filter((n) => n.startsWith('Parrying')) },
  { label: 'Duel', names: MOTION_NAMES.filter((n) => n.startsWith('Duel_')) },
]

/** Motions the character already has. Offering to create one of these again is a dead click. */
function describe(name: string, existing: string[]): string | null {
  return existing.includes(name) ? 'already exists' : null
}

interface Props {
  /** Folder names already on disk, so the list can mark them rather than pretend they are new. */
  existing: string[]
  onCreate: (name: string) => void
}

/**
 * Free text is deliberately still accepted: MOTION_NAMES is a snapshot of a game enum, and the
 * plugin logs an unknown name rather than rejecting it. A picker that only offered the snapshot
 * would be wrong the first time the game adds a motion.
 */
export default function MotionPicker({ existing, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const known = GROUPS.some((g) => g.names.some((n) => n.toLowerCase() === query.toLowerCase()))
  const typedIsNew = query.trim() !== '' && !known && !existing.includes(query.trim())

  function create(name: string) {
    if (existing.includes(name)) return
    onCreate(name)
    setQuery('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Styled as the action it is, not as a combobox. Muted placeholder text in a wide
          justify-between shell reads as "nothing selected yet" rather than "click to add a
          motion", and it was being looked straight past. */}
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="ml-auto">
            <Plus className="size-3.5" />
            Add motion
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="end">
        <Command
          // The enum is a fixed 70 names, so filtering in the list is cheaper than it looks, and
          // it keeps the typed value available for the "create" row below.
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search motions" value={query} onValueChange={setQuery} />
          <CommandList>
            {/* Barely reachable - a name that matches nothing becomes the "create" row below, so
                this is left for the whitespace-only search that matches neither. */}
            <CommandEmpty>No motion by that name.</CommandEmpty>

            {typedIsNew && (
              <>
                <CommandGroup heading="Not in the list">
                  <CommandItem value={query} onSelect={() => create(query.trim())}>
                    <Plus className="size-3.5" />
                    Create <span className="font-medium">{query.trim()}</span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.names.map((name) => {
                  const note = describe(name, existing)
                  const taken = existing.includes(name)
                  return (
                    <CommandItem
                      key={name}
                      value={name}
                      disabled={taken}
                      onSelect={() => create(name)}
                      className={cn(taken && 'opacity-50')}
                    >
                      {taken ? <Check className="size-3.5" /> : <Plus className="size-3.5 opacity-40" />}
                      {name}
                      {note && <span className="ml-auto text-xs text-muted-foreground">{note}</span>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
