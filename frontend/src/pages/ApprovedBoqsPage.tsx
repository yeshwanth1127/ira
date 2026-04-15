import { useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { api, apiUpload } from '../api/client'
import type { ApprovedBoqProjectGroup, BoqVersion, DocumentAttachment, ProjectDocument } from '../types'
import { formatIST } from '../utils/time'

const head = {
  bgcolor: '#f3f4f6',
  fontWeight: 700,
  border: '1px solid #d1d5db',
}

const cell = {
  border: '1px solid #d1d5db',
  verticalAlign: 'top',
}

export function ApprovedBoqsPage() {
  const nav = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['approved-boqs'],
    queryFn: () => api<ApprovedBoqProjectGroup[]>('/projects/approved-boqs'),
  })

  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [expandedVersionId, setExpandedVersionId] = useState('')

  const selectedGroup = useMemo(() => {
    const groups = data ?? []
    if (!groups.length) return undefined
    if (selectedProjectId) {
      const found = groups.find((g) => g.project.id === selectedProjectId)
      if (found) return found
    }
    return groups[0]
  }, [data, selectedProjectId])

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading approved BOQs…</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Approved BOQ's
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2.5 }}>
        Grouped by project with version history control.
      </Typography>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '320px 1fr' },
          gap: 2,
        }}
      >
        <Paper sx={{ p: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Projects
          </Typography>
          <Stack spacing={1}>
            {(data ?? []).map((g) => {
              const active = g.project.id === selectedGroup?.project.id
              return (
                <Box
                  key={g.project.id}
                  onClick={() => {
                    setSelectedProjectId(g.project.id)
                    setExpandedVersionId('')
                  }}
                  sx={{
                    p: 1.25,
                    border: '1px solid',
                    borderColor: active ? 'primary.main' : '#e5e7eb',
                    borderRadius: 2,
                    cursor: 'pointer',
                  }}
                >
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    {g.project.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {g.versions.length} approved version(s)
                  </Typography>
                </Box>
              )
            })}
            {!data?.length && (
              <Typography color="text.secondary">No approved BOQs available yet.</Typography>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          {selectedGroup ? (
            <ApprovedBoqDetail
              projectId={selectedGroup.project.id}
              projectName={selectedGroup.project.name}
              allVersions={selectedGroup.versions}
              expandedVersionId={expandedVersionId}
              onExpandedChange={setExpandedVersionId}
              onCreateChangeOrder={(versionId) => nav(`/change-orders/${selectedGroup.project.id}?version=${versionId}`)}
            />
          ) : (
            <Typography color="text.secondary">Select a project to view BOQ details.</Typography>
          )}
        </Paper>
      </Box>
    </Box>
  )
}

function ApprovedBoqDetail({
  projectId,
  projectName,
  allVersions,
  expandedVersionId,
  onExpandedChange,
  onCreateChangeOrder,
}: {
  projectId: string
  projectName: string
  allVersions: BoqVersion[]
  expandedVersionId: string
  onExpandedChange: (id: string) => void
  onCreateChangeOrder: (versionId: string) => void
}) {
  const { data: documents } = useQuery({
    queryKey: ['docs', projectId],
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`),
    enabled: !!projectId,
  })

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Design Team Handoff
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {projectName}
        </Typography>
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Version Control (click to expand)
      </Typography>
      <Stack spacing={1.5}>
        {allVersions.map((version) => (
          <VersionAccordion
            key={version.id}
            projectId={projectId}
            projectName={projectName}
            version={version}
            documents={documents ?? []}
            expanded={expandedVersionId === version.id}
            onExpandedChange={(expanded) => onExpandedChange(expanded ? version.id : '')}
            onCreateChangeOrder={() => onCreateChangeOrder(version.id)}
          />
        ))}
      </Stack>
    </>
  )
}

function VersionAccordion({
  projectId,
  projectName,
  version,
  documents,
  expanded,
  onExpandedChange,
  onCreateChangeOrder,
}: {
  projectId: string
  projectName: string
  version: BoqVersion
  documents: ProjectDocument[]
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onCreateChangeOrder: () => void
}) {
  const qc = useQueryClient()
  const calcInputId = useId()
  const shopInputId = useId()
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [workOrderDraft, setWorkOrderDraft] = useState('')
  const [calcUploads, setCalcUploads] = useState<DocumentAttachment[]>([])
  const [shopUploads, setShopUploads] = useState<DocumentAttachment[]>([])

  const linkedDoc = useMemo(() => {
    const heading = (version.form_project_name || version.label || '').trim()
    return (
      documents.find((d) => (d.work_order_heading || '').trim() === heading) ||
      documents.find((d) => d.title.trim() === heading)
    )
  }, [documents, version.form_project_name, version.label])

  useEffect(() => {
    if (!linkedDoc?.id) return
    setDescriptionDraft(linkedDoc.title)
    setWorkOrderDraft((linkedDoc.work_order_heading || version.form_project_name || version.label || '').trim())
  }, [linkedDoc?.id, linkedDoc?.title, linkedDoc?.work_order_heading, version.form_project_name, version.label])

  const patchDocument = useMutation({
    mutationFn: async (body: { title?: string; work_order_heading?: string }) => {
      if (!linkedDoc?.id) throw new Error('No linked document found')
      return api<ProjectDocument>(`/projects/${projectId}/documents/${linkedDoc.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['docs', projectId, linkedDoc?.id] })
      void qc.invalidateQueries({ queryKey: ['docs', projectId] })
    },
  })

  function flushDescription() {
    if (!linkedDoc?.id) return
    const next = descriptionDraft.trim()
    if (!next || next === linkedDoc.title) return
    patchDocument.mutate({ title: next })
  }

  function flushWorkOrder() {
    if (!linkedDoc?.id) return
    const next = workOrderDraft.trim()
    const current = (linkedDoc.work_order_heading || '').trim() || (version.form_project_name || version.label || '').trim()
    if (!next || next === current) return
    patchDocument.mutate({ work_order_heading: next })
  }

  const uploadAttachment = useMutation({
    mutationFn: async ({ file, slot }: { file: File; slot: 'calculation' | 'shop_drawing' }) => {
      if (!linkedDoc?.id) throw new Error('No linked document found')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('attachment_slot', slot)
      return apiUpload<DocumentAttachment>(
        `/projects/${projectId}/documents/${linkedDoc.id}/attachments`,
        fd,
      )
    },
    onSuccess: (att, vars) => {
      if (vars.slot === 'calculation') {
        setCalcUploads((prev) => [att, ...prev])
      } else {
        setShopUploads((prev) => [att, ...prev])
      }
      void qc.invalidateQueries({ queryKey: ['doc-attachments', projectId, linkedDoc?.id] })
    },
  })

  const calcAttachments = calcUploads
  const shopAttachments = shopUploads

  function downloadUrl(attId: string): string {
    return `/api/projects/${projectId}/documents/${linkedDoc?.id}/attachments/${attId}/download`
  }

  return (
    <Accordion expanded={expanded} onChange={(_, ex) => onExpandedChange(ex)}>
      <AccordionSummary expandIcon={<span>▾</span>}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: '100%' }}>
          <Typography sx={{ fontWeight: 700 }}>{version.label}</Typography>
          <Typography variant="caption" color="text.secondary">
            Approved at {formatIST(version.customer_approval_decided_at || version.created_at)}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Table size="small" sx={{ borderCollapse: 'collapse', mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={head}>Project Name</TableCell>
              <TableCell sx={head}>Description</TableCell>
              <TableCell sx={head}>Work Order Heading</TableCell>
              <TableCell sx={head}>BOQ Reference if needed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell sx={cell}>{projectName}</TableCell>
              <TableCell sx={cell}>
                <TextField
                  fullWidth
                  size="small"
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onBlur={flushDescription}
                  disabled={!linkedDoc?.id || patchDocument.isPending}
                />
              </TableCell>
              <TableCell sx={cell}>
                <TextField
                  fullWidth
                  size="small"
                  value={workOrderDraft}
                  onChange={(e) => setWorkOrderDraft(e.target.value)}
                  onBlur={flushWorkOrder}
                  disabled={!linkedDoc?.id || patchDocument.isPending}
                />
              </TableCell>
              <TableCell sx={cell}>{version.label}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Table size="small" sx={{ borderCollapse: 'collapse', mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={head}>Document Type</TableCell>
              <TableCell sx={head}>Document Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell sx={cell}>Calculation</TableCell>
              <TableCell sx={cell}>Shop Drawing</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={cell}>
                <Stack spacing={0.5}>
                  {calcAttachments.map((a) => (
                    <Link key={a.id} href={downloadUrl(a.id)} target="_blank" rel="noreferrer" underline="hover">
                      {a.filename}
                    </Link>
                  ))}
                  {!calcAttachments.length && <Typography variant="caption">No attachments yet</Typography>}
                  <input
                    id={calcInputId}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadAttachment.mutate({ file: f, slot: 'calculation' })
                      e.target.value = ''
                    }}
                  />
                  <Button component="label" htmlFor={calcInputId} size="small" variant="outlined" disabled={!linkedDoc?.id}>
                    Upload
                  </Button>
                </Stack>
              </TableCell>
              <TableCell sx={cell}>
                <Stack spacing={0.5}>
                  {shopAttachments.map((a) => (
                    <Link key={a.id} href={downloadUrl(a.id)} target="_blank" rel="noreferrer" underline="hover">
                      {a.filename}
                    </Link>
                  ))}
                  {!shopAttachments.length && <Typography variant="caption">No attachments yet</Typography>}
                  <input
                    id={shopInputId}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadAttachment.mutate({ file: f, slot: 'shop_drawing' })
                      e.target.value = ''
                    }}
                  />
                  <Button component="label" htmlFor={shopInputId} size="small" variant="outlined" disabled={!linkedDoc?.id}>
                    Upload
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {!linkedDoc?.id && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No project document is linked to this BOQ version yet, so attachments stay empty until the document is matched.
          </Alert>
        )}

        {linkedDoc?.id && !calcAttachments.length && !shopAttachments.length && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No uploads have been added in this BOQ panel yet.
          </Alert>
        )}

        {patchDocument.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(patchDocument.error as Error).message}
          </Alert>
        )}

        <Table size="small" sx={{ borderCollapse: 'collapse' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={head}>SHOP DRAWING STATUS</TableCell>
              <TableCell sx={head}>CALCULATION STATUS</TableCell>
              <TableCell sx={head}>REMARK</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell sx={cell}>Approved</TableCell>
              <TableCell sx={cell}>Approved</TableCell>
              <TableCell sx={cell}>
                <Button variant="contained" color="success" onClick={onCreateChangeOrder}>
                  Create Change Order
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {uploadAttachment.isError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {(uploadAttachment.error as Error).message}
          </Alert>
        )}
      </AccordionDetails>
    </Accordion>
  )
}
