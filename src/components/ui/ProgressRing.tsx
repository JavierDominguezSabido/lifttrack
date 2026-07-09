interface ProgressRingProps {
  value: number
  label: string
  detail: string
}

export function ProgressRing({ value, label, detail }: ProgressRingProps) {
  const degrees = Math.min(100, Math.max(0, value)) * 3.6

  return (
    <div className="flex items-center gap-3">
      <div
        className="grid size-16 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--progress-value) ${degrees}deg, var(--progress-track) ${degrees}deg)`
        }}
      >
        <div className="grid size-11 place-items-center rounded-full bg-surface">
          <span className="text-sm font-extrabold">{value}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-extrabold">{label}</p>
        <p className="mt-0.5 text-xs font-medium text-secondary">{detail}</p>
      </div>
    </div>
  )
}
