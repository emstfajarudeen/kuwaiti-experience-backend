import { useMemo, useState } from 'react'
import { Button, Checkbox, Input } from 'antd'

type Permission = { key: string; module: string; action: string; label: string }
type Props = {
  permissions: Permission[]
  value?: string[]
  onChange?: (value: string[]) => void
}

const title = (module: string) => module.replaceAll('_', ' ')

export default function PermissionPicker({ permissions, value = [], onChange }: Props) {
  const [query, setQuery] = useState('')
  const selected = useMemo(() => new Set(value), [value])
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const permission of permissions) {
      map.set(permission.module, [...(map.get(permission.module) ?? []), permission])
    }
    return [...map.entries()]
  }, [permissions])
  const needle = query.trim().toLowerCase()
  const visible = groups
    .map(([module, items]) => {
      const matchesModule = title(module).toLowerCase().includes(needle)
      return [
        module,
        matchesModule ? items : items.filter((i) => i.label.toLowerCase().includes(needle)),
      ] as const
    })
    .filter(([, items]) => items.length > 0)

  const emit = (next: Set<string>) =>
    onChange?.(permissions.map((p) => p.key).filter((k) => next.has(k)))
  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(selected)
    for (const key of keys) on ? next.add(key) : next.delete(key)
    emit(next)
  }

  return (
    <div className="cms-permission-picker">
      <div className="cms-permission-toolbar">
        <Input.Search
          allowClear
          placeholder="Search permissions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="cms-permission-search"
        />
        <span className="cms-permission-count">
          {selected.size} of {permissions.length} selected
        </span>
        <Button
          size="small"
          onClick={() =>
            toggle(
              permissions.map((p) => p.key),
              true
            )
          }
        >
          Select all
        </Button>
        <Button
          size="small"
          onClick={() =>
            toggle(
              permissions.map((p) => p.key),
              false
            )
          }
        >
          Clear
        </Button>
      </div>
      {visible.length === 0 ? (
        <p className="cms-permission-empty">No permissions match your search.</p>
      ) : (
        <div className="cms-permission-grid">
          {visible.map(([module, items]) => {
            const allKeys = groups.find(([m]) => m === module)?.[1].map((p) => p.key) ?? []
            const count = allKeys.filter((k) => selected.has(k)).length
            return (
              <section className="cms-permission-group" key={module}>
                <header className="cms-permission-group-head">
                  <Checkbox
                    checked={count === allKeys.length}
                    indeterminate={count > 0 && count < allKeys.length}
                    onChange={(event) => toggle(allKeys, event.target.checked)}
                  >
                    <span className="cms-permission-group-title">{title(module)}</span>
                  </Checkbox>
                  <span className="cms-permission-group-count">
                    {count}/{allKeys.length}
                  </span>
                </header>
                <div className="cms-permission-items">
                  {items.map((permission) => (
                    <Checkbox
                      key={permission.key}
                      checked={selected.has(permission.key)}
                      onChange={(event) => toggle([permission.key], event.target.checked)}
                    >
                      {permission.label}
                    </Checkbox>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
