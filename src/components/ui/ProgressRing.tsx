interface ProgressRingProps {
  value: number
  label: string
  detail: string
}

export function ProgressRing({ value, label, detail }: ProgressRingProps) {
  const degrees = Math.min(100, Math.max(0, value)) * 3.6

  return (
    <div className="flex items-center gap-4">
      <div
        className="grid size-20 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--progress-value) ${degrees}deg, var(--progress-track) ${degrees}deg)`
        }}
      >
        <div className="grid size-14 place-items-center rounded-full bg-surface">
          <span className="text-lg font-extrabold">{value}%</span>
        </div>
      </div>
      <div>
        <p className="font-bold">{label}</p>
        <p className="mt-1 text-sm text-secondary">{detail}</p>
      </div>
    </div>
  )
}
