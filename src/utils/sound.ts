let audioCtx: AudioContext | null = null;
type SoundEffectKey = 'stone' | 'capture' | 'pass' | 'new-game';

const MIN_SOUND_INTERVAL_MS = 50;
const lastSoundTimeByKey = new Map<SoundEffectKey, number>();

export interface SoundInitError {
    message: string;
    backend: 'web-audio';
    platform: string;
}

let onSoundInitError: ((error: SoundInitError) => void) | null = null;
let soundFailureReported = false;

export const setSoundInitErrorHandler = (handler: ((error: SoundInitError) => void) | null): void => {
    onSoundInitError = handler;
};

export const resetSoundFailureReport = (): void => {
    soundFailureReported = false;
    lastSoundTimeByKey.clear();
};

const formatSoundError = (error: unknown): string => (
    error instanceof Error && error.message ? error.message : 'Unknown audio error'
);

const getPlatformLabel = (): string => {
    try {
        return typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    } catch {
        return 'unknown';
    }
};

const reportSoundError = (message: string): void => {
    if (soundFailureReported) return;
    if (!onSoundInitError) return;
    soundFailureReported = true;
    onSoundInitError({
        message,
        backend: 'web-audio',
        platform: getPlatformLabel(),
    });
};

const getSoundNow = (): number => {
    try {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
    } catch {
        return Date.now();
    }
};

const shouldSkipRepeatedSound = (key: SoundEffectKey): boolean => {
    const now = getSoundNow();
    const last = lastSoundTimeByKey.get(key);
    if (last !== undefined && now - last < MIN_SOUND_INTERVAL_MS) return true;
    lastSoundTimeByKey.set(key, now);
    return false;
};

const getAudioContextConstructor = (): typeof AudioContext | null => {
    if (typeof window === 'undefined') return null; // Handle SSR/Test environment
    try {
        const audioWindow = window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
        };
        return audioWindow.AudioContext || audioWindow.webkitAudioContext || null;
    } catch (error) {
        reportSoundError(`Browser audio API is blocked: ${formatSoundError(error)}`);
        return null;
    }
};

const getAudioContext = () => {
    if (audioCtx) return audioCtx;

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
        if (typeof window !== 'undefined') {
            reportSoundError('Browser audio API is not available.');
        }
        return null;
    }

    try {
        audioCtx = new AudioContextCtor();
        return audioCtx;
    } catch (error) {
        audioCtx = null;
        reportSoundError(`Could not initialize browser audio: ${formatSoundError(error)}`);
        return null;
    }
};

/**
 * Builds the AudioContext ahead of the first sound, so a move does not pay for it.
 *
 * `new AudioContext()` spins up the audio device, and it is not cheap: profiled
 * on the production preview, the first stone placed on a fresh board cost
 * **85-100ms of synchronous work**, reported as a 91ms long task, and
 * `getAudioContext` was 89.1ms of it. Every move after it took 0.3ms. Sound is
 * on by default and gameStore plays the stone sound inside playMove, so this
 * was the ordinary experience of placing a first stone.
 *
 * Called from an idle callback, where there is no interaction to block. It
 * stays a no-op when the context already exists, and it is not called at all
 * when sound is switched off -- nobody should have an audio device started for
 * a feature they turned off.
 *
 * Creating the context this early is allowed: without a user gesture it simply
 * begins life suspended, and resumeContext() below already resumes it on the
 * first sound, which by definition follows one.
 */
export const warmAudioContext = (): void => {
    getAudioContext();
};

const playWithSoundErrorHandling = (play: (ctx: AudioContext) => void, ctx: AudioContext): void => {
    try {
        play(ctx);
    } catch (error) {
        reportSoundError(`Could not play browser audio: ${formatSoundError(error)}`);
        // Audio is optional; never let a browser audio failure interrupt play.
    }
};

