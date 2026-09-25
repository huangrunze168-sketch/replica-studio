import { useEffect, useState } from 'react';
import { memoryAdapter } from '../adapters';
import type { Asset, GenerationJob, ProjectSummary, ReferenceSource, Shot } from '../ports';
export const ports = memoryAdapter;
export function useAppData(projectId: string) {
  const [project, setProject] = useState<ProjectSummary>(); const [shots, setShots] = useState<Shot[]>([]); const [assets, setAssets] = useState<Asset[]>([]); const [sources, setSources] = useState<ReferenceSource[]>([]); const [jobs, setJobs] = useState<GenerationJob[]>([]);
  useEffect(() => { void Promise.all([ports.projects.get(projectId), ports.shots.list(projectId), ports.media.listAssets(projectId), ports.source.list(projectId), ports.generation.listJobs(projectId)]).then(([p, s, a, ref, j]) => { setProject(p); setShots(s); setAssets(a); setSources(ref); setJobs(j); }); }, [projectId]);
  return { project, shots, assets, sources, jobs, refreshJobs: () => ports.generation.listJobs(projectId).then(setJobs), refreshSources: () => ports.source.list(projectId).then(setSources) };
}
