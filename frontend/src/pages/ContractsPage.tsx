import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { api, apiUpload, downloadActivityCsv } from '../api/client'
import type { BoqVersion, ChangeOrder, ProjectDocument, Project, ErpJob, WorkOrder } from '../types'
import { CreateNewBoqForm } from './contracts/CreateNewBoqForm'
import type { CustomerApprovalStatus } from '../types'
import { formatIST } from '../utils/time'

type ContractsStep = 'menu' | 'create' | 'workspace'

function customerApprovalChip(status: CustomerApprovalStatus) {
  const cfg: Record<
    CustomerApprovalStatus,
    { label: string; color: 'default' | 'primary' | 'warning' | 'success' | 'error' | 'info' }
  > = {
    not_sent: { label: 'Not sent', color: 'default' },
    pending: { label: 'Awaiting client', color: 'warning' },
    approved: { label: 'Approved', color: 'success' },
    rejected: { label: 'Rejected', color: 'error' },
    changes_requested: { label: 'Changes requested', color: 'info' },
  }
  const { label, color } = cfg[status]
  return (
    <Chip
      size="small"
      label={label}
      color={color}
      variant={status === 'not_sent' ? 'outlined' : 'filled'}
    />
  )
}

export function ContractsPage() {
  const { projectId = '' } = useParams()
  const qc = useQueryClient()
  const [step, setStep] = useState<ContractsStep>('menu')

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
    enabled: !!projectId,
  })
  const { data: summary } = useQuery({
    queryKey: ['summary', projectId],
    queryFn: () =>
      api<{
        project: Project
        boq_versions_count: number
        latest_document_status: string | null
        open_erp_jobs: number
      }>(`/projects/${projectId}/summary`),
    enabled: !!projectId && step === 'workspace',
  })
  const { data: boqVersions, refetch: refetchBoq } = useQuery({
    queryKey: ['boq', projectId],
    queryFn: () => api<BoqVersion[]>(`/projects/${projectId}/boq-versions`),
    enabled: !!projectId && step === 'workspace',
  })
  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ['docs', projectId],
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`),
    enabled: !!projectId && step === 'workspace',
  })
  const { data: erpJobs, refetch: refetchErp } = useQuery({
    queryKey: ['erp', projectId],
    queryFn: () => api<ErpJob[]>(`/projects/${projectId}/erp-jobs`),
    enabled: !!projectId && step === 'workspace',
  })
  const { data: workOrders, refetch: refetchWo } = useQuery({
    queryKey: ['wo', projectId],
    queryFn: () => api<WorkOrder[]>(`/projects/${projectId}/work-orders`),
    enabled: !!projectId && step === 'workspace',
  })
  const { data: n8nBoq } = useQuery({
    queryKey: ['integrations', 'n8n-boq'],
    queryFn: () =>
      api<{
        n8n_boq_callback_url: string
        n8n_boq_callback_configured: boolean
        webhook_secret_header: string
        public_app_url: string | null
      }>('/integrations/n8n-boq'),
    enabled: !!projectId && step === 'workspace',
  })
  const { data: additionRequests } = useQuery({
    queryKey: ['contracts-addition-requests', projectId],
    queryFn: () => api<ChangeOrder[]>(`/projects/${projectId}/contracts/new-item-requests`),
    enabled: !!projectId && step === 'workspace',
  })

  const erpUpdateJobs = (erpJobs ?? []).filter(
    (job) => job.job_type === 'update_boq' || job.job_type === 'record_variation',
  )

  const sendToErp = useMutation({
    mutationFn: async (version: BoqVersion) =>
      api(`/projects/${projectId}/erp-jobs`, {
        method: 'POST',
        body: JSON.stringify({
          job_type: 'update_boq',
          payload: {
            boq_version_id: version.id,
            boq_label: version.label,
            boq_file: version.source_filename,
            row_count_snapshot: version.row_count_snapshot,
          },
        }),
      }),
    onSuccess: () => {
      refetchErp()
      qc.invalidateQueries({ queryKey: ['summary', projectId] })
    },
  })

  const importMut = useMutation({
    mutationFn: async ({ versionId, file }: { versionId: string; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      return apiUpload(`/boq-versions/${versionId}/import`, fd)
    },
    onSuccess: () => {
      refetchBoq()
      qc.invalidateQueries({ queryKey: ['summary', projectId] })
    },
  })

  if (step === 'menu') {
    return (
      <Box sx={{ p: 3, maxWidth: 560, mx: 'auto' }}>
        <Typography variant="h5" sx={{ mb: 1, fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 600 }}>
          Contracts — {project?.name ?? '…'}
        </Typography>
        <Typography
          variant="h4"
          sx={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontWeight: 700,
            textAlign: 'right',
            mb: 4,
            letterSpacing: 0.5,
          }}
        >
          CONTRACTS TEAM
        </Typography>
        <Stack spacing={2}>
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={() => setStep('create')}
            sx={{ py: 2, fontSize: '1.05rem' }}
          >
            Create new BOQ
          </Button>
          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={() => setStep('workspace')}
            sx={{ py: 2, fontSize: '1.05rem' }}
          >
            Edit existing BOQ
          </Button>
          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={() => setStep('workspace')}
            sx={{ py: 2, fontSize: '1.05rem' }}
          >
            ERP updates
          </Button>
        </Stack>
      </Box>
    )
  }

  if (step === 'create') {
    return (
      <CreateNewBoqForm
        projectId={projectId}
        projectName={project?.name ?? ''}
        onBack={() => setStep('menu')}
        onSuccess={() => {
          setStep('workspace')
          qc.invalidateQueries({ queryKey: ['boq', projectId] })
          qc.invalidateQueries({ queryKey: ['summary', projectId] })
        }}
      />
    )
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Button size="small" onClick={() => setStep('menu')} sx={{ mb: 2 }}>
        ← BOQ menu
      </Button>
      <Typography variant="h4" gutterBottom>
        Contracts — {project?.name}
      </Typography>
      {summary && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Chip label={`BOQ versions: ${summary.boq_versions_count}`} />
          <Chip label={`Latest doc: ${summary.latest_document_status ?? '—'}`} />
          <Chip label={`Open ERP jobs: ${summary.open_erp_jobs}`} color="warning" variant="outlined" />
        </Stack>
      )}

      {step === 'workspace' && (
        <Section title="ERP updates">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            BOQs sent by Contracts and variation requests sent from QS are shown here.
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>File</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>External ref</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!erpUpdateJobs.length ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary">No BOQ updates sent to ERP yet.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                erpUpdateJobs.map((job) => {
                  const payload = job.payload as Record<string, unknown> | null | undefined
                  const source = job.job_type === 'record_variation' ? 'QS variation request' : 'Contracts BOQ update'
                  const reference =
                    job.job_type === 'record_variation'
                      ? (typeof payload?.change_order_reference === 'string' ? payload.change_order_reference : '—')
                      : (typeof payload?.boq_label === 'string' ? payload.boq_label : '—')
                  const boqFile = typeof payload?.boq_file === 'string' ? payload.boq_file : '—'
                  return (
                    <TableRow key={job.id}>
                      <TableCell>{source}</TableCell>
                      <TableCell>{reference}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{boqFile}</TableCell>
                      <TableCell>{job.status}</TableCell>
                      <TableCell>{job.external_ref ?? '—'}</TableCell>
                      <TableCell>{formatIST(job.created_at)}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Section>
      )}

      {step === 'workspace' && (
        <Section title="New Items Addition Requests">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Requests routed from Change Orders for Contracts review.
          </Typography>
          <Button variant="contained" sx={{ mb: 2 }}>
            New Items Addition Requests
          </Button>
          {!additionRequests?.length ? (
            <Typography color="text.secondary">No addition requests yet.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>BOQ</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {additionRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>{req.reference}</TableCell>
                    <TableCell>{req.boq_version_id ?? '—'}</TableCell>
                    <TableCell>{req.status}</TableCell>
                    <TableCell>{formatIST(req.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}

      {n8nBoq && (
        <Alert severity={n8nBoq.n8n_boq_callback_configured ? 'info' : 'warning'} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            n8n — BOQ approval callback
          </Typography>
          {!n8nBoq.n8n_boq_callback_configured ? (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Set <code>N8N_BOQ_CALLBACK_URL</code> on the API server to your <strong>public</strong> HTTPS URL (e.g.{' '}
              <code>https://api.your-domain.com/api/approval</code>). Hosted n8n cannot call localhost. Optionally set{' '}
              <code>PUBLIC_APP_URL</code> to your API base if you prefer the callback to be derived as{' '}
              <code>PUBLIC_APP_URL + /api/approval</code>.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Configure your n8n HTTP node to POST to this URL when the customer decision is known. Send header{' '}
                <strong>{n8nBoq.webhook_secret_header}</strong> with the same value as{' '}
                <code>CUSTOMER_APPROVAL_WEBHOOK_SECRET</code> on the API.
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 1,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '0.85rem',
                  wordBreak: 'break-all',
                }}
              >
                {n8nBoq.n8n_boq_callback_url}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    void navigator.clipboard.writeText(n8nBoq.n8n_boq_callback_url)
                  }}
                >
                  Copy URL
                </Button>
              </Box>
            </>
          )}
        </Alert>
      )}

      <Section title="BOQ versions">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Import additional lines on a draft version, lock when ready for QS, or{' '}
          <Link component="button" type="button" onClick={() => setStep('create')}>
            create a new BOQ
          </Link>
          .
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Label</TableCell>
              <TableCell>Project (form)</TableCell>
              <TableCell>Cluster head</TableCell>
              <TableCell>Client</TableCell>
              <TableCell>File</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Client approval</TableCell>
              <TableCell>Rows</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {boqVersions?.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{v.label}</TableCell>
                <TableCell>{v.form_project_name ?? '—'}</TableCell>
                <TableCell>{v.cluster_head ?? '—'}</TableCell>
                <TableCell>{v.client_name ?? '—'}</TableCell>
                <TableCell sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.source_filename ?? '—'}
                </TableCell>
                <TableCell>{v.source}</TableCell>
                <TableCell>{v.status}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
                    {customerApprovalChip(v.customer_approval_status)}
                    {v.customer_approval_note ? (
                      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 160 }} noWrap title={v.customer_approval_note}>
                        {v.customer_approval_note}
                      </Typography>
                    ) : null}
                  </Box>
                </TableCell>
                <TableCell>{v.row_count_snapshot ?? '—'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
                    {v.status === 'draft' && (
                      <>
                        <Button component="label" size="small">
                          Import XLSX
                          <input
                            type="file"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) importMut.mutate({ versionId: v.id, file: f })
                            }}
                          />
                        </Button>
                        <Button
                          size="small"
                          onClick={async () => {
                            await api(`/boq-versions/${v.id}/lock`, { method: 'POST' })
                            refetchBoq()
                          }}
                        >
                          Lock
                        </Button>
                        {v.customer_approval_status === 'not_sent' && (v.row_count_snapshot ?? 0) > 0 && (
                          <Button
                            size="small"
                            onClick={async () => {
                              await api(`/projects/${projectId}/boq-versions/${v.id}/submit-for-customer-approval`, {
                                method: 'POST',
                              })
                              refetchBoq()
                            }}
                          >
                            Submit for client approval
                          </Button>
                        )}
                      </>
                    )}
                    {v.customer_approval_status === 'pending' && (
                      <Button
                        size="small"
                        color="success"
                        variant="contained"
                        onClick={async () => {
                          await api(`/boq-versions/${v.id}/poc-approve-client`, {
                            method: 'POST',
                          })
                          refetchBoq()
                          qc.invalidateQueries({ queryKey: ['summary', projectId] })
                        }}
                      >
                        Approve (POC)
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => sendToErp.mutate(v)}
                      disabled={sendToErp.isPending}
                    >
                      Send to ERP
                    </Button>
                    <Link component={RouterLink} to={`/contracts/${projectId}/boq/${v.id}/lines`}>
                      View lines
                    </Link>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {importMut.isError && <Alert severity="error">{(importMut.error as Error).message}</Alert>}
      </Section>

      <Divider sx={{ my: 3 }} />

      <Section title="Documents">
        <DocForm projectId={projectId} onCreated={() => refetchDocs()} />
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Number</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documents?.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.document_number}</TableCell>
                <TableCell>{d.title}</TableCell>
                <TableCell>{d.status}</TableCell>
                <TableCell>
                  {d.status === 'draft' && (
                    <Button
                      size="small"
                      onClick={async () => {
                        await api(`/projects/${projectId}/documents/${d.id}/submit`, { method: 'POST' })
                        refetchDocs()
                      }}
                    >
                      Submit
                    </Button>
                  )}
                  {d.status === 'submitted' && (
                    <>
                      <Button
                        size="small"
                        onClick={async () => {
                          await api(`/projects/${projectId}/documents/${d.id}/approve`, {
                            method: 'POST',
                            body: JSON.stringify({}),
                          })
                          refetchDocs()
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        color="warning"
                        onClick={async () => {
                          await api(`/projects/${projectId}/documents/${d.id}/reject`, {
                            method: 'POST',
                            body: JSON.stringify({ reason: 'Rejected' }),
                          })
                          refetchDocs()
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {d.status === 'approved' && (
                    <Button
                      size="small"
                      onClick={async () => {
                        await api(`/projects/${projectId}/documents/${d.id}/intimate`, { method: 'POST' })
                        refetchDocs()
                      }}
                    >
                      Intimate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Divider sx={{ my: 3 }} />

      <Section title="ERP jobs">
        <Button
          sx={{ mb: 1 }}
          variant="outlined"
          size="small"
          onClick={async () => {
            await api(`/projects/${projectId}/erp-jobs`, {
              method: 'POST',
              body: JSON.stringify({ job_type: 'update_boq', payload: { note: 'manual sync' } }),
            })
            refetchErp()
            qc.invalidateQueries({ queryKey: ['summary', projectId] })
          }}
        >
          Enqueue BOQ update (mock)
        </Button>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>External ref</TableCell>
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {erpJobs?.map((j) => (
              <TableRow key={j.id}>
                <TableCell>{j.job_type}</TableCell>
                <TableCell>{j.status}</TableCell>
                <TableCell>{j.external_ref ?? '—'}</TableCell>
                <TableCell>{j.error_message ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Divider sx={{ my: 3 }} />

      <Section title="Contracts work orders">
        <WoForm projectId={projectId} onCreated={() => refetchWo()} />
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Reference</TableCell>
              <TableCell>Mail</TableCell>
              <TableCell>WO received</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workOrders?.map((w) => (
              <TableRow key={w.id}>
                <TableCell>{w.reference}</TableCell>
                <TableCell>{w.mail_received ? 'yes' : 'no'}</TableCell>
                <TableCell>{w.work_order_received ? 'yes' : 'no'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Divider sx={{ my: 3 }} />

      <Section title="Audit">
        <Button size="small" onClick={() => downloadActivityCsv(projectId, `activity-${projectId}.csv`)}>
          Export activity CSV
        </Button>
      </Section>
    </Box>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

function WoForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [ref, setRef] = useState('WO-001')
  return (
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
      <TextField size="small" label="Reference" value={ref} onChange={(e) => setRef(e.target.value)} />
      <Button
        variant="outlined"
        size="small"
        onClick={async () => {
          await api(`/projects/${projectId}/work-orders`, {
            method: 'POST',
            body: JSON.stringify({ reference: ref }),
          })
          onCreated()
        }}
      >
        Add work order
      </Button>
    </Stack>
  )
}

function DocForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [num, setNum] = useState('DOC-001')
  const [title, setTitle] = useState('Document')
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <TextField size="small" label="Document number" value={num} onChange={(e) => setNum(e.target.value)} />
      <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button
        variant="outlined"
        onClick={async () => {
          await api(`/projects/${projectId}/documents`, {
            method: 'POST',
            body: JSON.stringify({ document_number: num, title }),
          })
          onCreated()
        }}
      >
        Create document
      </Button>
    </Stack>
  )
}
