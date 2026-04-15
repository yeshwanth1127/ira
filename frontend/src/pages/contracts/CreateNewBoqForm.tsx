import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiUpload } from '../../api/client'
import type { BoqVersion } from '../../types'

const labelSx = {
  bgcolor: '#ffeb3b',
  border: '2px solid #000',
  fontWeight: 700,
  px: 1.5,
  py: 1,
  minWidth: { xs: '100%', sm: 200 },
  fontFamily: 'Georgia, "Times New Roman", serif',
}

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    border: '2px solid #000',
    borderRadius: 0,
    bgcolor: '#fff',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
}

type Props = {
  projectId: string
  projectName: string
  onSuccess: (version: BoqVersion) => void
  onBack: () => void
}

export function CreateNewBoqForm({ projectId, projectName, onSuccess, onBack }: Props) {
  const [formProjectName, setFormProjectName] = useState(projectName)
  const [clusterHead, setClusterHead] = useState('')
  const [clientName, setClientName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!file) {
      setErr('Please attach a BOQ file.')
      return
    }
    if (!formProjectName.trim() || !clusterHead.trim() || !clientName.trim()) {
      setErr('Fill in all fields.')
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('form_project_name', formProjectName.trim())
      fd.append('cluster_head', clusterHead.trim())
      fd.append('client_name', clientName.trim())
      fd.append('file', file)
      const v = await apiUpload<BoqVersion>(`/projects/${projectId}/boq-versions/create-with-upload`, fd)
      onSuccess(v)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 2 }}>
      <Typography
        variant="h4"
        sx={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontWeight: 700,
          textAlign: 'right',
          mb: 3,
          letterSpacing: 0.5,
        }}
      >
        CONTRACTS TEAM
      </Typography>

      <Button size="small" onClick={onBack} sx={{ mb: 2 }}>
        ← Back
      </Button>

      <Typography variant="h6" sx={{ mb: 2, fontFamily: 'Georgia, "Times New Roman", serif' }}>
        Create new BOQ
      </Typography>

      <form onSubmit={submit}>
        <Stack spacing={0}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, border: '2px solid #000' }}>
            <Box sx={labelSx}>Project Name</Box>
            <TextField
              fullWidth
              required
              variant="outlined"
              value={formProjectName}
              onChange={(e) => setFormProjectName(e.target.value)}
              sx={{ ...fieldSx, flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, border: '2px solid #000', borderTop: 0 }}>
            <Box sx={labelSx}>Cluster Head</Box>
            <TextField
              fullWidth
              required
              variant="outlined"
              value={clusterHead}
              onChange={(e) => setClusterHead(e.target.value)}
              sx={{ ...fieldSx, flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, border: '2px solid #000', borderTop: 0 }}>
            <Box sx={labelSx}>Client Name</Box>
            <TextField
              fullWidth
              required
              variant="outlined"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              sx={{ ...fieldSx, flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            />
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { sm: 'stretch' },
              border: '2px solid #000',
              borderTop: 0,
            }}
          >
            <Box sx={labelSx}>Upload BOQ</Box>
            <Box
              sx={{
                flex: 1,
                borderLeft: { sm: 'none' },
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                bgcolor: '#fff',
              }}
            >
              <Button variant="outlined" component="label" sx={{ ...fieldSx, alignSelf: 'flex-start' }}>
                Choose file
                <input
                  type="file"
                  hidden
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              <Typography variant="body2" sx={{ mt: 0.5, color: file ? 'text.primary' : 'error.main' }}>
                {file ? file.name : 'Attachment'}
              </Typography>
            </Box>
          </Box>
        </Stack>

        {err && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {err}
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
          <Button
            type="submit"
            disabled={loading}
            sx={{
              bgcolor: '#8ea9db',
              color: '#000',
              border: '2px solid #000',
              borderRadius: 0,
              px: 4,
              py: 1.5,
              fontWeight: 700,
              textDecoration: 'underline',
              fontFamily: 'Georgia, "Times New Roman", serif',
              '&:hover': { bgcolor: '#7b98ca' },
            }}
          >
            {loading ? 'Submitting…' : 'Submit'}
          </Button>
        </Box>
      </form>
    </Box>
  )
}
