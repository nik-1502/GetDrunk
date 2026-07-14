export type SoundName =
  | 'ui-click' | 'ui-back' | 'ui-confirm' | 'ui-delete'
  | 'game-start' | 'card-draw' | 'card-flip' | 'correct' | 'wrong'
  | 'success' | 'player-change' | 'notification' | 'favorite-on'
  | 'favorite-off' | 'collect-card' | 'remove-card' | 'game-finish'

const ENABLED_KEY = 'blobbaSoundEffectsEnabled'
const VOLUME_KEY = 'blobbaSoundEffectsVolume'
let context: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let unlocked = false
let unlockPromise: Promise<boolean> | null = null

function readEnabled() {
  return localStorage.getItem(ENABLED_KEY) !== 'false'
}

function readVolume() {
  const value = Number(localStorage.getItem(VOLUME_KEY) ?? '0.65')
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.65
}

function audioContext() {
  context ??= new AudioContext()
  return context
}

export function getSoundSettings() {
  return { enabled: readEnabled(), volume: readVolume() }
}

export function setSoundEffectsEnabled(enabled: boolean) {
  localStorage.setItem(ENABLED_KEY, String(enabled))
}

export function setSoundEffectsVolume(volume: number) {
  localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, volume))))
}

export function unlockAudio() {
  if (unlocked && context?.state === 'running') return Promise.resolve(true)
  if (unlockPromise) return unlockPromise
  unlockPromise = (async () => {
    try {
    const ctx = audioContext()
    if (ctx.state !== 'running') await ctx.resume()
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
    unlocked = ctx.state === 'running'
    return unlocked
    } catch {
      return false
    } finally {
      unlockPromise = null
    }
  })()
  return unlockPromise
}

function tone(ctx: AudioContext, frequency: number, duration: number, gainValue: number, delay = 0, endFrequency = frequency, type: OscillatorType = 'sine') {
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

function noise(ctx: AudioContext, duration: number, gainValue: number, frequency: number, delay = 0) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  }
  const start = ctx.currentTime + delay
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = noiseBuffer
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = 0.7
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), start + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(start)
  source.stop(start + duration + 0.02)
}

function renderSound(name: SoundName) {
  const ctx = audioContext()
  const volume = readVolume()
  const t = (frequency: number, duration: number, gain: number, delay = 0, end = frequency, type: OscillatorType = 'sine') => tone(ctx, frequency, duration, gain * volume, delay, end, type)
  const n = (duration: number, gain: number, frequency: number, delay = 0) => noise(ctx, duration, gain * volume, frequency, delay)

  switch (name) {
    case 'ui-click': t(520, .055, .09, 0, 430, 'triangle'); break
    case 'ui-back': t(440, .09, .1, 0, 270, 'triangle'); break
    case 'ui-confirm': t(520, .08, .09); t(740, .12, .1, .07); break
    case 'ui-delete': n(.1, .08, 900); t(190, .13, .11, 0, 95, 'square'); break
    case 'game-start': t(260, .12, .09); t(390, .13, .1, .09); t(620, .2, .11, .18); break
    case 'card-draw': n(.22, .13, 1250); n(.12, .07, 2400, .08); break
    case 'card-flip': n(.085, .13, 1900); t(760, .055, .06, .045, 420, 'triangle'); break
    case 'correct': t(520, .1, .1); t(780, .16, .12, .08); break
    case 'wrong': t(230, .14, .12, 0, 150, 'sawtooth'); t(135, .16, .09, .1, 90, 'sawtooth'); break
    case 'success': t(440, .1, .08); t(660, .11, .1, .08); t(880, .2, .11, .17); break
    case 'player-change': t(360, .08, .07); t(540, .1, .08, .07); break
    case 'notification': t(720, .08, .08); t(920, .1, .07, .09); break
    case 'favorite-on': t(540, .09, .08); t(820, .14, .1, .07); break
    case 'favorite-off': t(620, .08, .08); t(390, .12, .08, .06); break
    case 'collect-card': n(.12, .08, 1500); t(500, .08, .08, .05); t(720, .12, .09, .11); break
    case 'remove-card': n(.11, .09, 1100); t(390, .1, .08, 0, 220, 'triangle'); break
    case 'game-finish': t(330, .12, .08); t(495, .14, .09, .09); t(660, .16, .1, .19); t(990, .3, .11, .3); break
  }
}

export function playSound(name: SoundName) {
  if (!readEnabled()) return
  if (unlocked && context?.state === 'running') {
    renderSound(name)
    return
  }
  void unlockAudio().then((ready) => {
    if (ready && readEnabled()) renderSound(name)
  })
}

const unlock = () => { void unlockAudio() }
document.addEventListener('pointerdown', unlock, { once: true, passive: true, capture: true })
document.addEventListener('touchstart', unlock, { once: true, passive: true, capture: true })
document.addEventListener('keydown', unlock, { once: true, capture: true })
