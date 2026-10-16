import type { Relation } from '../model/document';

export const SOURCE_LIMIT = 200_000;
export const FILE_LIMIT = 10 * 1024 * 1024;
export type Issue = 'missing-target' | 'unclear' | 'conflict';
export interface SourceParagraph {
  id: string;
  text: string;
}
export interface ChangeProposal {
  id: string;
  text: string;
  targetIds: string[];
  relation: Relation;
  evidence: { paragraphId: string; quote: string }[];
  issues: Issue[];
}
export interface ReviewedProposal extends ChangeProposal {
  decision: 'pending' | 'approved' | 'excluded';
  resolved: boolean;
}
export interface AnalysisRound {
  number: number;
  documentRevision: string;
  fingerprint: string;
  sourceHash: string;
  checkoutRevision: string;
  submitted: boolean;
  submissionHash?: string;
  proposals: ReviewedProposal[];
}
export interface ChangeRequestBatch {
  version: 1;
  id: string;
  title: string;
  source: string;
  sourceHash: string;
  paragraphs: SourceParagraph[];
  revision: string;
  updatedAt: number;
  analysis?: AnalysisRound;
  history: AnalysisRound[];
}
export interface BatchView extends ChangeRequestBatch {
  stale: boolean;
  convertedNoteIds: string[];
  noteIds: Record<string, string>;
}
export interface ProposalSubmission {
  version: 1;
  proposals: ChangeProposal[];
}

export function paragraphs(source: string): SourceParagraph[] {
  return source
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `p${index + 1}`, text }));
}
