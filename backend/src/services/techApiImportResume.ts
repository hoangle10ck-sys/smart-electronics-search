import { TechApiImportResumeState } from '../repositories/techApiRepository';

export type TechApiResumeCandidate = {
  fileKey: string;
  sha256: string;
  sourceKey: string;
};

/** A matching checkpoint is reusable only while its catalog row still exists. */
export function canSkipTechApiFile(
  candidate: TechApiResumeCandidate,
  resumeStateByFileKey: ReadonlyMap<string, TechApiImportResumeState>,
): boolean {
  const state = resumeStateByFileKey.get(candidate.fileKey);
  return state?.checkpointSha256 === candidate.sha256 && state.catalogRecordExists;
}
