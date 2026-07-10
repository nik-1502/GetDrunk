const avatarModules = import.meta.glob('./assets/profil-Bilder-optimiert/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

type AvatarDefinition = {
  id: string
  fileName: string
  label: string
  color: string
}

export type AvatarOption = Omit<AvatarDefinition, 'fileName'> & { src: string }

// `color` is the exact flat fill of the light inner circle behind each motif.
const avatarDefinitions: AvatarDefinition[] = [
  { id: 'bier', fileName: 'bier.png', label: 'Bier', color: '#E68931' },
  { id: 'shot', fileName: 'shot.png', label: 'Shotglas', color: '#C3F4F8' },
  { id: 'becher', fileName: 'Becher.png', label: 'Beerpong-Becher', color: '#FF669A' },
  { id: 'cocktail', fileName: 'cocktail.png', label: 'Cocktail', color: '#4EA16B' },
  { id: 'whisky', fileName: 'whisky.png', label: 'Whisky', color: '#DA804A' },
  { id: 'wein', fileName: 'wein.png', label: 'Weinglas', color: '#F9817B' },
  { id: 'champagner', fileName: 'champagner.png', label: 'Champagner', color: '#A3BF00' },
  { id: 'wuerfel', fileName: 'würfel.png', label: 'Würfel', color: '#9377B5' },
  { id: 'bierpong', fileName: 'bierpong.png', label: 'Beerpong', color: '#5FA1B4' },
]

function moduleForFile(fileName: string) {
  return Object.entries(avatarModules).find(([path]) => path.endsWith(`/${fileName}`))?.[1] ?? ''
}

export const avatarOptions: AvatarOption[] = avatarDefinitions.map(({ fileName, ...definition }) => ({
  ...definition,
  src: moduleForFile(fileName),
})).filter((avatar) => avatar.src)

export function avatarOption(avatarId: string | null | undefined) {
  return avatarOptions.find((avatar) => avatar.id === avatarId)
}

export function avatarSource(avatarId: string | null | undefined) {
  return avatarOption(avatarId)?.src ?? ''
}

export function avatarColor(avatarId: string | null | undefined) {
  return avatarOption(avatarId)?.color ?? '#8793a5'
}

export function defaultProfileIconMarkup() {
  return `<svg class="default-profile-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="23" r="12"></circle>
    <path d="M11 57c1.6-13 9-20 21-20s19.4 7 21 20"></path>
  </svg>`
}

export function avatarVisualMarkup(avatarId: string | null | undefined, alt = '') {
  const avatar = avatarOption(avatarId)
  return avatar
    ? `<img src="${avatar.src}" alt="${alt}">`
    : defaultProfileIconMarkup()
}