// Ensure context is running (needed for some browsers that suspend it)
const resumeContext = (): { ctx: AudioContext; resumePromise?: Promise<void> } | null => {
    const ctx = getAudioContext();
    let state: AudioContextState | null = null;
    try {
        state = ctx?.state ?? null;
    } catch (error) {
        reportSoundError(`Could not read browser audio state: ${formatSoundError(error)}`);
        return null;
    }
    if (ctx && state === 'suspended') {
        try {
            const resumePromise = ctx.resume();
            void resumePromise.catch((error: unknown) => {
                reportSoundError(`Could not resume browser audio: ${formatSoundError(error)}`);
            });
            return { ctx, resumePromise };
        } catch (error) {
            reportSoundError(`Could not resume browser audio: ${formatSoundError(error)}`);
            return null;
        }
    }
    return ctx ? { ctx } : null;
};

const runSound = (key: SoundEffectKey, play: (ctx: AudioContext) => void) => {
    if (shouldSkipRepeatedSound(key)) return;
    const audio = resumeContext();
    if (!audio) return;
    if (audio.resumePromise) {
        void audio.resumePromise
            .then(() => playWithSoundErrorHandling(play, audio.ctx))
            .catch(() => undefined);
        return;
    }
    playWithSoundErrorHandling(play, audio.ctx);
};

/*
 * Go sounds, synthesised so they work offline: a slate stone landing on a kaya
 * board is a very short, bright click (noise through a band-pass filter) over a
 * brief woody knock (a low sine that drops in pitch). Small random variations
 * keep a run of moves from sounding mechanical.
 */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

const getNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
    const cached = noiseBuffers.get(ctx);
    if (cached) return cached;
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
    return buffer;
};

/** A short filtered noise burst: the hard "パチ" of stone on wood. */
const playClick = (ctx: AudioContext, at: number, opts: { freq: number; q: number; gain: number; decay: number }) => {
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(opts.freq, at);
    filter.Q.setValueAtTime(opts.q, at);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.0008, at + opts.decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(at, Math.random() * 0.2);
    source.stop(at + opts.decay + 0.01);
};

/** A low knock that falls in pitch: the board answering the stone. */
const playKnock = (ctx: AudioContext, at: number, opts: { from: number; to: number; gain: number; decay: number }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(opts.from, at);
    osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.decay);
    gain.gain.setValueAtTime(opts.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.0008, at + opts.decay);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + opts.decay + 0.01);
};

const vary = (value: number, spread: number) => value * (1 + (Math.random() * 2 - 1) * spread);

export const playStoneSound = () => {
    runSound('stone', (ctx) => {
        const now = ctx.currentTime;
        playKnock(ctx, now, { from: vary(320, 0.08), to: 140, gain: 0.55, decay: 0.075 });
        playClick(ctx, now, { freq: vary(3200, 0.12), q: 1.4, gain: 0.9, decay: 0.035 });
        playClick(ctx, now + 0.002, { freq: vary(1300, 0.1), q: 2.5, gain: 0.35, decay: 0.06 });
    });
};

export const playCaptureSound = (count: number) => {
    runSound('capture', (ctx) => {
        // Prisoners lifted off the board and dropped together: light stone-on-stone clicks.
        const clicks = Math.min(Math.max(count, 1), 5) + 1;
        const now = ctx.currentTime + 0.12;
        for (let i = 0; i < clicks; i++) {
            const at = now + i * 0.045 + Math.random() * 0.03;
            playClick(ctx, at, { freq: vary(4200, 0.15), q: 3, gain: 0.35, decay: 0.025 });
        }
    });
};

export const playPassSound = () => {
    runSound('pass', (ctx) => {
        // A soft tap on the bowl lid rather than a stone on the board.
        const now = ctx.currentTime;
        playKnock(ctx, now, { from: 220, to: 110, gain: 0.35, decay: 0.12 });
        playClick(ctx, now, { freq: 900, q: 1.2, gain: 0.25, decay: 0.05 });
    });
};

export const playNewGameSound = () => {
    runSound('new-game', (ctx) => {
        // Two stones set down, as when nigiri decides the colours.
        const now = ctx.currentTime;
        [0, 0.16].forEach((offset) => {
            playKnock(ctx, now + offset, { from: 300, to: 140, gain: 0.4, decay: 0.07 });
            playClick(ctx, now + offset, { freq: 3000, q: 1.4, gain: 0.6, decay: 0.035 });
        });
    });
};

export const resetAudioContextForTests = (): void => {
    audioCtx = null;
    onSoundInitError = null;
    resetSoundFailureReport();
};
