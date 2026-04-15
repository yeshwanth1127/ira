import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { BoqLineOut, BoqVersion, ChangeOrder, Project, QsRun, QsVariance } from '../types'
import { formatIST } from '../utils/time'

const serif = `'Georgia', 'Times New Roman', serif`

export function QsPage() {
  const { projectId = '' } = useParams()
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
    enabled: !!projectId,
  })
  const { data: boqVersions } = useQuery({
    queryKey: ['boq', projectId],
    queryFn: () => api<BoqVersion[]>(`/projects/${projectId}/boq-versions`),
    enabled: !!projectId,
  })
  const { data: requests } = useQuery({
    queryKey: ['qs-requests', projectId],
    queryFn: () => api<ChangeOrder[]>(`/projects/${projectId}/qs/requests`),
    enabled: !!projectId,
  })
  const { data: runs, refetch: refetchRuns } = useQuery({
    queryKey: ['qs-runs', projectId],
    queryFn: () => api<QsRun[]>(`/projects/${projectId}/qs/runs`),
    enabled: !!projectId,
  })

  const [baseline, setBaseline] = useState('')
  const [target, setTarget] = useState('')
  const [activeRun, setActiveRun] = useState('')
  const [activeRequestId, setActiveRequestId] = useState('')
  const [erpNotice, setErpNotice] = useState('')
  const { data: variances } = useQuery({
    queryKey: ['qs-var', activeRun],
    queryFn: () => api<QsVariance[]>(`/projects/${projectId}/qs/runs/${activeRun}/variances`),
    enabled: !!projectId && !!activeRun,
  })
  const activeRequest = useMemo(
    () => requests?.find((r) => r.id === activeRequestId) ?? requests?.[0],
    [requests, activeRequestId],
  )
  const { data: requestLines } = useQuery({
    queryKey: ['qs-request-lines', activeRequest?.boq_version_id],
    queryFn: () => api<{ items: BoqLineOut[] }>(`/boq-versions/${activeRequest!.boq_version_id}/lines`),
    enabled: !!projectId && !!activeRequest?.boq_version_id,
  })

  const requestTotal = useMemo(
    () => (requestLines?.items ?? []).reduce((sum, line) => sum + line.amount, 0),
    [requestLines?.items],
  )

  const sheetRows = useMemo(() => {
    return (requestLines?.items ?? []).map((line, index) => ({
      ...line,
      rowType: parseLineRef(line.line_no).type,
      ref: parseLineRef(line.line_no).ref,
      subRef: parseLineRef(line.line_no).subRef ?? `${index + 1}`,
      currentQty: line.quantity,
      currentRate: line.rate,
      currentAmount: line.amount,
      initialQty: line.quantity,
      initialRate: line.rate,
      initialAmount: line.amount,
    }))
  }, [activeRequest?.reference, requestLines?.items])

  const sendToContracts = useMutation({
    mutationFn: async (coId: string) => api(`/projects/${projectId}/qs/requests/${coId}/send-to-contracts`, { method: 'POST' }),
    onSuccess: () => {
      setErpNotice('Sent to Contracts to update in ERP.')
    },
  })

  const locked = boqVersions?.filter((b) => b.status === 'locked') ?? []

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        QS — {project?.name}
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">Received Variation Change Requests</Typography>
            <Typography variant="body2" color="text.secondary">
              Requests routed to QS from quantity variation submissions.
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => setActiveRequestId(requests?.[0]?.id ?? '')}>
            Received variation change requests
          </Button>
        </Stack>

        {!requests?.length ? (
          <Typography color="text.secondary">No quantity variation requests yet.</Typography>
        ) : (
          <>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>BOQ</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id} selected={r.id === activeRequest?.id}>
                    <TableCell>{r.reference}</TableCell>
                    <TableCell>{r.boq_version_id ?? '—'}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell>{formatIST(r.created_at)}</TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => setActiveRequestId(r.id)}>
                        View request
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {activeRequest && (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                {erpNotice && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    {erpNotice}
                  </Alert>
                )}
                <Box
                  sx={{
                    border: '1px solid #1f1f1f',
                    bgcolor: '#fff',
                    overflowX: 'auto',
                    fontFamily: serif,
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #1f1f1f' }}>
                    <Box sx={{ p: 1.2, borderRight: '1px solid #1f1f1f', minHeight: 76 }}>
                      <Typography sx={{ fontFamily: serif, fontWeight: 700, fontSize: '1.15rem' }}>
                        {project?.name ?? 'Project'}
                      </Typography>
                      <Typography variant="caption" sx={{ fontFamily: serif, display: 'block', mt: 1 }}>
                        {project?.code ?? '—'}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1.2, borderRight: '1px solid #1f1f1f', textAlign: 'center', minHeight: 76 }}>
                      <Typography sx={{ fontFamily: serif, fontWeight: 700, fontSize: '1.15rem' }}>QS TEAM</Typography>
                    </Box>
                    <Box sx={{ p: 1.2, minHeight: 76 }}>
                      <Typography sx={{ fontFamily: serif, fontWeight: 700, fontSize: '1.15rem' }}>Request</Typography>
                      <Typography variant="caption" sx={{ fontFamily: serif, display: 'block', mt: 1 }}>
                        {activeRequest.reference}
                      </Typography>
                    </Box>
                  </Box>

                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 1400 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ ...headerCell, width: 70 }}>Line</TableCell>
                          <TableCell sx={{ ...headerCell, width: 80 }}>Type</TableCell>
                          <TableCell sx={{ ...headerCell, width: 90 }}>Ref.</TableCell>
                          <TableCell sx={{ ...headerCell, width: 90 }}>Sub Ref</TableCell>
                          <TableCell sx={{ ...headerCell, width: 540 }}>Item</TableCell>
                          <TableCell sx={{ ...headerCell, width: 90 }}>UOM</TableCell>
                          <TableCell sx={{ ...headerCell, width: 140 }} colSpan={3} align="center">
                            Current
                          </TableCell>
                          <TableCell sx={{ ...headerCell, width: 150 }} colSpan={3} align="center">
                            Initial
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={subHeaderCell}>Line</TableCell>
                          <TableCell sx={subHeaderCell}>Type</TableCell>
                          <TableCell sx={subHeaderCell}>Ref.</TableCell>
                          <TableCell sx={subHeaderCell}>Sub Ref</TableCell>
                          <TableCell sx={subHeaderCell}>Item</TableCell>
                          <TableCell sx={subHeaderCell}>UOM</TableCell>
                          <TableCell sx={subHeaderCell} align="right">
                            Qty.
                          </TableCell>
                          <TableCell sx={subHeaderCell} align="right">
                            Rate
                          </TableCell>
                          <TableCell sx={subHeaderCell} align="right">
                            Amount
                          </TableCell>
                          <TableCell sx={subHeaderCell} align="right">
                            Qty.
                          </TableCell>
                          <TableCell sx={subHeaderCell} align="right">
                            Rate
                          </TableCell>
                          <TableCell sx={subHeaderCell} align="right">
                            Value
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sheetRows.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell sx={bodyCell}>{line.line_no}</TableCell>
                            <TableCell sx={bodyCell}>{line.rowType}</TableCell>
                            <TableCell sx={bodyCell}>{line.ref}</TableCell>
                            <TableCell sx={bodyCell}>{line.subRef}</TableCell>
                            <TableCell sx={bodyCell}>{line.description}</TableCell>
                            <TableCell sx={bodyCell}>{line.uom ?? '—'}</TableCell>
                            <TableCell sx={bodyCell} align="right">
                              {line.currentQty.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell sx={bodyCell} align="right">
                              {line.currentRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell sx={bodyCell} align="right">
                              {line.currentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell sx={bodyCell} align="right">
                              {line.initialQty.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell sx={bodyCell} align="right">
                              {line.initialRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell sx={bodyCell} align="right">
                              {line.initialAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell sx={bodyCell} colSpan={8} align="right">
                            Variation
                          </TableCell>
                          <TableCell sx={bodyCell} align="right">
                            {requestTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell sx={bodyCell} align="right">—</TableCell>
                          <TableCell sx={bodyCell} align="right">—</TableCell>
                          <TableCell sx={bodyCell} align="right">—</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Box sx={{ borderTop: '1px solid #1f1f1f' }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #1f1f1f' }}>
                      <Box sx={{ p: 1, borderRight: '1px solid #1f1f1f' }}>
                        <Typography sx={{ fontFamily: serif, fontWeight: 700 }}>CONFIRMATION STATUS</Typography>
                        <Typography sx={{ fontFamily: serif }}>
                          {activeRequest.status}
                        </Typography>
                      </Box>
                      <Box sx={{ p: 1, borderRight: '1px solid #1f1f1f' }}>
                        <Typography sx={{ fontFamily: serif, fontWeight: 700 }}>TRACK ORDER STATUS</Typography>
                        <Typography sx={{ fontFamily: serif }}>Submitted to QS</Typography>
                      </Box>
                      <Box sx={{ p: 1 }}>
                        <Typography sx={{ fontFamily: serif, fontWeight: 700 }}>Remarks</Typography>
                        <Typography sx={{ fontFamily: serif }}>Variation request received</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Button variant="outlined">Received</Button>
                      <Button variant="outlined">Submitted</Button>
                      <Button
                        variant="contained"
                        disabled={sendToContracts.isPending}
                        onClick={() => sendToContracts.mutate(activeRequest.id)}
                      >
                        Send to Contracts to update in ERP
                      </Button>
                      <Button
                        component={RouterLink}
                        to={`/contracts/${projectId}/boq/${activeRequest.boq_version_id}/lines`}
                        variant="outlined"
                      >
                        Edit BOQ
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}
          </>
        )}
      </Paper>

      <Typography variant="h6">New comparison run</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ my: 2 }}>
        <TextField
          select
          size="small"
          label="Baseline BOQ"
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
          sx={{ minWidth: 260 }}
        >
          {locked.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.label} ({b.row_count_snapshot ?? 0} rows)
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Target BOQ"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          sx={{ minWidth: 260 }}
        >
          {locked.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          disabled={!baseline || !target || baseline === target}
          onClick={async () => {
            const r = await api<QsRun>(`/projects/${projectId}/qs/runs`, {
              method: 'POST',
              body: JSON.stringify({ baseline_boq_version_id: baseline, target_boq_version_id: target }),
            })
            setActiveRun(r.id)
            refetchRuns()
          }}
        >
          Create run
        </Button>
      </Stack>

      <Typography variant="h6">Runs</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Mail</TableCell>
            <TableCell>WO</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs?.map((r) => (
            <TableRow key={r.id}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.id}</TableCell>
              <TableCell>{r.status}</TableCell>
              <TableCell>{r.mail_confirmed ? 'yes' : 'no'}</TableCell>
              <TableCell>{r.work_order_received ? 'yes' : 'no'}</TableCell>
              <TableCell>
                <Button size="small" onClick={() => setActiveRun(r.id)}>
                  View variances
                </Button>
                {r.status === 'draft' && (
                  <Button
                    size="small"
                    onClick={async () => {
                      await api(`/projects/${projectId}/qs/runs/${r.id}/compare`, { method: 'POST' })
                      refetchRuns()
                    }}
                  >
                    Compare
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {activeRun && (
        <>
          <Typography variant="h6" sx={{ mt: 3 }}>
            Variances (first 500 lines)
          </Typography>
          <RunConfirmations projectId={projectId} runId={activeRun} onSaved={() => refetchRuns()} />
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>Line</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Variation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {variances?.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.line_no}</TableCell>
                  <TableCell>{v.description}</TableCell>
                  <TableCell align="right">{v.variation_amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Box>
  )
}

function parseLineRef(lineNo: string): { type: string; ref: string; subRef?: string } {
  const parts = lineNo.split(/[.-]/).map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 3) {
    return { type: parts[0], ref: parts[1], subRef: parts[2] }
  }
  if (parts.length === 2) {
    return { type: parts[0], ref: parts[1] }
  }
  if (lineNo.includes('/')) {
    const slashParts = lineNo.split('/').map((part) => part.trim()).filter(Boolean)
    if (slashParts.length >= 2) {
      return { type: slashParts[0], ref: slashParts[1], subRef: slashParts[2] }
    }
  }
  return { type: lineNo || '—', ref: lineNo || '—' }
}

const headerCell = {
  border: '1px solid #000',
  bgcolor: '#3f6db5',
  color: '#fff',
  fontFamily: serif,
  fontWeight: 700,
}

const subHeaderCell = {
  border: '1px solid #000',
  bgcolor: '#4f79c4',
  color: '#fff',
  fontFamily: serif,
  fontWeight: 700,
}

const bodyCell = {
  border: '1px solid #000',
  fontFamily: serif,
  fontSize: '0.9rem',
}

function RunConfirmations({
  projectId,
  runId,
  onSaved,
}: {
  projectId: string
  runId: string
  onSaved: () => void
}) {
  const [mail, setMail] = useState(false)
  const [wo, setWo] = useState(false)
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <FormControlLabel control={<Checkbox checked={mail} onChange={(e) => setMail(e.target.checked)} />} label="Mail confirmed" />
      <FormControlLabel
        control={<Checkbox checked={wo} onChange={(e) => setWo(e.target.checked)} />}
        label="Work order received"
      />
      <Button
        size="small"
        variant="outlined"
        onClick={async () => {
          await api(`/projects/${projectId}/qs/runs/${runId}/confirmations`, {
            method: 'POST',
            body: JSON.stringify({ mail_confirmed: mail, work_order_received: wo }),
          })
          onSaved()
        }}
      >
        Save confirmations
      </Button>
    </Stack>
  )
}
