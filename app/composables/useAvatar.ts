import type { AvatarKind } from '~/types'

export const AVATAR_OPTIONS: { kind: AvatarKind; label: string; description: string }[] = [
  { kind: 'male', label: 'Male avatar', description: 'Casual shirt & trousers' },
  { kind: 'female', label: 'Female avatar', description: 'Kurta top & long hair' },
]

export function isAvatarKind(value: unknown): value is AvatarKind {
  return value === 'male' || value === 'female'
}

/** The shopper's chosen avatar — a purely visual preference. */
export function useAvatar() {
  const avatar = useState<AvatarKind | null>('avatar', () => null)

  function select(kind: AvatarKind) {
    avatar.value = kind
  }

  return { avatar, select }
}
