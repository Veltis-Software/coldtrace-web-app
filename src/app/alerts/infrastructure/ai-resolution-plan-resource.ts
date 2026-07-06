export type AiResolutionPlanStatus = 'pending' | 'approved' | 'rejected';

export interface AiResolutionPlanStepResource {
  sequence: number;
  action: string;
  rationale: string;
  expectedOutcome: string;
}

export interface AiResolutionPlanResource {
  id: number;
  organizationId: number;
  incidentId: number;
  status: AiResolutionPlanStatus;
  summary: string;
  probableCause: string;
  recommendedSteps: AiResolutionPlanStepResource[];
  correctiveActionDraft: string;
  resolutionNotesDraft: string;
  escalationRecommended: boolean;
  escalationUrgency: string;
  escalationReason: string;
  requiredEvidence: string[];
  uncertaintyNotes: string[];
  modelProvider: string;
  modelName: string;
  providerMetadata: string;
  generatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  finalCorrectiveAction: string | null;
  finalResolutionNotes: string | null;
}

export interface ApproveAiResolutionPlanRequest {
  approvedBy: string;
  finalCorrectiveAction: string;
  finalResolutionNotes: string;
}

export interface RejectAiResolutionPlanRequest {
  rejectedBy: string;
  rejectionReason: string;
}
