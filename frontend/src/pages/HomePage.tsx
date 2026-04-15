import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Me, Project } from '../types'

export function HomePage() {
  const nav = useNavigate()
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  })

  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const selectedProject = useMemo(() => {
    const list = projects ?? []
    if (!list.length) return undefined
    if (selectedProjectId) {
      const found = list.find((p) => p.id === selectedProjectId)
      if (found) return found
    }
    return list[0]
  }, [projects, selectedProjectId])

  const memberships = me?.memberships ?? []
  const membershipForSelected = memberships.find((m) => m.project_id === selectedProject?.id)

  function routeForRole(projectId: string, role: string): string {
    if (role === 'design') return `/design/${projectId}`
    if (role === 'qs') return `/qs/${projectId}`
    return `/contracts/${projectId}`
  }

  return (
    <Box sx={{ p: { xs: 1, md: 0 } }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Signed in as {me?.user.full_name} ({me?.user.email})
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '320px 1fr' },
          gap: 2,
          minHeight: 520,
        }}
      >
        <Paper sx={{ p: 1.5 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>
            Projects
          </Typography>
          <Stack spacing={1}>
            {projects?.map((p) => {
              const active = selectedProject?.id === p.id
              return (
                <Box
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  sx={{
                    p: 1.25,
                    border: '1px solid',
                    borderColor: active ? 'primary.main' : '#e5e7eb',
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: active ? '#f9fafb' : '#fff',
                  }}
                >
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    {p.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {p.code}
                  </Typography>
                </Box>
              )
            })}
            {!projects?.length && (
              <Typography color="text.secondary">No projects yet.</Typography>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          {selectedProject ? (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                <Typography variant="h5">{selectedProject.name}</Typography>
                <Chip size="small" label={selectedProject.code} />
                {membershipForSelected && (
                  <Chip
                    size="small"
                    label={`role: ${membershipForSelected.role}`}
                    variant="outlined"
                  />
                )}
              </Stack>

              <Typography color="text.secondary" sx={{ mb: 3 }}>
                Choose your working dashboard for this project.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                {memberships
                  .filter((m) => m.project_id === selectedProject.id)
                  .filter((m) => m.role !== 'design')
                  .map((m) => (
                    <Button
                      key={`${m.project_id}-${m.role}`}
                      variant={m.role === 'contracts' ? 'contained' : 'outlined'}
                      onClick={() => nav(routeForRole(selectedProject.id, m.role))}
                    >
                      {m.role === 'qs' ? 'Received variation change requests' : `Open ${m.role} dashboard`}
                    </Button>
                  ))}
                {!memberships.some((m) => m.project_id === selectedProject.id) && (
                  <Typography color="text.secondary">No dashboard role assigned for this project.</Typography>
                )}
                {memberships.some((m) => m.project_id === selectedProject.id && m.role === 'design') && (
                  <Typography color="text.secondary">
                    Design workspace is available from the Project Dashboards list in the left panel.
                  </Typography>
                )}
              </Stack>
            </>
          ) : (
            <Typography color="text.secondary">Select a project to view details.</Typography>
          )}
          {me?.user.is_superuser && (
            <Box sx={{ mt: 4 }}>
              <Button variant="outlined" onClick={() => nav('/admin')}>
                Open admin panel
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  )
}
