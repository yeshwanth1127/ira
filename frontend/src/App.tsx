import type { ReactElement } from 'react'
import { Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { api, clearTokens, getAccessToken } from './api/client'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { ContractsPage } from './pages/ContractsPage'
import { DesignPage } from './pages/DesignPage'
import { DesignChangeOrdersPage } from './pages/DesignChangeOrdersPage'
import { CreateChangeOrderPage } from './pages/CreateChangeOrderPage'
import { QsPage } from './pages/QsPage'
import { AdminPage } from './pages/AdminPage'
import { BoqLinesPage } from './pages/BoqLinesPage'
import { ApprovedBoqsPage } from './pages/ApprovedBoqsPage'
import type { DepartmentRole, Me } from './types'

function useAuth() {
  const token = getAccessToken()
  const q = useQuery({
    queryKey: ['me', token],
    queryFn: () => api<Me>('/auth/me'),
    enabled: !!token,
    retry: false,
  })
  return { token, me: q.data, loading: q.isLoading && !!token }
}

function ProtectedLayout() {
  const { token, me, loading } = useAuth()
  const nav = useNavigate()
  const hasDesignAccess = !!me?.memberships.some((m) => m.role === 'design' || m.role === 'admin')
  const hasApprovedBoqAccess =
    !!me?.user.is_superuser ||
    !!me?.memberships.some(
      (m) => m.role === 'contracts' || m.role === 'design' || m.role === 'admin',
    )
  if (!token) return <Navigate to="/login" replace />
  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading…</Typography>
      </Box>
    )
  }
  if (!me) {
    clearTokens()
    return <Navigate to="/login" replace />
  }

  function dashboardPath(projectId: string, role: DepartmentRole): string {
    if (role === 'design') return `/design/${projectId}`
    if (role === 'qs') return `/qs/${projectId}`
    return `/contracts/${projectId}`
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
      <Box
        sx={{
          width: { xs: '100%', md: 300 },
          borderRight: { md: '1px solid #e5e7eb' },
          borderBottom: { xs: '1px solid #e5e7eb', md: 'none' },
          bgcolor: 'background.paper',
          p: 2,
          position: { md: 'sticky' },
          top: 0,
          height: { md: '100vh' },
          overflowY: 'auto',
        }}
      >
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          Alufit
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {me.user.full_name}
        </Typography>

        <Stack spacing={1}>
          <Button variant="contained" onClick={() => nav('/')}>
            Projects
          </Button>
          {hasApprovedBoqAccess && (
            <Button variant="outlined" onClick={() => nav('/approved-boqs')}>
              Approved BOQ's
            </Button>
          )}
          {hasDesignAccess && (
            <Button variant="outlined" onClick={() => nav('/design/change-orders')}>
              Design change orders
            </Button>
          )}
          {me.user.is_superuser && (
            <Button variant="outlined" onClick={() => nav('/admin')}>
              Admin
            </Button>
          )}
        </Stack>

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Project Dashboards
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {me.memberships.map((m) => (
            <Box
              key={`${m.project_id}-${m.role}`}
              sx={{
                border: '1px solid #e5e7eb',
                borderRadius: 2,
                p: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                  {m.project_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {m.project_code}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={m.role}
                onClick={() => nav(dashboardPath(m.project_id, m.role))}
                sx={{ cursor: 'pointer', textTransform: 'capitalize' }}
              />
            </Box>
          ))}
          {!me.memberships.length && (
            <Typography variant="caption" color="text.secondary">
              No project membership assigned.
            </Typography>
          )}
        </Stack>

        <Divider sx={{ my: 2 }} />
        <Button
          fullWidth
          color="inherit"
          onClick={() => {
            clearTokens()
            nav('/login')
          }}
        >
          Sign out
        </Button>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, p: { xs: 1.5, md: 3 } }}>
        <Outlet />
      </Box>
    </Box>
  )
}

function ProjectRoleRoute({
  allowed,
  element,
}: {
  allowed: DepartmentRole[]
  element: ReactElement
}) {
  const { token, me, loading } = useAuth()
  const { projectId = '' } = useParams()

  if (!token) return <Navigate to="/login" replace />
  if (loading) return null
  if (!me) return <Navigate to="/login" replace />
  if (me.user.is_superuser) return element

  const membership = me.memberships.find((m) => m.project_id === projectId)
  if (!membership) return <Navigate to="/" replace />
  if (!allowed.includes(membership.role) && membership.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return element
}

function AnyRoleRoute({
  allowed,
  element,
}: {
  allowed: DepartmentRole[]
  element: ReactElement
}) {
  const { token, me, loading } = useAuth()

  if (!token) return <Navigate to="/login" replace />
  if (loading) return null
  if (!me) return <Navigate to="/login" replace />
  if (me.user.is_superuser) return element

  const hasAllowedMembership = me.memberships.some(
    (m) => allowed.includes(m.role) || m.role === 'admin',
  )
  if (!hasAllowedMembership) return <Navigate to="/" replace />
  return element
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/approved-boqs"
          element={<AnyRoleRoute allowed={['contracts', 'design']} element={<ApprovedBoqsPage />} />}
        />
        <Route
          path="/contracts/:projectId"
          element={<ProjectRoleRoute allowed={['contracts']} element={<ContractsPage />} />}
        />
        <Route
          path="/contracts/:projectId/boq/:versionId/lines"
          element={<ProjectRoleRoute allowed={['contracts', 'qs']} element={<BoqLinesPage />} />}
        />
        <Route
          path="/design/:projectId"
          element={<ProjectRoleRoute allowed={['design']} element={<DesignPage />} />}
        />
        <Route
          path="/design/change-orders"
          element={<AnyRoleRoute allowed={['design']} element={<DesignChangeOrdersPage />} />}
        />
        <Route
          path="/design/:projectId/change-order/new"
          element={<ProjectRoleRoute allowed={['design']} element={<CreateChangeOrderPage />} />}
        />
        <Route
          path="/change-orders/:projectId"
          element={<ProjectRoleRoute allowed={['design']} element={<CreateChangeOrderPage />} />}
        />
        <Route path="/qs/:projectId" element={<ProjectRoleRoute allowed={['qs']} element={<QsPage />} />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
