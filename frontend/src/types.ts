export type Project = {
  id: string
  name: string
  code: string
  erp_connector_key: string | null
}

export type DepartmentRole = 'contracts' | 'design' | 'qs' | 'admin'

export type CustomerApprovalStatus =
  | 'not_sent'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'

export type BoqVersion = {
  id: string
  project_id: string
  label: string
  source: 'new_boq' | 'existing_boq'
  status: 'draft' | 'locked'
  row_count_snapshot: number | null
  form_project_name?: string | null
  cluster_head?: string | null
  client_name?: string | null
  source_filename?: string | null
  customer_approval_status: CustomerApprovalStatus
  customer_approval_note?: string | null
  customer_submitted_for_approval_at?: string | null
  customer_approval_decided_at?: string | null
  created_at: string
  locked_at: string | null
}

export type BoqLineOut = {
  id: string
  line_no: string
  description: string
  uom: string | null
  quantity: number
  rate: number
  amount: number
  sort_order: number
}

export type ProjectDocument = {
  id: string
  project_id?: string
  document_number: string
  title: string
  /** Design sheet work order line; falls back to approved BOQ when unset */
  work_order_heading?: string | null
  /** Set when Design submits quantity variation to QS (no redirect) */
  quantity_variation_submitted_at?: string | null
  status: string
  created_at: string
}

export type DocumentAttachment = {
  id: string
  filename: string
  entity_type: string
  entity_id: string
  size_bytes: number
  created_at: string
  download_url?: string
  /** calculation | shop_drawing — older uploads may be null */
  attachment_slot?: string | null
}

export type DesignPackage = {
  id: string
  label: string
  shop_drawing_approved: boolean
  calculation_approved: boolean
  status: string
}

export type ChangeOrder = {
  id: string
  project_id?: string
  reference: string
  request_kind?: 'quantity_variation' | 'addition_new_item' | null
  status: string
  design_package_id: string | null
  boq_version_id?: string | null
  created_at?: string
}

export type QsRun = {
  id: string
  baseline_boq_version_id: string
  target_boq_version_id: string
  status: string
  mail_confirmed: boolean
  work_order_received: boolean
}

export type QsVariance = {
  id: string
  line_no: string
  description: string
  initial_qty: number
  current_qty: number
  initial_rate: number
  current_rate: number
  variation_amount: number
}

export type WorkOrder = {
  id: string
  reference: string
  mail_received: boolean
  work_order_received: boolean
}

export type ErpJob = {
  id: string
  job_type: string
  status: string
  payload?: Record<string, unknown> | null
  external_ref: string | null
  error_message: string | null
  created_at: string
}

export type Me = {
  user: {
    id: string
    email: string
    full_name: string
    is_superuser: boolean
    default_role?: DepartmentRole
  }
  memberships: { project_id: string; project_name: string; project_code: string; role: DepartmentRole }[]
}

export type ApprovedBoqProjectGroup = {
  project: Project
  versions: BoqVersion[]
}
