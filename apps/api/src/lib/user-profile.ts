import { prisma } from './prisma.js'

export function normalizeHandleBase(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)

  if (normalized.length >= 2) {
    return normalized
  }

  return `${normalized}player`.slice(0, 24)
}

export async function ensureUniqueHandle(base: string): Promise<string> {
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `${index + 1}`
    const candidate = `${base}${suffix}`.slice(0, 32)
    const existing = await prisma.user.findUnique({
      where: {
        handle: candidate,
      },
      select: {
        id: true,
      },
    })

    if (!existing) {
      return candidate
    }
  }

  return `${base}${Date.now().toString().slice(-6)}`.slice(0, 32)
}

export function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? 'Player'
  const words = localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)

  if (words.length === 0) {
    return 'Player'
  }

  return words
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
    .slice(0, 60)
}
