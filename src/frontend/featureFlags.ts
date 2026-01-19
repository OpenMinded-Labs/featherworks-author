export type Edition = 'core' | 'pro';

export interface FeatureSet {
  ai: boolean;
  collab: boolean;
  cloud: boolean;
  advancedAnalysis: boolean;
  pacing: boolean;
  plugins: boolean;
  patchPipeline: boolean; // enables JSON doc + patch based persistence
}

export const baseMatrix: Record<Edition, FeatureSet> = {
  core: {
    ai: true, // Enable AI features
    collab: false,
    cloud: false,
    advancedAnalysis: false,
    pacing: false,
    plugins: false,
    patchPipeline: false, // disabled for stability - use simple content update
  },
  pro: {
    ai: true,
    collab: true,
    cloud: true,
    advancedAnalysis: true,
    pacing: true,
    plugins: true,
    patchPipeline: true,
  }
};

export function resolveFeatures(edition:Edition, overrides: Partial<FeatureSet>|undefined): FeatureSet {
  const base = baseMatrix[edition];
  return { ...base, ...(overrides||{}) };
}