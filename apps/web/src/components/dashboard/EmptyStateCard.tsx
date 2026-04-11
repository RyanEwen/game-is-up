import { Card, Chip, Stack, Typography } from '@mui/joy'

export function EmptyStateCard({
  title,
  body,
  chips
}: {
  title: string;
  body: string;
  chips?: string[];
}) {
  return (
    <Card
      variant="soft"
      sx={{
        p: 3,
        border: '1px dashed rgba(255, 255, 255, 0.14)',
        backgroundColor: 'rgba(13, 18, 30, 0.65)'
      }}
    >
      <Stack spacing={1.5}>
        <Typography level="title-lg">{title}</Typography>
        <Typography level="body-md" sx={{ color: 'neutral.300' }}>
          {body}
        </Typography>
        {chips && chips.length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {chips.map((chip) => (
              <Chip key={chip} variant="outlined" color="neutral">
                {chip}
              </Chip>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}