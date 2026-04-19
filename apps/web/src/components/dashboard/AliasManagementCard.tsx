import { useMemo, useState } from 'react'
import { Box, Button, Card, Input, Stack, Typography } from '@mui/joy'
import type { LibraryEntry, UserPlatformAlias } from '@game-is-up/shared'

type AliasDrafts = Record<string, string>

export function AliasManagementCard({
  libraryEntries,
  platformAliases,
  savingKey,
  onSavePlatformAlias,
  onDeletePlatformAlias
}: {
  libraryEntries: LibraryEntry[];
  platformAliases: UserPlatformAlias[];
  savingKey: string | null;
  onSavePlatformAlias: (platform: string, aliasValue: string) => Promise<void>;
  onDeletePlatformAlias: (platform: string) => Promise<void>;
}) {
  const [platformDrafts, setPlatformDrafts] = useState<AliasDrafts>({})

  const platformAliasByPlatform = useMemo(
    () => new Map(platformAliases.map((alias) => [alias.platform.toLowerCase(), alias.aliasValue])),
    [platformAliases]
  )

  const platforms = useMemo(() => {
    const fromLibrary = libraryEntries.flatMap((entry) => entry.platformLabels.map((label) => label.toLowerCase()))
    return [...new Set([...fromLibrary, ...platformAliases.map((alias) => alias.platform.toLowerCase())])]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 12)
  }, [libraryEntries, platformAliases])

  if (libraryEntries.length === 0 && platformAliases.length === 0) {
    return null
  }

  return (
    <Card variant="soft" sx={{ p: 2.25 }}>
      <Stack spacing={2}>
        <Box>
          <Typography level="title-md">Aliases</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Save your platform-specific handles. Game-specific aliases are edited directly in each game card below.
          </Typography>
        </Box>

        {platforms.length > 0 ? (
          <Stack spacing={1}>
            <Typography level="title-sm">Platform aliases</Typography>
            {platforms.map((platform) => {
              const currentValue = platformDrafts[platform] ?? platformAliasByPlatform.get(platform) ?? ''
              const currentKey = `platform:${platform}`
              return (
                <Stack key={platform} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography level="body-sm" sx={{ minWidth: 88, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {platform}
                    </Typography>
                    <Input
                      value={currentValue}
                      placeholder={`Your ${platform} alias`}
                      onChange={(event) => {
                        const value = event.target.value
                        setPlatformDrafts((current) => ({ ...current, [platform]: value }))
                      }}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}>
                    <Button
                      variant="solid"
                      color="primary"
                      disabled={!currentValue.trim() || savingKey === currentKey}
                      onClick={() => void onSavePlatformAlias(platform, currentValue)}
                      sx={{ flex: 1 }}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outlined"
                      color="neutral"
                      disabled={savingKey === currentKey || !platformAliasByPlatform.has(platform)}
                      onClick={() => void onDeletePlatformAlias(platform)}
                      sx={{ flex: 1 }}
                    >
                      Clear
                    </Button>
                  </Stack>
                </Stack>
              )
            })}
          </Stack>
        ) : null}

      </Stack>
    </Card>
  )
}
