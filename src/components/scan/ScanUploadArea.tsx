import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { parseNucleiJSON } from '@/lib/parsers/nuclei'
import { parseNmapXML } from '@/lib/parsers/nmap'
import { supabase } from '@/lib/supabase'
import type { ScanUpload } from '@/types/database'

const maxFileSize = 10 * 1024 * 1024

interface ScanUploadAreaProps {
  onUploaded: (upload: ScanUpload) => void
}

function safeFilename(filename: string) {
  const safe = filename.replaceAll('\\', '_').replaceAll('/', '_').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_')
  return safe || 'scan-results.json'
}

export function ScanUploadArea({ onUploaded }: ScanUploadAreaProps) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()

  async function uploadScan() {
    setError('')
    if (!user) {
      setError('Sign in before uploading scan results.')
      return
    }
    if (!file) {
      setError('Choose a Nuclei JSON/JSONL or Nmap XML file first.')
      return
    }
    const filename = file.name.toLowerCase()
    if (!filename.endsWith('.json') && !filename.endsWith('.jsonl') && !filename.endsWith('.xml')) {
      setError('Choose a .json, .jsonl, or .xml scan results file.')
      return
    }
    if (file.size > maxFileSize) {
      setError('File too large. Maximum size is 10 MB.')
      return
    }

    setBusy(true)
    let uploadRecord: ScanUpload | null = null
    try {
      const content = await file.text()
      const isNmap = filename.endsWith('.xml')
      let findings
      let invalidCount = 0
      let hostWarning: string | null = null
      if (isNmap) {
        const xmlStart = content.replace(/^\uFEFF/, '').trimStart()
        if (!xmlStart.startsWith('<?xml') && !xmlStart.startsWith('<nmaprun')) {
          throw new Error('The selected file does not appear to be Nmap XML.')
        }
        const parsed = parseNmapXML(content)
        findings = parsed.findings
        invalidCount = parsed.invalidHostCount
        if (invalidCount > 0) hostWarning = `Parsed ${parsed.totalHosts - invalidCount} of ${parsed.totalHosts} hosts; ${invalidCount} entries could not be interpreted.`
      } else {
        const firstCharacter = content.replace(/^\uFEFF/, '').trimStart()[0]
        if (firstCharacter !== '{' && firstCharacter !== '[') {
          throw new Error('The selected file does not begin with a JSON object or array.')
        }
        const parsed = parseNucleiJSON(content)
        findings = parsed.findings
        invalidCount = parsed.invalidCount
      }
      if (!isNmap && findings.length === 0 && invalidCount > 0) {
        throw new Error('Unable to parse file. Ensure it contains valid Nuclei JSON or JSONL.')
      }

      const uploadId = crypto.randomUUID()
      const fileType = isNmap ? 'nmap_xml' : filename.endsWith('.jsonl') ? 'nuclei_jsonl' : 'nuclei_json'
      const storagePath = `${user.id}/${uploadId}/${safeFilename(file.name)}`
      const { data: row, error: rowError } = await supabase.from('scan_uploads').insert({
        id: uploadId,
        user_id: user.id,
        filename: file.name,
        file_type: fileType,
        file_size_bytes: file.size,
        storage_path: storagePath,
        parse_status: 'pending',
      }).select('*').single()
      if (rowError || !row) throw new Error('The scan upload record could not be created.')
      uploadRecord = row as ScanUpload

      const { error: storageError } = await supabase.storage.from('scan-files').upload(storagePath, file, {
        contentType: file.type || 'application/json',
        upsert: false,
      })
      if (storageError) throw new Error('The scan file could not be stored in your private scan bucket.')

      const { error: parsingError } = await supabase.from('scan_uploads').update({ parse_status: 'parsing', parse_error: null }).eq('id', uploadId)
      if (parsingError) throw new Error('The scan upload status could not be updated.')
      for (let offset = 0; offset < findings.length; offset += 500) {
        const batch = findings.slice(offset, offset + 500).map((finding) => ({ ...finding, scan_upload_id: uploadId }))
        const { error: findingsError } = await supabase.from('scan_findings').insert(batch)
        if (findingsError) throw new Error('Some scan findings could not be saved.')
      }
      const { data: completed, error: updateError } = await supabase
        .from('scan_uploads')
        .update({ parse_status: 'complete', parse_error: null, total_findings: findings.length })
        .eq('id', uploadId)
        .select('*')
        .single()
      if (updateError || !completed) throw new Error('The parsed scan status could not be saved.')

      onUploaded(completed as ScanUpload)
      setFile(null)
      setOpen(false)
      if (hostWarning) toast.warning(hostWarning)
      else if (invalidCount > 0) toast.warning(`Imported ${findings.length} findings. ${invalidCount} invalid entries were skipped.`)
      else if (findings.length === 0) toast.info('The scan file parsed successfully and contained no findings.')
      else toast.success(`Imported ${findings.length} scan findings.`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The scan file could not be processed.'
      setError(message)
      if (uploadRecord) {
        await supabase.from('scan_uploads').update({ parse_status: 'error', parse_error: message }).eq('id', uploadRecord.id)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); setError('') }}>
      <DialogTrigger asChild><Button size="sm">Upload scan</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload scan results</DialogTitle>
          <DialogDescription>Choose a Nuclei JSON/JSONL or Nmap XML file under 10 MB. The app parses it in your browser and stores the private source file in Supabase Storage.</DialogDescription>
        </DialogHeader>
        <label className="block space-y-2 text-sm font-medium" htmlFor="nuclei-scan-file">
          Scan file
          <input
            accept=".json,.jsonl,.xml,application/json,application/xml,text/xml"
            className="block w-full rounded-md border border-border-default bg-bg-input p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-bg-tertiary file:px-2 file:py-1 file:text-text-primary"
            id="nuclei-scan-file"
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError('') }}
            type="file"
          />
        </label>
        {file && <p className="font-mono text-xs text-text-secondary">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
        {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm" role="alert">{error}</p>}
        <DialogFooter>
          <Button disabled={busy || !file} onClick={() => void uploadScan()} size="sm">{busy ? 'Parsing and saving…' : 'Parse and upload'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
