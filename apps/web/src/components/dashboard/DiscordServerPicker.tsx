import { Avatar, Option, Select, Stack, Typography } from '@mui/joy'

type DiscordServerPickerOption = {
  id: string
  name: string
  iconUrl: string | null
}

export function DiscordServerPicker<
  OptionType extends DiscordServerPickerOption,
>({
  options,
  value,
  placeholder,
  onChange,
  getOptionDescription,
  emptyOptionLabel,
}: {
  options: OptionType[]
  value: string
  placeholder: string
  onChange: (serverId: string) => void
  getOptionDescription?: (option: OptionType) => string | null
  emptyOptionLabel?: string
}) {
  const selectedServer = options.find((option) => option.id === value) ?? null

  return (
    <Select
      value={emptyOptionLabel ? value : value || null}
      placeholder={placeholder}
      renderValue={() =>
        selectedServer ? (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ minWidth: 0 }}
          >
            <Avatar
              src={selectedServer.iconUrl ?? undefined}
              alt={selectedServer.name}
              size="sm"
              variant="soft"
              sx={{
                bgcolor: selectedServer.iconUrl ? undefined : 'neutral.softBg',
                color: 'neutral.200',
                fontWeight: 700,
              }}
            >
              {selectedServer.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <Typography
              level="body-sm"
              sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {selectedServer.name}
            </Typography>
          </Stack>
        ) : emptyOptionLabel && value === '' ? (
          <Typography
            level="body-sm"
            sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {emptyOptionLabel}
          </Typography>
        ) : null
      }
      onChange={(_event, nextValue) => onChange(nextValue ?? '')}
    >
      {emptyOptionLabel ? <Option value="">{emptyOptionLabel}</Option> : null}
      {options.map((option) => {
        const description = getOptionDescription?.(option) ?? null

        return (
          <Option key={option.id} value={option.id}>
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={{ minWidth: 0 }}
            >
              <Avatar
                src={option.iconUrl ?? undefined}
                alt={option.name}
                size="sm"
                variant="soft"
                sx={{
                  bgcolor: option.iconUrl ? undefined : 'neutral.softBg',
                  color: 'neutral.200',
                  fontWeight: 700,
                }}
              >
                {option.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <Stack spacing={description ? 0.25 : 0} sx={{ minWidth: 0 }}>
                <Typography
                  level="body-sm"
                  sx={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {option.name}
                </Typography>
                {description ? (
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    {description}
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          </Option>
        )
      })}
    </Select>
  )
}
