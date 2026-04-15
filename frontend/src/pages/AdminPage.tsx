import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import {
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { api } from '../api/client'
import type { Project } from '../types'

type UserRow = { id: string; email: string; full_name: string }

export function AdminPage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { is_superuser: boolean } }>('/auth/me'),
  })
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserRow[]>('/users'),
    enabled: !!me?.user.is_superuser,
  })
  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading…</Typography>
      </Box>
    )
  }
  if (me && !me.user.is_superuser) return <Navigate to="/" replace />
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  })
  const [pid, setPid] = useState('')
  const [uid, setUid] = useState('')
  const [role, setRole] = useState('contracts')

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="h4" gutterBottom>
        Admin
      </Typography>
      <Typography variant="h6">Users</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Email</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>ID</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users?.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.full_name}</TableCell>
              <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>{u.id}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Typography variant="h6" sx={{ mt: 3 }}>
        Assign membership
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ my: 2 }}>
        <TextField select size="small" label="Project" value={pid} onChange={(e) => setPid(e.target.value)} sx={{ minWidth: 220 }}>
          {projects?.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="User" value={uid} onChange={(e) => setUid(e.target.value)} sx={{ minWidth: 220 }}>
          {users?.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.email}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Role" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="contracts">contracts</MenuItem>
          <MenuItem value="design">design</MenuItem>
          <MenuItem value="qs">qs</MenuItem>
          <MenuItem value="admin">admin</MenuItem>
        </TextField>
        <Button
          variant="contained"
          onClick={async () => {
            await api(`/projects/${pid}/members`, {
              method: 'POST',
              body: JSON.stringify({ user_id: uid, role }),
            })
          }}
        >
          Save
        </Button>
      </Stack>
    </Box>
  )
}
