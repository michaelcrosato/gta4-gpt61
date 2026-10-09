/** Exact published0.6/0.6.1 authoring catalogue, fingerprint38b480d9.
 * Reconstructed from immutable0.5 plus the ONLY published changes: the Reeve
 * alive-speaker line and three M2 failure literals. No current mutable pack import.
 * Source release e51a9658aa67679cf0f5f4b788d0bfbf28d11682; native tests verify
 * the complete reconstructed fingerprint and every preserved owned definition. */
import { FIRST_ARC_05_CONTENT } from './first-arc-0.5.js';
const freeze = (v) => {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
};
export const FIRST_ARC_06_FINGERPRINT = '38b480d9';
const PUBLISHED_M2_FAILURES = [
  {
    id: 'protected-target-harmed',
    condition: {
      type: 'protected-target-harmed',
      actors: ['LL-ARC-YARA'],
      groups: ['police'],
      requiresPlayerAttribution: true,
      essentialActorDeath: ['LL-ARC-YARA'],
    },
    resumeCheckpoint: 'annex',
    dialogue: [
      {
        speaker: 'Mara',
        text: 'Yara was trying to help us. We have to get through this without putting her or the patrol in the line of fire.',
        when: 'always',
      },
    ],
  },
  {
    id: 'lookout-timeout',
    condition: {
      type: 'lookout-timeout',
      seconds: 45,
    },
    resumeCheckpoint: 'annex',
    dialogue: [
      {
        speaker: 'Mara',
        text: 'I lost the approaches. Felix, leave the papers and get somewhere safe.',
        when: 'always',
      },
    ],
  },
  {
    id: 'collector-at-door',
    condition: {
      type: 'collector-door-arrived',
      actor: 'LL-ARC-REEVE',
      beforeWarning: true,
    },
    resumeCheckpoint: 'annex',
    dialogue: [
      {
        speaker: 'Mara',
        text: 'He reached the annex before the warning. We need to try the release again.',
        when: 'always',
      },
    ],
  },
];
const PUBLISHED_EXTRACT_DIALOGUE = [
  {
    speaker: 'Reeve',
    text: 'That taxi is collateral. The man inside it is negotiable.',
    when: {
      type: 'actor-alive',
      actor: 'LL-ARC-REEVE',
    },
  },
  {
    speaker: 'Mara',
    text: 'Close the door, Felix.',
    when: 'always',
  },
  {
    speaker: 'Felix',
    text: 'I am beginning to dislike expedited service.',
    when: 'always',
  },
];
export const FIRST_ARC_06_CONTENT = freeze({
  ...FIRST_ARC_05_CONTENT,
  missions: FIRST_ARC_05_CONTENT.missions.map((mission) =>
    mission.id !== 'LL-ST-002'
      ? mission
      : {
          ...mission,
          stages: mission.stages.map((stage) =>
            stage.id !== 'extract' ? stage : { ...stage, dialogue: PUBLISHED_EXTRACT_DIALOGUE },
          ),
          failures: [...PUBLISHED_M2_FAILURES, ...mission.failures],
        },
  ),
});
