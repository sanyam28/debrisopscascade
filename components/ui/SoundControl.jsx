'use client';

import React, { useEffect, useState } from 'react';
import { getSoundSettings, subscribeSoundSettings, setVolume, setMuted } from '../../utils/sound';

function Row({ channel, label, icon, s }) {
  const c = s[channel];
  const off = c.muted || c.volume === 0;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMuted(channel, !c.muted)}
        aria-label={`${c.muted ? 'Unmute' : 'Mute'} ${label}`}
        title={`${c.muted ? 'Unmute' : 'Mute'} ${label}`}
        className="w-5 text-base leading-none"
      >
        {off ? '🔇' : icon}
      </button>
      <span className="w-12 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={c.muted ? 0 : c.volume}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          setVolume(channel, v);
          if (c.muted && v > 0) setMuted(channel, false);
        }}
        onPointerUp={(e) => e.currentTarget.blur()}
        aria-label={`${label} volume`}
        className="h-1 w-24 cursor-pointer accent-cyan-400"
      />
    </div>
  );
}

// Bottom-right (above the Spam Laser switch): separate volume + mute for background music and sound effects.
export default function SoundControl() {
  const [s, setS] = useState(getSoundSettings());
  useEffect(() => { setS(getSoundSettings()); return subscribeSoundSettings(setS); }, []);

  return (
    <div className="absolute bottom-20 right-6 z-[55] flex flex-col gap-1.5 rounded-xl border border-slate-600/60 bg-slate-950/70 px-3 py-2 backdrop-blur-md">
      <Row channel="music" label="Music" icon="🎵" s={s} />
      <Row channel="sfx" label="Effects" icon="🔊" s={s} />
    </div>
  );
}
