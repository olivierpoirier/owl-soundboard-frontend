const typeLabels = {
  system: "SYS",
  play: "PLAY",
  loop: "LOOP",
  stop: "STOP",
  warn: "WARN",
  storage: "R2",
  error: "ERR",
};

const typeClasses = {
  system: "text-cyan-300",
  play: "text-purple-300",
  loop: "text-emerald-300",
  stop: "text-red-300",
  warn: "text-amber-300",
  storage: "text-sky-300",
  error: "text-red-300",
};

export default function TerminalLog({ entries }) {
  return (
    <div className="w-full max-w-[380px] rounded-xl border border-emerald-400/20 bg-black/45 shadow-[inset_0_0_24px_rgba(16,185,129,0.04)] overflow-hidden">
      <div className="h-8 px-3 flex items-center justify-between border-b border-emerald-400/10 bg-emerald-400/[0.04]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400/80" />
          <span className="w-2 h-2 rounded-full bg-amber-300/80" />
          <span className="w-2 h-2 rounded-full bg-emerald-300/80" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-200/70">
          audio.log
        </span>
      </div>

      <div className="max-h-36 overflow-y-auto px-3 py-2 space-y-1 font-mono text-[10px] leading-relaxed">
        {entries?.map((entry) => (
          <div key={entry.id} className="grid grid-cols-[72px_42px_minmax(0,1fr)] gap-2 text-white/58">
            <span className="whitespace-nowrap text-white/25">{entry.time}</span>
            <span className={typeClasses[entry.type] || "text-white/45"}>
              {typeLabels[entry.type] || "LOG"}
            </span>
            <span className="min-w-0 text-white/68 break-words">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
