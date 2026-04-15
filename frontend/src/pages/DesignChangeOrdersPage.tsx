import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { api } from '../api/client'
import type { ChangeOrder, Me } from '../types'
import { formatIST } from '../utils/time'

type ProjectChangeOrders = {
  projectId: string
  projectName: string
  projectCode: string
  orders: ChangeOrder[]
}

function kindLabel(kind?: ChangeOrder['request_kind']): string {
  if (kind === 'quantity_variation') return 'Quantity variation'
  if (kind === 'addition_new_item') return 'Addition of new item'
  return 'Not set'
}

export function DesignChangeOrdersPage() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
  })

  const designMemberships = useMemo(() => {
    const memberships = me?.memberships ?? []
    return memberships.filter((m) => m.role === 'design' || m.role === 'admin')
  }, [me])

  const membershipKey = useMemo(
    () => designMemberships.map((m) => m.project_id).sort().join('|'),
    [designMemberships],
  )

  const { data: groups, isLoading: ordersLoading } = useQuery({
    queryKey: ['design-change-orders-all', membershipKey],
    enabled: !meLoading && designMemberships.length > 0,
    queryFn: async (): Promise<ProjectChangeOrders[]> => {
      const projects = Array.from(
        new Map(
          designMemberships.map((m) => [
            m.project_id,
            {
              projectId: m.project_id,
              projectName: m.project_name,
              projectCode: m.project_code,
            },
          ]),
        ).values(),
      )

      const fetched = await Promise.all(
        projects.map(async (project) => {
          const orders = await api<ChangeOrder[]>(`/projects/${project.projectId}/design/change-orders`)
          const sorted = [...orders].sort((a, b) => {
            const aTime = a.created_at ? Date.parse(a.created_at) : 0
            const bTime = b.created_at ? Date.parse(b.created_at) : 0
            return bTime - aTime
          })
          return {
            ...project,
            orders: sorted,
          }
        }),
      )

      return fetched.sort((a, b) => a.projectName.localeCompare(b.projectName))
    },
  })

  if (meLoading || ordersLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading change orders...</Typography>
      </Box>
    )
  }

  if (!designMemberships.length) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Design change orders
        </Typography>
        <Typography color="text.secondary">
          You do not have a Design role on any project.
        </Typography>
      </Paper>
    )
  }

  return (
    <Box sx={{ p: { xs: 1, md: 0 } }}>
      <Stack direction="row" sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4">Design Change Orders</Typography>
        <Button component={RouterLink} to="/" variant="outlined">
          Back to dashboard
        </Button>
      </Stack>

      <Stack spacing={2}>
        {(groups ?? []).map((group) => (
          <Paper key={group.projectId} sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
              <Typography variant="h6">{group.projectName}</Typography>
              <Chip size="small" label={group.projectCode} />
              <Button
                size="small"
                variant="outlined"
                component={RouterLink}
                to={`/design/${group.projectId}`}
              >
                Open project
              </Button>
            </Stack>

            {!group.orders.length ? (
              <Typography color="text.secondary">No change orders yet for this project.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Reference</TableCell>
                    <TableCell>Request</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created (IST)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell sx={{ fontWeight: 700 }}>{order.reference}</TableCell>
                      <TableCell>{kindLabel(order.request_kind)}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{order.status}</TableCell>
                      <TableCell>{formatIST(order.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        ))}
      </Stack>
    </Box>
  )
}
