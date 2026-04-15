import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  TextField,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'

type Line = {
  id: string
  line_no: string
  description: string
  uom: string | null
  quantity: number
  rate: number
  amount: number
}

type Page = {
  items: Line[]
  next_cursor: string | null
  total_count: number
}

function parseLineRef(lineNo: string): { type: string; ref: string; subRef: string } {
  const cleaned = lineNo.trim()
  if (!cleaned) return { type: '—', ref: '—', subRef: '—' }
  const dashed = cleaned.split(/[.-]/).map((part) => part.trim()).filter(Boolean)
  if (dashed.length >= 3) return { type: dashed[0], ref: dashed[1], subRef: dashed[2] }
  if (dashed.length === 2) return { type: dashed[0], ref: dashed[1], subRef: '—' }
  const slashed = cleaned.split('/').map((part) => part.trim()).filter(Boolean)
  if (slashed.length >= 3) return { type: slashed[0], ref: slashed[1], subRef: slashed[2] }
  if (slashed.length === 2) return { type: slashed[0], ref: slashed[1], subRef: '—' }
  return { type: cleaned, ref: cleaned, subRef: '—' }
}

export function BoqLinesPage() {
  const { versionId = '' } = useParams()
  const qc = useQueryClient()
  const [cursor, setCursor] = useState<string | null>(null)
  const [stack, setStack] = useState<(string | null)[]>([])
  const [rows, setRows] = useState<Line[]>([])
  const [savedNotice, setSavedNotice] = useState('')

  const { data, isFetching } = useQuery({
    queryKey: ['boq-lines', versionId, cursor],
    queryFn: () => {
      const q = cursor != null ? `?cursor=${cursor}&limit=80` : '?limit=80'
      return api<Page>(`/boq-versions/${versionId}/lines${q}`)
    },
    enabled: !!versionId,
  })

  useEffect(() => {
    setRows(data?.items ?? [])
  }, [data?.items])

  const dirty = useMemo(
    () => rows.some((row, index) => row !== data?.items?.[index]),
    [rows, data?.items],
  )

  const saveMut = useMutation({
    mutationFn: async () => {
      return api<{ items: Line[]; next_cursor: string | null; total_count: number }>(`/boq-versions/${versionId}/lines`, {
        method: 'PUT',
        body: JSON.stringify({
          items: rows.map((row, index) => ({
            ...row,
            sort_order: index,
          })),
        }),
      })
    },
    onSuccess: () => {
      setSavedNotice('BOQ changes saved.')
      void qc.invalidateQueries({ queryKey: ['boq-lines', versionId, cursor] })
    },
  })

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        BOQ editor ({data?.total_count ?? '…'} total)
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Spreadsheet-style editor with the same column structure as the BOQ sheet. Edit the visible rows and click Save.
      </Typography>
      {savedNotice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {savedNotice}
        </Alert>
      )}
      <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          disabled={!rows.length || saveMut.isPending || !dirty}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="outlined"
          disabled={!rows.length || saveMut.isPending || !dirty}
          onClick={() => {
            setRows(data?.items ?? [])
            setSavedNotice('')
          }}
        >
          Reset
        </Button>
      </Box>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Line</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Ref.</TableCell>
              <TableCell>Sub Ref</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>UOM</TableCell>
              <TableCell align="right">Current Qty</TableCell>
              <TableCell align="right">Current Rate</TableCell>
              <TableCell align="right">Current Amount</TableCell>
              <TableCell align="right">Initial Qty</TableCell>
              <TableCell align="right">Initial Rate</TableCell>
              <TableCell align="right">Initial Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>
                  <TextField
                    variant="standard"
                    value={row.line_no}
                    onChange={(e) =>
                      setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, line_no: e.target.value } : item)))
                    }
                    fullWidth
                  />
                </TableCell>
                <TableCell>
                  {parseLineRef(row.line_no).type}
                </TableCell>
                <TableCell>
                  {parseLineRef(row.line_no).ref}
                </TableCell>
                <TableCell>
                  {parseLineRef(row.line_no).subRef}
                </TableCell>
                <TableCell>
                  <TextField
                    variant="standard"
                    value={row.description}
                    onChange={(e) =>
                      setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, description: e.target.value } : item)))
                    }
                    fullWidth
                    multiline
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    variant="standard"
                    value={row.uom ?? ''}
                    onChange={(e) =>
                      setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, uom: e.target.value } : item)))
                    }
                    fullWidth
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    variant="standard"
                    value={row.quantity}
                    type="number"
                    onChange={(e) =>
                      setRows((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, quantity: Number(e.target.value) } : item,
                        ),
                      )
                    }
                    sx={{ '& input': { textAlign: 'right' } }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    variant="standard"
                    value={row.rate}
                    type="number"
                    onChange={(e) =>
                      setRows((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, rate: Number(e.target.value) } : item,
                        ),
                      )
                    }
                    sx={{ '& input': { textAlign: 'right' } }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    variant="standard"
                    value={row.amount}
                    type="number"
                    onChange={(e) =>
                      setRows((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, amount: Number(e.target.value) } : item,
                        ),
                      )
                    }
                    sx={{ '& input': { textAlign: 'right' } }}
                  />
                </TableCell>
                <TableCell align="right">{row.quantity.toLocaleString('en-IN')}</TableCell>
                <TableCell align="right">
                  {row.rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell align="right">
                  {row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <Button
          disabled={stack.length === 0 || isFetching}
          onClick={() => {
            setSavedNotice('')
            setStack((s) => {
              const n = [...s]
              const prev = n.pop()
              setCursor(prev ?? null)
              return n
            })
          }}
        >
          Previous page
        </Button>
        <Button
          disabled={!data?.next_cursor || isFetching}
          onClick={() => {
            setSavedNotice('')
            setStack((s) => [...s, cursor])
            setCursor(data!.next_cursor)
          }}
        >
          Next page
        </Button>
      </Box>
    </Box>
  )
}
