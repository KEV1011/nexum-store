'use client'

// Selector de orden del catálogo. Vive como Client Component porque
// los Server Components no pueden pasar manejadores de eventos.
const SORT_OPTIONS = [
  { value: 'default',     label: 'Destacados'   },
  { value: 'new',         label: 'Más nuevos'   },
  { value: 'bestselling', label: 'Más vendidos' },
  { value: 'price-asc',   label: 'Precio: menor'  },
  { value: 'price-desc',  label: 'Precio: mayor'  },
]

export function SortSelect({ sort }: { sort?: string }) {
  return (
    <select
      className="bg-obsidian-50 border border-white/10 text-ghost-muted text-sm
                 rounded-nexum px-4 py-2 focus:outline-none focus:border-gold/50
                 focus:text-ghost transition-colors cursor-pointer"
      defaultValue={sort ?? 'default'}
      onChange={e => {
        const url = new URL(window.location.href)
        if (e.target.value === 'default') url.searchParams.delete('sort')
        else url.searchParams.set('sort', e.target.value)
        window.location.href = url.toString()
      }}
    >
      {SORT_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
