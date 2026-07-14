import cardDrawUrl from '../assets/audio/card-draw.mp3'
import correctSoundUrl from '../assets/audio/richtig-sound.mp3'
import blobbenCardDrawUrl from '../assets/audio/blobben-card-draw.mp3'

export type SoundName =
  | 'ui-click' | 'ui-back' | 'ui-confirm' | 'ui-delete'
  | 'game-start' | 'card-draw' | 'blobben-card-draw' | 'card-flip' | 'correct' | 'wrong'
  | 'success' | 'player-change' | 'notification' | 'favorite-on'
  | 'favorite-off' | 'collect-card' | 'remove-card' | 'game-finish'

const ENABLED_KEY = 'blobbaSoundEffectsEnabled'
const VOLUME_KEY = 'blobbaSoundEffectsVolume'
let context: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let unlocked = false
let unlockPromise: Promise<boolean> | null = null
let mediaChannelAudio: HTMLAudioElement | null = null
const activeWebAudioSources = new Set<AudioScheduledSourceNode>()
const cardDrawPool = Array.from({ length: 3 }, () => {
  const audio = new Audio(cardDrawUrl)
  audio.preload = 'auto'
  audio.setAttribute('playsinline', '')
  return audio
})
let cardDrawPoolIndex = 0
const correctSoundPool = Array.from({ length: 3 }, () => {
  const audio = new Audio(correctSoundUrl)
  audio.preload = 'auto'
  audio.setAttribute('playsinline', '')
  return audio
})
let correctSoundPoolIndex = 0
const blobbenCardDrawPool = Array.from({ length: 3 }, () => {
  const audio = new Audio(blobbenCardDrawUrl)
  audio.preload = 'auto'
  audio.setAttribute('playsinline', '')
  return audio
})
let blobbenCardDrawPoolIndex = 0

function playCardDraw() {
  const audio = cardDrawPool[cardDrawPoolIndex]!
  cardDrawPoolIndex = (cardDrawPoolIndex + 1) % cardDrawPool.length
  audio.pause()
  audio.currentTime = 0
  audio.muted = false
  audio.volume = Math.min(1, readVolume() * .9)
  void audio.play().catch((error) => {
    if (import.meta.env.DEV) console.warn('[Audio] Kartenaufnahme konnte nicht abgespielt werden.', error)
  })
}

function playCorrectSound() {
  const audio = correctSoundPool[correctSoundPoolIndex]!
  correctSoundPoolIndex = (correctSoundPoolIndex + 1) % correctSoundPool.length
  audio.pause()
  audio.currentTime = 0
  audio.muted = false
  audio.volume = Math.min(1, readVolume())
  void audio.play().catch((error) => {
    if (import.meta.env.DEV) console.warn('[Audio] Richtig-Sound konnte nicht abgespielt werden.', error)
  })
}

function playBlobbenCardDraw() {
  activeWebAudioSources.forEach((source) => {
    try { source.stop() } catch { /* Source has already ended. */ }
  })
  activeWebAudioSources.clear()
  ;[...cardDrawPool, ...correctSoundPool].forEach((entry) => {
    entry.pause()
    entry.currentTime = 0
  })
  blobbenCardDrawPool.forEach((entry) => {
    entry.pause()
    entry.currentTime = 0
  })
  const audio = blobbenCardDrawPool[blobbenCardDrawPoolIndex]!
  blobbenCardDrawPoolIndex = (blobbenCardDrawPoolIndex + 1) % blobbenCardDrawPool.length
  audio.muted = false
  audio.volume = Math.min(1, readVolume() * .9)
  void audio.play().catch((error) => {
    if (import.meta.env.DEV) console.warn('[Audio] Blobben-Kartenziehsound konnte nicht abgespielt werden.', error)
  })
}

function silentWavUrl() {
  const sampleRate = 8000
  const sampleCount = sampleRate / 4
  const bytes = new Uint8Array(44 + sampleCount * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, sampleCount * 2, true)
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

function ensureMediaChannel() {
  if (!mediaChannelAudio) {
    mediaChannelAudio = new Audio(silentWavUrl())
    mediaChannelAudio.preload = 'auto'
    mediaChannelAudio.loop = true
    mediaChannelAudio.setAttribute('playsinline', '')
    mediaChannelAudio.volume = 1
  }
  if (!mediaChannelAudio.paused) return
  void mediaChannelAudio.play().catch((error) => {
    if (import.meta.env.DEV) console.warn('[Audio] iOS-Medienkanal konnte nicht aktiviert werden.', error)
  })
}

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
  if (!enabled && mediaChannelAudio) {
    mediaChannelAudio.pause()
    mediaChannelAudio.currentTime = 0
  }
}

export function setSoundEffectsVolume(volume: number) {
  localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, volume))))
}

export function unlockAudio() {
  // HTML media uses iOS' playback channel, so Web Audio remains audible when
  // the Ring/Silent switch is enabled. play() must happen in the tap itself.
  ensureMediaChannel()
  if (unlocked && context?.state === 'running') return Promise.resolve(true)
  if (unlockPromise) return unlockPromise
  unlockPromise = (async () => {
    try {
      const ctx = audioContext()
      // Scheduling a silent source synchronously inside the real touch/click is
      // required by iOS Safari and standalone PWAs before resume() settles.
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      gain.gain.value = 0
      source.buffer = buffer
      source.connect(gain).connect(ctx.destination)
      source.start()
      if (ctx.state !== 'running') await ctx.resume()
      unlocked = ctx.state === 'running'
      return unlocked
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[Audio] AudioContext konnte nicht entsperrt werden.', error)
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
  activeWebAudioSources.add(oscillator)
  oscillator.addEventListener('ended', () => activeWebAudioSources.delete(oscillator), { once: true })
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
  activeWebAudioSources.add(source)
  source.addEventListener('ended', () => activeWebAudioSources.delete(source), { once: true })
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
    case 'card-draw': break
    case 'blobben-card-draw': break
    case 'card-flip': n(.045, .07, 2600); t(620, .045, .045, .03, 390, 'triangle'); break
    case 'correct': break
    case 'wrong': t(330, .24, .07, 0, 310, 'triangle'); t(247, .31, .075, .13, 220, 'sine'); t(123, .2, .018, .135, 110, 'sine'); break
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
  ensureMediaChannel()
  if (name === 'card-draw') {
    playCardDraw()
    if (!unlocked || context?.state !== 'running') void unlockAudio()
    return
  }
  if (name === 'blobben-card-draw') {
    playBlobbenCardDraw()
    if (!unlocked || context?.state !== 'running') void unlockAudio()
    return
  }
  if (name === 'correct') {
    playCorrectSound()
    if (!unlocked || context?.state !== 'running') void unlockAudio()
    return
  }
  // Web-Audio-Nodes may be queued while suspended. Creating them directly in
  // the originating event keeps iOS' user activation; resume releases them.
  renderSound(name)
  if (!unlocked || context?.state !== 'running') void unlockAudio()
}

const unlock = () => { void unlockAudio() }
document.addEventListener('pointerdown', unlock, { once: true, passive: true, capture: true })
document.addEventListener('touchstart', unlock, { once: true, passive: true, capture: true })
document.addEventListener('click', unlock, { once: true, passive: true, capture: true })
document.addEventListener('keydown', unlock, { once: true, capture: true })

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !context || context.state === 'running') return
  unlocked = false
  void unlockAudio()
})
