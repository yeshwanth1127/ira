import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { api, setTokens } from '../api/client'

export function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('contracts@alufit.local')
  const [password, setPassword] = useState('demo123')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const t = await api<{ access_token: string; refresh_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      })
      setTokens(t.access_token, t.refresh_token)
      nav('/')
    } catch {
      setErr('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        px: { xs: 1.5, md: 4 },
        py: { xs: 1.5, md: 4 },
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 980,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' },
          gap: 2,
        }}
      >
        <Paper sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h4" sx={{ mb: 1 }}>
              Alufit Workflow
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 460 }}>
              Role-based dashboard for Contracts, Design, and QS teams. Choose your project and continue from your assigned workspace.
            </Typography>
          </Box>
          <Stack spacing={0.5} sx={{ mt: 4 }}>
            <Typography variant="body2">Demo user: contracts@alufit.local / demo123</Typography>
            <Typography variant="body2">Admin user: admin@alufit.local / admin123</Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: { xs: 3, md: 4 } }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Sign in
          </Typography>
          <form onSubmit={submit}>
            <Stack spacing={2}>
              {err && <Alert severity="error">{err}</Alert>}
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label="Password"
                type="password"
                fullWidth
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </Stack>
          </form>
        </Paper>
      </Box>
    </Box>
  )
}
