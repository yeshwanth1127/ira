import type { CSSProperties } from 'react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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
import { api, apiUpload } from '../api/client'
import type { BoqVersion, DesignPackage, DocumentAttachment, Project, ProjectDocument } from '../types'

const serif = `'Georgia', 'Times New Roman', serif`

const headYellow = {
  bgcolor: '#ffeb3b',
  border: '2px solid #000',
  fontWeight: 700,
  fontFamily: serif,
  fontSize: '0.85rem',
}

const headBlue = {
  bgcolor: '#90caf9',
  border: '2px solid #000',
  fontWeight: 700,
  fontFamily: serif,
  fontSize: '0.85rem',
}

const cell = {
  border: '2px solid #000',
  fontFamily: serif,
  fontSize: '0.9rem',
  verticalAlign: 'top',
}

/** Must not use display:none — browsers often block the file picker for fully hidden inputs. */
const fileInputScreenReaderOnly: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
}

function approvalLabel(approved: boolean) {
  return approved ? 'Approved' : 'Pending'
}

export function DesignPage() {
  const { projectId = '' } = useParams()
  const qc = useQueryClient()
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
    enabled: !!projectId,
  })
  const { data: documents } = useQuery({
    queryKey: ['docs', projectId],
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`),
    enabled: !!projectId,
  })
  const { data: packages, refetch: refetchPkg } = useQuery({
    queryKey: ['design-pkg', projectId],
    queryFn: () => api<DesignPackage[]>(`/projects/${projectId}/design/packages`),
    enabled: !!projectId,
  })
  const { data: boqVersions } = useQuery({
    queryKey: ['boq', projectId],
    queryFn: () => api<BoqVersion[]>(`/projects/${projectId}/boq-versions`),
    enabled: !!projectId,
  })

  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [selectedPkgId, setSelectedPkgId] = useState<string>('')

  useEffect(() => {
    if (!documents?.length) return
    setSelectedDocId((cur) => {
      if (cur && documents.some((d) => d.id === cur)) return cur
      return documents[0].id
    })
  }, [documents])

  useEffect(() => {
    if (packages?.length && !selectedPkgId) {
      setSelectedPkgId(packages[0].id)
    }
  }, [packages, selectedPkgId])

  const { data: attachments } = useQuery({
    queryKey: ['doc-attachments', projectId, selectedDocId],
    queryFn: () => api<DocumentAttachment[]>(`/projects/${projectId}/documents/${selectedDocId}/attachments`),
    enabled: !!projectId && !!selectedDocId,
  })

  const calcAttachments = useMemo(
    () => attachments?.filter((a) => a.attachment_slot === 'calculation') ?? [],
    [attachments],
  )
  const shopAttachments = useMemo(
    () => attachments?.filter((a) => a.attachment_slot === 'shop_drawing') ?? [],
    [attachments],
  )
  const legacyAttachments = useMemo(
    () => attachments?.filter((a) => !a.attachment_slot) ?? [],
    [attachments],
  )

  const uploadAttachment = useMutation({
    mutationFn: async ({ file, slot }: { file: File; slot: 'calculation' | 'shop_drawing' }) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('attachment_slot', slot)
      return apiUpload<DocumentAttachment>(
        `/projects/${projectId}/documents/${selectedDocId}/attachments`,
        fd,
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doc-attachments', projectId, selectedDocId] })
    },
  })

  const selectedDoc = useMemo(
    () => documents?.find((d) => d.id === selectedDocId),
    [documents, selectedDocId],
  )

  const activePkg = useMemo(
    () => packages?.find((p) => p.id === selectedPkgId) ?? packages?.[0],
    [packages, selectedPkgId],
  )

  const approvedBoq = useMemo(() => {
    const list = boqVersions?.filter((b) => b.customer_approval_status === 'approved') ?? []
    return [...list].sort((a, b) =>
      (b.customer_approval_decided_at ?? b.created_at).localeCompare(
        a.customer_approval_decided_at ?? a.created_at,
      ),
    )[0]
  }, [boqVersions])

  const [label, setLabel] = useState('SD / SD2')
  const calcFileInputId = useId()
  const shopFileInputId = useId()

  const createProjectDocument = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error('Project not loaded')
      const safeCode = project.code.replace(/[^\w-]/g, '') || 'PRJ'
      const document_number = `DOC-${safeCode}-${crypto.randomUUID().slice(0, 8)}`
      const title = project.name.trim() || 'Project document'
      return api<ProjectDocument>(`/projects/${projectId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ document_number, title }),
      })
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['docs', projectId] })
      setSelectedDocId(doc.id)
    },
  })

  const hasNoDocuments = documents && documents.length === 0

  const [descDraft, setDescDraft] = useState('')
  const [woDraft, setWoDraft] = useState('')

  useEffect(() => {
    const d = documents?.find((x) => x.id === selectedDocId)
    if (!d) {
      setDescDraft('')
      setWoDraft('')
      return
    }
    setDescDraft(d.title)
    const stored = (d.work_order_heading || '').trim()
    const fallback = (approvedBoq?.form_project_name || approvedBoq?.label || '').trim()
    setWoDraft(stored || fallback)
  }, [selectedDocId, documents, approvedBoq?.form_project_name, approvedBoq?.label, approvedBoq?.id])

  const patchDocument = useMutation({
    mutationFn: async (body: { title?: string; work_order_heading?: string }) => {
      if (!selectedDocId) throw new Error('No document selected')
      return api<ProjectDocument>(`/projects/${projectId}/documents/${selectedDocId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['docs', projectId] })
    },
  })

  function effectiveWorkOrder(doc: ProjectDocument | undefined): string {
    if (!doc) return ''
    const s = (doc.work_order_heading || '').trim()
    if (s) return s
    return (approvedBoq?.form_project_name || approvedBoq?.label || '').trim()
  }

  function flushDescription() {
    if (!selectedDoc) return
    const next = descDraft.trim()
    if (!next) {
      setDescDraft(selectedDoc.title)
      return
    }
    if (next === selectedDoc.title) return
    patchDocument.mutate({ title: next })
  }

  function flushWorkOrder() {
    if (!selectedDoc) return
    const next = woDraft.trim()
    if (next === effectiveWorkOrder(selectedDoc)) return
    patchDocument.mutate({ work_order_heading: next })
  }

  const fieldInCellSx = {
    '& .MuiOutlinedInput-root': {
      fontFamily: serif,
      fontSize: '0.9rem',
      bgcolor: '#fff',
    },
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography
        variant="h4"
        sx={{
          textAlign: 'center',
          fontFamily: serif,
          fontWeight: 700,
          letterSpacing: 1,
          mb: 3,
        }}
      >
        DESIGN TEAM
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2, alignItems: 'flex-start' }}>
        {hasNoDocuments && project ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, py: 0.5 }}>
            <Button
              variant="contained"
              disabled={createProjectDocument.isPending}
              onClick={() => createProjectDocument.mutate()}
            >
              {createProjectDocument.isPending ? 'Creating…' : 'Create & link document'}
            </Button>
            {createProjectDocument.isError && (
              <Typography color="error" variant="caption">
                {(createProjectDocument.error as Error).message}
              </Typography>
            )}
          </Box>
        ) : (
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel id="design-doc-select">Project document</InputLabel>
            <Select
              labelId="design-doc-select"
              label="Project document"
              value={selectedDocId || ''}
              onChange={(e) => setSelectedDocId(e.target.value)}
            >
              {(documents ?? []).map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.document_number} — {d.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="design-pkg-select">Design package</InputLabel>
          <Select
            labelId="design-pkg-select"
            label="Design package"
            value={selectedPkgId || ''}
            onChange={(e) => setSelectedPkgId(e.target.value)}
          >
            {(packages ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {selectedDoc?.quantity_variation_submitted_at && (
        <Typography variant="body2" sx={{ fontFamily: serif, color: 'success.dark', mb: 1, fontWeight: 600 }}>
          Quantity variation submitted to QS team
        </Typography>
      )}

      {selectedDoc && (
        <Box sx={{ mb: 1 }}>
          <Typography
            component="div"
            sx={{
              display: 'inline-block',
              bgcolor: '#fff9c4',
              border: '2px solid #000',
              px: 2,
              py: 1,
              fontFamily: serif,
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            {selectedDoc.document_number}
          </Typography>
        </Box>
      )}

      <Table size="small" sx={{ borderCollapse: 'collapse', mb: 2, maxWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={headYellow}>Project Name</TableCell>
            <TableCell sx={headYellow}>Description</TableCell>
            <TableCell sx={headYellow}>Work order heading</TableCell>
            <TableCell sx={headBlue}>BOQ reference (if needed)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell sx={cell}>{project?.name ?? '—'}</TableCell>
            <TableCell sx={cell}>
              {selectedDoc ? (
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={flushDescription}
                  disabled={patchDocument.isPending}
                  sx={fieldInCellSx}
                />
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell sx={cell}>
              {selectedDoc ? (
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  value={woDraft}
                  onChange={(e) => setWoDraft(e.target.value)}
                  onBlur={flushWorkOrder}
                  disabled={patchDocument.isPending}
                  sx={fieldInCellSx}
                />
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell sx={cell}>{approvedBoq?.label ?? '—'}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <Typography sx={{ ...headYellow, display: 'inline-block', mb: 0, px: 1.5, py: 0.75 }}>
        Document type
      </Typography>
      <Table size="small" sx={{ borderCollapse: 'collapse', mb: 2, maxWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={headYellow} width="50%">
              Calculation
            </TableCell>
            <TableCell sx={headYellow} width="50%">
              Shop drawing
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell sx={cell}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {activePkg ? `Package: ${activePkg.label}` : '—'}
              </Typography>
              <Typography variant="caption" color="error" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                Attachment
              </Typography>
              <input
                id={calcFileInputId}
                type="file"
                accept="*/*"
                style={fileInputScreenReaderOnly}
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f && selectedDocId) uploadAttachment.mutate({ file: f, slot: 'calculation' })
                  e.target.value = ''
                }}
              />
              <Box
                component="label"
                htmlFor={calcFileInputId}
                onClick={(e) => {
                  if (!selectedDocId || uploadAttachment.isPending) e.preventDefault()
                }}
                sx={{
                  display: 'inline-block',
                  mb: 0.5,
                  cursor: selectedDocId && !uploadAttachment.isPending ? 'pointer' : 'not-allowed',
                  opacity: selectedDocId ? 1 : 0.65,
                }}
              >
                <Button component="span" size="small" variant="outlined" tabIndex={-1}>
                  Upload calculation file
                </Button>
              </Box>
              {!selectedDocId && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                  Select a project document above to enable upload.
                </Typography>
              )}
              {calcAttachments.length ? (
                <Stack spacing={0.5}>
                  {calcAttachments.map((a) => (
                    <Typography key={a.id} variant="caption" sx={{ wordBreak: 'break-all' }}>
                      {a.filename}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  No calculation files yet.
                </Typography>
              )}
            </TableCell>
            <TableCell sx={cell}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {activePkg ? `Package: ${activePkg.label}` : '—'}
              </Typography>
              <Typography variant="caption" color="error" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                Attachment
              </Typography>
              <input
                id={shopFileInputId}
                type="file"
                accept="*/*"
                style={fileInputScreenReaderOnly}
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f && selectedDocId) uploadAttachment.mutate({ file: f, slot: 'shop_drawing' })
                  e.target.value = ''
                }}
              />
              <Box
                component="label"
                htmlFor={shopFileInputId}
                onClick={(e) => {
                  if (!selectedDocId || uploadAttachment.isPending) e.preventDefault()
                }}
                sx={{
                  display: 'inline-block',
                  mb: 0.5,
                  cursor: selectedDocId && !uploadAttachment.isPending ? 'pointer' : 'not-allowed',
                  opacity: selectedDocId ? 1 : 0.65,
                }}
              >
                <Button component="span" size="small" variant="outlined" tabIndex={-1}>
                  Upload shop drawing file
                </Button>
              </Box>
              {!selectedDocId && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                  Select a project document above to enable upload.
                </Typography>
              )}
              {shopAttachments.length ? (
                <Stack spacing={0.5}>
                  {shopAttachments.map((a) => (
                    <Typography key={a.id} variant="caption" sx={{ wordBreak: 'break-all' }}>
                      {a.filename}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  No shop drawing files yet.
                </Typography>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {legacyAttachments.length > 0 && (
        <Alert severity="info" sx={{ mb: 2, maxWidth: 900 }}>
          <Typography variant="subtitle2">Other attachments (uploaded before category or from Contracts)</Typography>
          <Typography variant="body2" component="div">
            {legacyAttachments.map((a) => (
              <span key={a.id} style={{ display: 'block' }}>
                {a.filename}
              </span>
            ))}
          </Typography>
        </Alert>
      )}

      {uploadAttachment.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(uploadAttachment.error as Error).message}
        </Alert>
      )}

      <Table size="small" sx={{ borderCollapse: 'collapse', mb: 4, maxWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={headYellow}>SHOP DRAWING STATUS</TableCell>
            <TableCell sx={headYellow}>CALCULATION STATUS</TableCell>
            <TableCell sx={headYellow}>REMARK</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cell, bgcolor: '#e8f5e9' }}>
              {activePkg ? approvalLabel(activePkg.shop_drawing_approved) : '—'}
            </TableCell>
            <TableCell sx={{ ...cell, bgcolor: '#e8f5e9' }}>
              {activePkg ? approvalLabel(activePkg.calculation_approved) : '—'}
            </TableCell>
            <TableCell sx={{ ...cell, bgcolor: '#c8e6c9' }}>
              <Button
                id="design-change-orders"
                component={RouterLink}
                to={
                  selectedDocId
                    ? `/design/${projectId}/change-order/new?doc=${selectedDocId}`
                    : `/design/${projectId}/change-order/new`
                }
                size="small"
                variant="contained"
                color="success"
                disabled={!selectedDocId}
                sx={{ textTransform: 'none', fontFamily: serif }}
              >
                Create change order
              </Button>
              <Button
                component={RouterLink}
                to="/design/change-orders"
                size="small"
                variant="outlined"
                sx={{ ml: 1, textTransform: 'none', fontFamily: serif }}
              >
                Design change orders
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {!documents?.length && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No project documents yet. Contracts creates documents; values above will fill in once a document exists.
        </Typography>
      )}
      {!approvedBoq && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          BOQ reference fills after a BOQ is client-approved on Contracts. You can still edit work order heading on the document above.
        </Typography>
      )}

      <Typography variant="h6" sx={{ fontFamily: serif }}>
        Design packages
      </Typography>
      <Stack direction="row" spacing={2} sx={{ my: 2 }}>
        <TextField size="small" label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button
          variant="contained"
          onClick={async () => {
            await api(`/projects/${projectId}/design/packages`, {
              method: 'POST',
              body: JSON.stringify({ label }),
            })
            refetchPkg()
          }}
        >
          Create
        </Button>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Label</TableCell>
            <TableCell>Drawing</TableCell>
            <TableCell>Calc</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {packages?.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.label}</TableCell>
              <TableCell>{p.shop_drawing_approved ? 'yes' : 'no'}</TableCell>
              <TableCell>{p.calculation_approved ? 'yes' : 'no'}</TableCell>
              <TableCell>{p.status}</TableCell>
              <TableCell>
                <Button
                  size="small"
                  onClick={async () => {
                    await api(`/projects/${projectId}/design/packages/${p.id}/submit-review`, {
                      method: 'POST',
                    })
                    refetchPkg()
                  }}
                >
                  Submit review
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    await api(`/projects/${projectId}/design/packages/${p.id}/approve-drawings`, {
                      method: 'POST',
                      body: JSON.stringify({ approved: true }),
                    })
                    refetchPkg()
                  }}
                >
                  Approve drawings
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    await api(`/projects/${projectId}/design/packages/${p.id}/approve-calculations`, {
                      method: 'POST',
                      body: JSON.stringify({ approved: true }),
                    })
                    refetchPkg()
                  }}
                >
                  Approve calcs
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
