/** Approved 0.5/0.5.1 authoring data for strict save migration. Origin: cafad0022525b614990a517e1bd282199f000c81. */
const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};
export const FIRST_ARC_05_FINGERPRINT = 'cbf05190';
export const FIRST_ARC_05_CONTENT = freeze({
  missions: [
    {
      id: 'LL-ST-001',
      title: 'Night Crossing',
      contact: 'LL-CHAR-002',
      source: {
        game: 'GTA IV base game',
        title: 'The Cousins Bellic',
        url: 'https://gta.fandom.com/wiki/The_Cousins_Bellic',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'berth',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Mara steps off a relief ferry. Felix turns the ride home into an evacuation rehearsal, then admits that the co-op’s promised contracts have never been paid.',
      cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-CHAR-008'],
      dependencies: {
        all: [],
        availability:
          'True campaign arrival; narrative entry must precede or bridge existing tutorial jobs, never repeat their rewards.',
      },
      sourceBeats: [
        {
          sourceBeat: 'Ship arrival and cousin reunion',
          stageIds: ['berth'],
          adaptation:
            'A relief ferry and working cargo berth, with an original coastal evacuation history.',
        },
        {
          sourceBeat: 'First passenger drive and city introduction',
          stageIds: ['taxi', 'drill'],
          adaptation: 'An evacuation rehearsal teaches steering and neighborhood routes.',
        },
        {
          sourceBeat:
            'Modest home contradicts promised opportunity; safehouse and health tutorials',
          stageIds: ['shelter', 'rest'],
          adaptation: 'Co-op bunk tenancy, parking and food rather than a copied apartment reveal.',
        },
      ],
      stages: [
        {
          id: 'berth',
          type: 'scene',
          scene: 'pier-berth',
          objective: 'Meet Felix at the temporary passenger berth.',
          completion: [
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Mara! They told me the ferry was carrying equipment. I said my cousin counts.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Three crossings, one engine fire. Your directions were the easy part.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Harbor City. We have work, a room, and streets that occasionally agree with the map.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You said a fleet.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'A fleet starts with one car. This one has survived every announcement of recovery.',
              when: 'always',
            },
          ],
          staging:
            'Felix carries Mara’s duffel to a lit curb; ferry workers continue moving behind them. No opening gunfight.',
        },
        {
          id: 'taxi',
          type: 'board',
          scene: 'pier-berth',
          objective: 'Take the wheel of Felix’s co-op Crownline with Felix seated beside you.',
          completion: [
            {
              type: 'vehicle-boarded',
              vehicle: 'arc-arrival-taxi',
              passengers: ['LL-CHAR-002'],
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Left seat is yours. Pretend the meter works; the passengers usually do.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Seat belt. I used to get paid to say that.',
              when: 'always',
            },
          ],
          vehicle: {
            id: 'arc-arrival-taxi',
            role: 'taxi',
            seats: 4,
            ownership: 'cooperative',
            spawn: 'approved berth curb',
          },
          tutorial: ['steer', 'accelerate', 'brake', 'vehicle-health'],
        },
        {
          id: 'drill',
          type: 'drive-route',
          scene: 'dispatch',
          objective:
            'Follow the evacuation signs to Voss Dispatch, stopping once at the promenade muster sign.',
          completion: [
            {
              type: 'route-stops',
              route: ['pier-berth', 'fairground', 'dispatch'],
              vehicle: 'arc-arrival-taxi',
              passengerAlive: 'LL-CHAR-002',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Yellow arrows mean the next flood assembly point. White arrows mean somebody sold advertising space.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'That street is too narrow for the coaches on your plan.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Tell the consultants. They charged us by the arrow.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Who signs the actual evacuation routes?',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'The same office that has owed us six months of driving.',
              when: 'always',
            },
          ],
          route: {
            legs: [
              ['pier-berth', 'fairground'],
              ['fairground', 'dispatch'],
            ],
            solver: 'legal street route; no teleport',
            stops: [
              {
                at: 'fairground',
                speedBelow: 5,
                seconds: 2,
              },
            ],
            failureGraceSeconds: 25,
          },
          ambient: [
            {
              speaker: 'Felix',
              text: 'The water is beautiful until you have to measure it against your door.',
              when: 'always',
            },
          ],
        },
        {
          id: 'shelter',
          type: 'walk-scene',
          scene: 'dockside-rooms',
          objective: 'Park in the sheltered co-op spaces and inspect the room Nadia arranged.',
          completion: [
            {
              type: 'parked',
              vehicle: 'arc-arrival-taxi',
              markedBay: true,
            },
            {
              type: 'scene-entered',
              scene: 'dockside-rooms',
            },
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Nadia',
              text: 'I found you a clean bed. Felix supplied the grand description.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'The room was bigger in the photograph.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'A lock that works. That is already better than the ferry.',
              when: 'always',
            },
            {
              speaker: 'Nadia',
              text: 'Then keep the spare key. Shelter should never depend on somebody answering a phone.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I came to find an old dispatch record. Work will keep me here long enough to look.',
              when: 'always',
            },
          ],
          props: ['duffel', 'shelter-key', 'unpaid-contract ledger'],
          onComplete: [
            {
              type: 'grant-key',
              id: 'dockside-tenancy',
            },
          ],
        },
        {
          id: 'rest',
          type: 'service-tutorial',
          scene: 'dockside-rooms',
          objective: 'Eat from the shared kettle table, save, and rest before your first shift.',
          completion: [
            {
              type: 'food-used',
            },
            {
              type: 'shelter-save-confirmed',
            },
            {
              type: 'rest-completed',
              hours: 6,
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Tea, soup, sleep. Three things the city has not put on a finance plan.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Give it a week.',
              when: 'always',
            },
            {
              speaker: 'Nadia',
              text: 'Tomorrow you decide which promise to collect first.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'unlock',
              ids: ['shelter-rest', 'cooperative-parking', 'LL-ST-002', 'first-shift'],
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'arrival',
          afterStage: 'berth',
          resumeStage: 'taxi',
          snapshot: ['wallet', 'arrival-taxi', 'Felix-seat', 'duffel'],
          note: 'Restart at the curb without losing the ferry scene outcome.',
        },
        {
          id: 'home',
          afterStage: 'shelter',
          resumeStage: 'rest',
          snapshot: ['tenancy-key', 'parked-taxi', 'wallet', 'health'],
          note: 'Food and rest cannot multiply inventory or tutorial rewards.',
        },
      ],
      failures: [
        {
          id: 'lost-nadia',
          condition: {
            type: 'actor-dead',
            actor: 'LL-CHAR-008',
          },
          resumeCheckpoint: 'arrival',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Nadia was giving us a place to begin. We cannot leave her like this.',
              when: 'always',
            },
          ],
        },
        {
          id: 'lost-felix',
          condition: {
            type: 'passenger-dead-or-abandoned',
            actor: 'LL-CHAR-002',
            grace: 25,
          },
          resumeCheckpoint: 'arrival',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Felix, stay with me. We are starting this ride again.',
              when: 'always',
            },
          ],
        },
        {
          id: 'taxi-lost',
          condition: {
            type: 'required-vehicle-destroyed',
            vehicle: 'arc-arrival-taxi',
          },
          resumeCheckpoint: 'arrival',
          dialogue: [
            {
              speaker: 'Felix',
              text: 'The co-op cannot afford a second first impression.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'room-response',
          stage: 'shelter',
          options: [
            {
              id: 'thank-nadia',
              text: 'Thank Nadia for the practical help.',
              effects: [
                {
                  type: 'trust',
                  actor: 'LL-CHAR-008',
                  delta: 1,
                },
              ],
            },
            {
              id: 'ask-contracts',
              text: 'Ask to see the unpaid contract ledger.',
              effects: [
                {
                  type: 'evidence-note',
                  id: 'co-op-arrears',
                },
              ],
            },
          ],
          outcome: 'Both grant shelter; dialogue and journal vary, neither suppresses the story.',
        },
      ],
      consequences: [
        'Mara has a persistent refuge, co-op parking and an original reason to investigate emergency dispatch.',
        'Existing four tutorial jobs can follow as additional work; they retain their independent IDs and source credit zero.',
      ],
      rewards: {
        cash: 0,
        unlocks: ['dockside-tenancy', 'LL-ST-002', 'additional-onboarding'],
      },
      requiredCapabilities: [
        {
          id: 'director',
          missionWork: 'Arrival and onboarding handoff',
        },
        {
          id: 'passengers',
          missionWork: 'Felix boards/rides/exits',
        },
        {
          id: 'shelter',
          missionWork: 'Room, food, wardrobe and parking',
        },
        {
          id: 'cinematic',
          missionWork: 'Ferry arrival and shelter reveal',
        },
        {
          id: 'interior',
          missionWork: 'Dockside Rooms',
        },
      ],
    },
    {
      id: 'LL-ST-002',
      title: 'Late Meter',
      contact: 'LL-CHAR-002',
      source: {
        game: 'GTA IV base game',
        title: "It's Your Call",
        url: 'https://gta.fandom.com/wiki/It%27s_Your_Call',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'counter',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'An impound release is Felix’s last chance to keep another taxi. Mara discovers that the same collectors who caused the seizure are selling access to the clerk.',
      cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-ARC-YARA', 'LL-ARC-REEVE'],
      dependencies: {
        all: ['LL-ST-001'],
        availability:
          'Felix’s first campaign dispatch request; onboarding jobs may be completed independently.',
      },
      sourceBeats: [
        {
          sourceBeat: 'Drive cousin to a backroom visit and wait as lookout',
          stageIds: ['counter', 'lookout'],
          adaptation: 'Impound bargaining replaces gambling.',
        },
        {
          sourceBeat: 'Recognize approaching collectors, phone warning and passenger escape',
          stageIds: ['warn', 'extract', 'return'],
          adaptation: 'A timed contact warning keeps Felix from surrendering the co-op key.',
        },
      ],
      stages: [
        {
          id: 'counter',
          type: 'escort-drive',
          scene: 'impound-counter',
          objective:
            'Take Felix to the impound annex and park with a view of both approach streets.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-002',
            },
            {
              type: 'parked-in-lookout-bay',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Yara can release the second taxi if I get there before the file closes.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Files do not close. People close them.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Then let me speak to the person. You watch the road.',
              when: 'always',
            },
          ],
          passengers: ['LL-CHAR-002'],
          route: {
            from: 'dispatch',
            to: 'impound-counter',
            solver: 'legal-road',
          },
        },
        {
          id: 'lookout',
          type: 'observe',
          scene: 'impound-counter',
          objective: 'Watch the two collector approaches while Felix bargains inside.',
          completion: [
            {
              type: 'identified-actor',
              actor: 'LL-ARC-REEVE',
              evidence: ['grey tow jacket', 'co-op repossession clipboard'],
            },
          ],
          dialogue: [
            {
              speaker: 'Yara',
              text: 'There are two invoices for the same release. I cannot erase either from here.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Then print them both. I want to know which thief has a printer.',
              when: 'always',
            },
          ],
          encounter: {
            actors: [
              {
                id: 'LL-ARC-REEVE',
                start: 'east approach',
                destination: 'annex door',
              },
              {
                id: 'holt-collector-watch',
                start: 'north approach',
                destination: 'taxi curb',
              },
            ],
            observationWindowSeconds: 45,
            visibleClues: true,
          },
          tutorial: ['camera-look', 'phone-contact'],
        },
        {
          id: 'warn',
          type: 'timed-phone',
          scene: 'impound-counter',
          objective: 'Call Felix before Reeve reaches the annex door.',
          completion: [
            {
              type: 'outgoing-call-delivered',
              contact: 'LL-CHAR-002',
              topic: 'collector-warning',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Grey jacket, tow badge. He is bringing your file back to you.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Yara, keep the papers. Mara, leave the engine running.',
              when: 'always',
            },
            {
              speaker: 'Yara',
              text: 'I will send the duplicates to Nadia. Go.',
              when: 'always',
            },
          ],
          clock: {
            seconds: 18,
            startsOn: 'collector-identification',
            pausesWithGame: true,
          },
          wrongContact: 'Contact menu stays open with a clear retry cue; clock continues in-world.',
          onComplete: [
            {
              type: 'actor-route',
              actor: 'LL-CHAR-002',
              to: 'taxi curb',
            },
          ],
        },
        {
          id: 'extract',
          type: 'vehicle-escape',
          scene: 'impound-counter',
          objective:
            'Let Felix board, then break the collectors’ sight without shooting the clerk or patrol.',
          completion: [
            {
              type: 'passenger-boarded',
              actor: 'LL-CHAR-002',
            },
            {
              type: 'pursuit-broken',
              group: 'holt-collectors',
              outsideLastSeen: true,
              unseenSeconds: 10,
            },
          ],
          dialogue: [
            {
              speaker: 'Reeve',
              text: 'That taxi is collateral. The man inside it is negotiable.',
              when: 'always',
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
          ],
          encounter: {
            pursuerVehicle: 'holt-tow-sedan',
            armed: false,
            adaptiveRoute: true,
          },
          escapeAdvice:
            'Show actual pursuer sight/last-seen cue; alleys provide physical cover, not an invisible completion circle.',
        },
        {
          id: 'return',
          type: 'drive-dialogue',
          scene: 'dispatch',
          objective: 'Return Felix and the surviving taxi to dispatch.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-002',
            },
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'You knew he might come.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'I thought if I could talk to the clerk first, the paper would protect us.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Paper only helps when somebody has to read it.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Nadia will. She reads everything I would rather forget.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'evidence-note',
              id: 'duplicate-impound-invoices',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'annex',
          afterStage: 'counter',
          resumeStage: 'lookout',
          snapshot: [
            'taxi-pose',
            'wallet',
            'Felix-annex',
            'collectors-approaches',
            'warning-clock',
          ],
          note: 'Lookout replay always starts before collectors enter view.',
        },
        {
          id: 'warned',
          afterStage: 'warn',
          resumeStage: 'extract',
          snapshot: ['warning-delivered', 'Felix-route', 'taxi-health', 'pursuer-pose'],
          note: 'Do not respawn Felix in the taxi before he physically boards.',
        },
      ],
      failures: [
        {
          id: 'warning-late',
          condition: {
            type: 'clock-expired',
            clock: 'warn',
          },
          resumeCheckpoint: 'annex',
          dialogue: [
            {
              speaker: 'Felix',
              text: 'They have the key, Mara. Nadia will have to reopen the release.',
              when: 'always',
            },
          ],
        },
        {
          id: 'lookout-spooked',
          condition: {
            type: 'attack-before-warning',
            group: 'holt-collectors',
          },
          resumeCheckpoint: 'annex',
          dialogue: [
            {
              speaker: 'Yara',
              text: 'They locked the annex. You made every person in here a hostage to your argument.',
              when: 'always',
            },
          ],
        },
        {
          id: 'felix-or-car-lost',
          condition: {
            type: 'escort-or-vehicle-lost',
            actor: 'LL-CHAR-002',
            grace: 25,
          },
          resumeCheckpoint: 'warned',
          dialogue: [
            {
              speaker: 'Felix',
              text: 'I needed a ride out, not a place in another report.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'warning-method',
          stage: 'warn',
          options: [
            {
              id: 'phone',
              text: 'Call Felix from the contact list.',
              effects: ['normal warning'],
            },
            {
              id: 'accessibility-hotkey',
              text: 'Use the displayed contact shortcut.',
              effects: ['same call and clock; available across keyboard/touch/controller'],
            },
          ],
          outcome: 'Equivalent accessible inputs, not separate story endings.',
        },
      ],
      consequences: [
        'Nadia receives duplicate impound invoices. Reeve recognizes Mara’s taxi.',
        'Phone contact and incoming call history become persistent.',
      ],
      rewards: {
        cash: 120,
        unlocks: ['LL-ST-003', 'contact-Felix'],
      },
      requiredCapabilities: [
        {
          id: 'phone',
          missionWork: 'Timed warning/contact selection',
        },
        {
          id: 'chase',
          missionWork: 'Tow crew sight-and-route pursuit',
        },
        {
          id: 'passengers',
          missionWork: 'Boarding while pursued',
        },
        {
          id: 'interior',
          missionWork: 'Annex window/door staging',
        },
        {
          id: 'director',
          missionWork: 'Warning failure and checkpoint clocks',
        },
      ],
    },
    {
      id: 'LL-ST-003',
      title: 'Two Seats Open',
      contact: 'LL-CHAR-002',
      source: {
        game: 'GTA IV base game',
        title: "Three's a Crowd",
        url: 'https://gta.fandom.com/wiki/Three%27s_a_Crowd',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'dispatch-threat',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Mara interrupts a second intimidation at dispatch, then collects Nadia and Tess from a closed rail entrance. A borrowed work outfit offers a small, chosen foothold in the city.',
      cast: [
        'LL-CHAR-001',
        'LL-CHAR-002',
        'LL-CHAR-008',
        'LL-CHAR-025',
        'LL-ARC-DAX',
        'LL-ARC-PEL',
        'LL-ARC-BEA',
      ],
      dependencies: {
        all: ['LL-ST-002'],
      },
      sourceBeats: [
        {
          sourceBeat:
            'Cousin threatened with a blade; protagonist disarms the collector and injures his wrist',
          stageIds: ['dispatch-threat'],
          adaptation:
            'A controlled disarm establishes Mara’s relief-security training; two collectors retreat.',
        },
        {
          sourceBeat: 'Two passengers collected at rail station and introduced; home drop',
          stageIds: ['pickup', 'home'],
          adaptation: 'Nadia introduces survey researcher Tess.',
        },
        {
          sourceBeat: 'First free clothing purchase',
          stageIds: ['workwear'],
          adaptation: 'A co-op voucher buys a selected work outfit, with persistent appearance.',
        },
      ],
      stages: [
        {
          id: 'dispatch-threat',
          type: 'melee-intervention',
          scene: 'dispatch',
          objective:
            'Disarm Dax and force both collectors away from Felix without harming co-op workers.',
          completion: [
            {
              type: 'disarmed',
              actor: 'LL-ARC-DAX',
            },
            {
              type: 'hostiles-retreated',
              actors: ['LL-ARC-DAX', 'LL-ARC-PEL'],
            },
          ],
          dialogue: [
            {
              speaker: 'Dax',
              text: 'Holt says the man who hides keys can work without hands.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Put the blade down. There are people behind you.',
              when: 'always',
            },
            {
              speaker: 'Pel',
              text: 'You think the counter makes this a public service?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'No. The people behind it do.',
              when: 'always',
            },
          ],
          encounter: {
            combatMode: 'guard-counter-disarm',
            weapon: 'utility-blade',
            disarmInjury:
              'Dax’s wrist is injured in the counter, with original animation and a saved bandage on his later appearance.',
            lethalWeaponsDisabledByObjective: false,
            surrender: 'Dax disarmed and either collector staggered; both choose retreat',
            civilians: ['dispatch-workers'],
          },
          tutorial: ['guard', 'counter', 'disarm'],
        },
        {
          id: 'pickup',
          type: 'multi-passenger-pickup',
          scene: 'boardwalk-station',
          objective: 'Collect Nadia and Tess at the street entrance to Boardwalk station.',
          completion: [
            {
              type: 'passengers-boarded',
              actors: ['LL-CHAR-008', 'LL-CHAR-025'],
              seatsRequired: 3,
            },
          ],
          dialogue: [
            {
              speaker: 'Nadia',
              text: 'The lift is shut and the stair is fenced. The announcement still says the train is on time.',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'I am Tess. I photograph drainage points. Glamorous work, if you like mud.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Mud tells you more than a brochure.',
              when: 'always',
            },
            {
              speaker: 'Nadia',
              text: 'See? You two can disappoint the same brochure together.',
              when: 'always',
            },
          ],
          vehiclePolicy:
            'Any roadworthy four-seat car; co-op taxi offered, no named destroyed-car lock.',
          boarding: {
            stopSpeedBelow: 5,
            visibleActors: true,
            approachFromSidewalk: true,
          },
        },
        {
          id: 'home',
          type: 'passenger-route',
          scene: 'tess-flat',
          objective: 'Take Tess home, then deliver Nadia to dispatch.',
          completion: [
            {
              type: 'dropoffs-complete',
              order: ['LL-CHAR-025', 'LL-CHAR-008'],
              scenes: ['tess-flat', 'dispatch'],
            },
          ],
          dialogue: [
            {
              speaker: 'Tess',
              text: 'You drove relief routes before this?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Whatever roads were still there.',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'I would like to hear how you chose them.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'That depends on why you are asking.',
              when: 'always',
            },
            {
              speaker: 'Nadia',
              text: 'Give her a quiet evening before you give her a questionnaire.',
              when: 'always',
            },
          ],
          route: {
            stops: ['boardwalk-station', 'tess-flat', 'dispatch'],
            solver: 'legal-road',
          },
          onComplete: [
            {
              type: 'contact-added',
              actor: 'LL-CHAR-025',
            },
          ],
        },
        {
          id: 'workwear',
          type: 'clothing-service',
          scene: 'pier-goods',
          objective: 'Choose a work outfit using Nadia’s co-op voucher.',
          completion: [
            {
              type: 'outfit-purchased',
              payment: 'cooperative-voucher',
              store: 'pier-goods',
            },
            {
              type: 'outfit-equipped',
            },
          ],
          dialogue: [
            {
              speaker: 'Bea',
              text: 'Nadia said you need something that dries before tomorrow.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'And does not announce where I have been.',
              when: 'always',
            },
            {
              speaker: 'Bea',
              text: 'Then pick the pockets you need. The color is your business.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'You look employed. We should take a picture for the lender.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'We should pay Bea before we pay for another picture.',
              when: 'always',
            },
          ],
          stock: ['slate-work-jacket', 'ochre-rain-shell', 'navy-coveralls'],
          voucher: {
            count: 1,
            amount: 'one listed starter outfit',
            consumedOnce: true,
          },
          onComplete: [
            {
              type: 'unlock',
              ids: ['LL-ST-004', 'LL-ST-005'],
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'pickup-ready',
          afterStage: 'dispatch-threat',
          resumeStage: 'pickup',
          snapshot: ['collector-retreat', 'wallet', 'taxi-availability', 'Nadia', 'Tess'],
          note: 'Disarm remains acknowledged on retry; no permanent trust penalty for a failed attempt.',
        },
        {
          id: 'outfit-ready',
          afterStage: 'home',
          resumeStage: 'workwear',
          snapshot: ['passenger-dropoffs', 'Tess-contact', 'voucher', 'wallet'],
          note: 'No duplicate passenger introductions or voucher creation.',
        },
      ],
      failures: [
        {
          id: 'civilian-harmed',
          condition: {
            type: 'civilian-damaged-by-player',
          },
          resumeCheckpoint: 'start',
          dialogue: [
            {
              speaker: 'Felix',
              text: 'They came to frighten my drivers. You just finished the job for them.',
              when: 'always',
            },
          ],
        },
        {
          id: 'passenger-lost',
          condition: {
            type: 'passenger-dead-or-abandoned',
            actors: ['LL-CHAR-008', 'LL-CHAR-025'],
            grace: 35,
          },
          resumeCheckpoint: 'pickup-ready',
          dialogue: [
            {
              speaker: 'Nadia',
              text: 'We needed two seats. Call when you can offer a safe ride.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'outfit',
          stage: 'workwear',
          options: [
            {
              id: 'slate-work-jacket',
              text: 'slate work jacket',
              effects: [
                {
                  type: 'equip-outfit',
                  id: 'slate-work-jacket',
                },
              ],
            },
            {
              id: 'ochre-rain-shell',
              text: 'ochre rain shell',
              effects: [
                {
                  type: 'equip-outfit',
                  id: 'ochre-rain-shell',
                },
              ],
            },
            {
              id: 'navy-coveralls',
              text: 'navy coveralls',
              effects: [
                {
                  type: 'equip-outfit',
                  id: 'navy-coveralls',
                },
              ],
            },
          ],
          outcome: 'Cosmetic identity persists across saves; none is a disguised story gate.',
        },
      ],
      consequences: [
        'Tess’s contact is unlocked without establishing automatic romance.',
        'Nadia’s free starter clothing voucher is consumed once; later purchases use money.',
      ],
      rewards: {
        cash: 0,
        unlocks: ['clothing-service', 'contact-Tess', 'LL-ST-004', 'LL-ST-005'],
      },
      requiredCapabilities: [
        {
          id: 'passengers',
          missionWork: 'Two distinct seated NPCs and dropoffs',
        },
        {
          id: 'clothing',
          missionWork: 'Three rendered original outfits and voucher',
        },
        {
          id: 'melee',
          missionWork: 'Reliable nonlethal disarm/retreat',
        },
        {
          id: 'friendship',
          missionWork: 'Contact and boundary flags',
        },
        {
          id: 'director',
          missionWork: 'Outfit persistence',
        },
      ],
    },
    {
      id: 'LL-ST-004',
      title: 'Small Hours',
      contact: 'LL-CHAR-025',
      source: {
        game: 'GTA IV base game',
        title: 'First Date',
        url: 'https://gta.fandom.com/wiki/First_Date_%28GTA_IV%29',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'invite',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Tess invites Mara to a community screening. A permit cancellation sends them bowling instead. Felix’s urgent call can interrupt the plan, and the game must respect both courses.',
      cast: ['LL-CHAR-001', 'LL-CHAR-025', 'LL-CHAR-002'],
      dependencies: {
        all: ['LL-ST-003'],
        availability:
          'Tess may call or Mara may initiate; Unpaid Interest can occur before, during the invitation, or after this outing.',
      },
      sourceBeats: [
        {
          sourceBeat: 'Invitation, cancelled attraction, companion bowling and home return',
          stageIds: ['invite', 'screening', 'bowl', 'return'],
          adaptation: 'A closed community screening redirects the evening to an actual match.',
        },
        {
          sourceBeat:
            'Cousin rescue call can supersede outing; ignoring it yields hospital aftermath',
          stageIds: ['urgent-call', 'return'],
          adaptation:
            'Mission LL-ST-005 is deferred, never deleted; two authored aftermaths and a rescheduled invitation.',
        },
        {
          sourceBeat: 'Relationship/friend outings introduced',
          stageIds: ['boundaries'],
          adaptation: 'Consent and social contact, without automatic intimacy rewards.',
        },
      ],
      stages: [
        {
          id: 'invite',
          type: 'phone-scene',
          scene: 'tess-flat',
          objective: 'Arrange the evening and collect Tess in a safe passenger vehicle.',
          completion: [
            {
              type: 'invitation-accepted',
            },
            {
              type: 'passenger-boarded',
              actor: 'LL-CHAR-025',
            },
          ],
          dialogue: [
            {
              speaker: 'Tess',
              text: 'There is a public screening at the fairground. No questionnaire, I promise.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Does the film have a happy ending?',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'I have not read the permit decision yet.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'That sounds more like the city than the film.',
              when: 'always',
            },
          ],
          mayStartBy: ['incoming-contact-call', 'outgoing-contact-call'],
        },
        {
          id: 'urgent-call',
          type: 'branch-call',
          scene: 'tess-flat',
          objective: 'Answer Felix’s emergency and choose whether to go to him now.',
          completion: [
            {
              type: 'branch-resolved',
              choice: 'evening-priority',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Mara. Promenade court. Holt’s people have the gate.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Are you hurt?',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Not enough for them, apparently.',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'If somebody needs you, go. I can choose another evening.',
              when: 'always',
            },
          ],
          enabledWhen: {
            type: 'mission-incomplete',
            id: 'LL-ST-005',
          },
          branches: [
            {
              choice: 'rescue-now',
              suspendMissionAt: 'screening',
              activate: 'LL-ST-005',
              effects: [
                {
                  type: 'passenger-disembark',
                  actor: 'LL-CHAR-025',
                  at: 'tess-flat',
                  waitForWalkHome: true,
                },
                {
                  type: 'queue-invitation',
                  actor: 'LL-CHAR-025',
                  afterMission: 'LL-ST-005',
                },
              ],
              resumption: 'New invitation at Tess’s flat after Felix reaches safety.',
            },
            {
              choice: 'keep-evening',
              next: 'screening',
              effects: [
                {
                  type: 'flag',
                  id: 'felix-rescue-deferred',
                  value: true,
                },
              ],
            },
          ],
          disabledNext: 'screening',
        },
        {
          id: 'screening',
          type: 'drive-scene',
          scene: 'fairground',
          objective: 'Reach the fairground and read the cancelled screening notice.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-025',
            },
            {
              type: 'notice-read',
              id: 'screening-permit-cancelled',
            },
          ],
          dialogue: [
            {
              speaker: 'Tess',
              text: 'The generators were approved. The audience apparently was not.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Another permit office?',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'A private events partner. They bought the right to say no.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I am not spending the evening arguing with a fence.',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'Then Blue Hour Lanes. You can argue with a ball instead.',
              when: 'always',
            },
          ],
          route: {
            from: 'tess-flat',
            to: 'fairground',
            solver: 'legal-road',
          },
        },
        {
          id: 'bowl',
          type: 'companion-activity',
          scene: 'lanes',
          objective: 'Choose an empty lane and play bowling with Tess.',
          completion: [
            {
              type: 'activity-resolved',
              kind: 'bowling',
              opponent: 'LL-CHAR-025',
              outcomes: ['completed-match', 'quit-after-start'],
            },
          ],
          dialogue: [
            {
              speaker: 'Tess',
              text: 'I warn you, my last team counted enthusiasm as a skill.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'My last team counted surviving the journey.',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'Then we can both be beginners here.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'That would be useful.',
              when: 'always',
            },
          ],
          activity: {
            kind: 'bowling',
            players: ['Mara', 'Tess'],
            frames: 10,
            fee: 10,
            sponsorIfUnaffordable: 'Tess offers, with no debt flag',
            aiSkill: 0.48,
            noVictoryRequired: true,
          },
          outcomeDialogue: {
            won: [
              {
                speaker: 'Tess',
                text: 'I will measure the drainage. You can measure the pins.',
                when: 'always',
              },
            ],
            lost: [
              {
                speaker: 'Mara',
                text: 'Good. Something in this city can still surprise me.',
                when: 'always',
              },
            ],
            quit: [
              {
                speaker: 'Tess',
                text: 'We can leave a game unfinished. It does not make the whole evening a failure.',
                when: 'always',
              },
            ],
          },
        },
        {
          id: 'return',
          type: 'drive-dialogue',
          scene: 'tess-flat',
          objective: 'Bring Tess home safely; hear the appropriate call about Felix.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-025',
            },
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Tess',
              text: 'When you said an old dispatch record, did you mean the evacuation you drove?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'One coach was sent onto a road that had already failed. Somebody changed the route after we left.',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'I am sorry.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Ask me again when we know each other better.',
              when: 'always',
            },
            {
              speaker: 'Tess',
              text: 'All right. Another evening, on your terms.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Clinic says I can leave. You could collect me, if you have finished being elsewhere.',
              when: 'felix-rescue-deferred',
            },
          ],
          onComplete: [
            {
              type: 'queue-mission',
              id: 'LL-ST-005',
              variantWhen: 'felix-rescue-deferred',
              variant: 'clinic-after-evening',
            },
          ],
        },
        {
          id: 'boundaries',
          type: 'relationship-choice',
          scene: 'tess-flat',
          objective: 'Choose how to keep in touch with Tess.',
          completion: [
            {
              type: 'branch-resolved',
              choice: 'tess-contact-boundary',
            },
          ],
          dialogue: [
            {
              speaker: 'Tess',
              text: 'Coffee, a walk, another terrible score. An invitation is an invitation.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Good. I have enough contracts.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'unlock',
              ids: ['social-invitations'],
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'collected',
          afterStage: 'invite',
          resumeStage: 'urgent-call',
          snapshot: ['Tess-seat', 'car-health', 'wallet', 'Felix-event-pending'],
          note: 'Rescue choice and suspension survive Continue.',
        },
        {
          id: 'lane',
          afterStage: 'screening',
          resumeStage: 'bowl',
          snapshot: ['Tess-location', 'cancelled-notice', 'wallet', 'fee-receipt'],
          note: 'A match snapshot resumes without another admission fee.',
        },
        {
          id: 'drive-home',
          afterStage: 'bowl',
          resumeStage: 'return',
          snapshot: ['full-bowling-session-result', 'Tess-trust', 'fee', 'Felix-deferred-flag'],
          note: 'A quit is not a bowling victory or cash reward.',
        },
      ],
      failures: [
        {
          id: 'outing-unsafe',
          condition: {
            type: 'companion-hurt-or-spooked',
            actor: 'LL-CHAR-025',
            triggers: ['player-attack', 'gunfire', 'repeated-dangerous-driving'],
          },
          resumeCheckpoint: 'collected',
          dialogue: [
            {
              speaker: 'Tess',
              text: 'Stop here. I wanted an evening, not another incident to document.',
              when: 'always',
            },
          ],
        },
        {
          id: 'car-lost',
          condition: {
            type: 'occupied-passenger-car-destroyed',
          },
          resumeCheckpoint: 'collected',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'We will arrange a safe ride before we try again.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'evening-priority',
          stage: 'urgent-call',
          options: [
            {
              id: 'rescue-now',
              text: 'Help Felix now and reschedule with Tess.',
              effects: [
                {
                  type: 'activate-mission',
                  id: 'LL-ST-005',
                  variant: 'court-rescue',
                },
              ],
            },
            {
              id: 'keep-evening',
              text: 'Continue the evening; collect Felix afterward.',
              effects: [
                {
                  type: 'flag',
                  id: 'felix-rescue-deferred',
                  value: true,
                },
                {
                  type: 'trust',
                  actor: 'LL-CHAR-002',
                  delta: -2,
                },
              ],
            },
          ],
          outcome:
            'Both retain the entire LL-ST-005 mission, with a distinct aftermath and dialogue.',
        },
        {
          id: 'tess-contact-boundary',
          stage: 'boundaries',
          options: [
            {
              id: 'friends',
              text: 'Keep this as friendship.',
              effects: [
                {
                  type: 'flag',
                  id: 'tess-relationship',
                  value: 'friends',
                },
              ],
            },
            {
              id: 'open-to-dates',
              text: 'Accept future dates without a promise.',
              effects: [
                {
                  type: 'flag',
                  id: 'tess-relationship',
                  value: 'open-to-dates',
                },
              ],
            },
          ],
          outcome: 'Both preserve story contact; future invitations and personal dialogue vary.',
        },
      ],
      consequences: [
        'Tess’s investigation remains concealed. Mara has disclosed only the changed convoy route.',
        'Felix’s untreated court encounter or clinic recovery is a persistent branch, not a removed mission.',
      ],
      rewards: {
        cash: 0,
        unlocks: ['social-invitations', 'LL-ST-006 when LL-ST-005 also complete'],
      },
      requiredCapabilities: [
        {
          id: 'friendship',
          missionWork: 'Date boundaries/invitation scheduling',
        },
        {
          id: 'activities',
          missionWork: 'Ten-frame companion bowling and quit continuation',
        },
        {
          id: 'phone',
          missionWork: 'Interrupt/defer calls',
        },
        {
          id: 'director',
          missionWork: 'Suspend/resume and braided mission order',
        },
        {
          id: 'passengers',
          missionWork: 'Tess fear and safe transport',
        },
      ],
    },
    {
      id: 'LL-ST-005',
      title: 'Unpaid Interest',
      contact: 'LL-CHAR-002',
      source: {
        game: 'GTA IV base game',
        title: 'Bleed Out',
        url: 'https://gta.fandom.com/wiki/Bleed_Out',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'clinic',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Holt’s crew traps Felix at the promenade court. Mara breaks the collectors’ grip, pursues their supervisor and finds payroll evidence on an unfinished flood-defense deck.',
      cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-ARC-DAX', 'LL-ARC-PEL', 'LL-ARC-REEVE'],
      dependencies: {
        all: ['LL-ST-003'],
        availability:
          'Urgent-call branch from LL-ST-004 or Felix’s direct contact. Clinic aftermath if the call was deferred.',
      },
      sourceBeats: [
        {
          sourceBeat: 'Urgent cousin rescue; two melee attackers',
          stageIds: ['court'],
          adaptation: 'Guard, dodge, counter and disarm protect a trapped civilian.',
        },
        {
          sourceBeat: 'Fleeing supervisor car chase then interior knife confrontation',
          stageIds: ['pursuit', 'deck', 'resolve'],
          adaptation:
            'Reeve abandons the car in a parking frame and fights with a utility blade; his fall is physically staged.',
        },
        {
          sourceBeat: 'Alternate hospital pickup if date came first; cousin return',
          stageIds: ['clinic', 'return'],
          adaptation: 'Clinic costs/trust are saved and the collectors are still confronted later.',
        },
      ],
      stages: [
        {
          id: 'clinic',
          type: 'variant-escort',
          scene: 'founders-clinic',
          objective:
            'If you deferred Felix’s call, collect him from Founders Medical Center and hear where Reeve went.',
          completion: [
            {
              type: 'passenger-collected',
              actor: 'LL-CHAR-002',
              site: 'LL-CITY-LOC083',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'They offered me a payment plan for the stitches. I almost laughed.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I should have come.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Then come now. Reeve took the drivers’ payroll book. He has gone back to the court.',
              when: 'always',
            },
          ],
          enabledWhen: {
            type: 'flag-is',
            id: 'felix-rescue-deferred',
            value: true,
          },
          onComplete: [
            {
              type: 'flag',
              id: 'felix-clinic-recovered',
              value: true,
            },
          ],
          disabledNext: 'court',
          route: {
            pickupSite: 'LL-CITY-LOC083',
            to: 'lantern-court',
          },
        },
        {
          id: 'court',
          type: 'melee-rescue',
          scene: 'lantern-court',
          objective: 'Defeat Dax and Pel using guard/counters; keep Felix and spectators safe.',
          completion: [
            {
              type: 'hostiles-neutralized',
              actors: ['LL-ARC-DAX', 'LL-ARC-PEL'],
              surrenderCounts: true,
            },
            {
              type: 'actor-safe',
              actor: 'LL-CHAR-002',
            },
          ],
          dialogue: [
            {
              speaker: 'Pel',
              text: 'Holt keeps the book until everybody signs.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Open the gate.',
              when: 'always',
            },
            {
              speaker: 'Dax',
              text: 'You gave me trouble at the office.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I gave you a chance to leave.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Mara, behind you!',
              when: 'always',
            },
          ],
          variantStaging: {
            immediate: 'Felix at court bench, collectors surround him',
            deferred:
              'Felix remains in parked car; collectors guard payroll book at the same court',
          },
          encounter: {
            actors: [
              {
                id: 'LL-ARC-DAX',
                weapon: 'baton',
                tactics: 'guard-break',
              },
              {
                id: 'LL-ARC-PEL',
                weapon: 'unarmed',
                tactics: 'flank-grapple',
              },
            ],
            neutralizedThreshold: 'unconscious or surrendered; no forced corpse',
            civilianExits: ['sea-wall gate', 'street gate'],
          },
        },
        {
          id: 'pursuit',
          type: 'car-chase',
          scene: 'old-quay-works',
          objective: 'Let Felix board, then follow Reeve’s red coupe to Old Quay Works.',
          completion: [
            {
              type: 'target-arrived',
              actor: 'LL-ARC-REEVE',
              scene: 'old-quay-works',
            },
            {
              type: 'player-followed',
              trackingGraceSeconds: 20,
            },
          ],
          dialogue: [
            {
              speaker: 'Reeve',
              text: 'You want the book? Bring the car. I can repossess both.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'He drives like every corner belongs to him.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then we will let the corners disagree.',
              when: 'always',
            },
          ],
          route: {
            from: 'lantern-court',
            to: 'old-quay-works',
            targetStyle: 'aggressive but traffic-collidable',
            failDistance: 220,
            graceSeconds: 20,
            targetNoTeleport: true,
          },
          playerVehicles:
            'Any healthy four-seat car; co-op replacement available through dispatch if destroyed before stage starts.',
          protect: ['LL-CHAR-002'],
        },
        {
          id: 'deck',
          type: 'foot-pursuit',
          scene: 'old-quay-works',
          objective:
            'Leave Felix by the entrance, climb the service stair and catch Reeve above the unfinished bays.',
          completion: [
            {
              type: 'actor-reached',
              actor: 'LL-ARC-REEVE',
              floor: 36,
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'I am staying where the concrete is finished.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Lock the doors. If I shout, call Nadia.',
              when: 'always',
            },
            {
              speaker: 'Reeve',
              text: 'This deck was certified. Same office as your little co-op.',
              when: 'always',
            },
          ],
          route: {
            mode: 'foot',
            ordered: ['grade service gate', '18-unit stair landing', '36-unit parking deck'],
            hazards: ['unfinished curb', 'open service shaft'],
          },
          target: {
            weapon: 'utility-blade',
            evadeUntil: 'deck confrontation',
          },
        },
        {
          id: 'resolve',
          type: 'melee-evidence',
          scene: 'old-quay-works',
          objective: 'Survive Reeve’s knife attack and recover the payroll book.',
          completion: [
            {
              type: 'hostile-neutralized',
              actor: 'LL-ARC-REEVE',
            },
            {
              type: 'evidence-collected',
              id: 'drivers-payroll-book',
            },
          ],
          dialogue: [
            {
              speaker: 'Reeve',
              text: 'Nobody reads the signatures. They pay for the silence underneath.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Whose silence?',
              when: 'always',
            },
            {
              speaker: 'Reeve',
              text: 'Ask Senn. Ask the man who bought your cousin’s route.',
              when: 'always',
            },
          ],
          encounter: {
            duel: 'counter/disarm or ordinary damage',
            staging:
              'Reeve backs across a broken edge during his final attack; fatal fall follows a real supported floor edge, not a menu execution.',
            allowPlayerNonlethal:
              'If disarmed before the edge, Reeve survives but escapes custody later; evidence and contractor threat remain.',
          },
          onComplete: [
            {
              type: 'evidence-note',
              id: 'senn-payroll-connection',
            },
          ],
        },
        {
          id: 'return',
          type: 'escort-drive',
          scene: 'dispatch',
          objective: 'Bring Felix and the payroll book back to dispatch.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-002',
            },
            {
              type: 'evidence-secured',
              id: 'drivers-payroll-book',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'I thought one bad contract would be smaller than losing the co-op.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'It brought them into every driver’s wages.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Give the book to Nadia. I cannot read another name tonight.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then rest. Tomorrow we make it belong to the drivers again.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'court-ready',
          afterStage: 'clinic',
          resumeStage: 'court',
          snapshot: ['Felix-variant', 'clinic-receipt', 'wallet', 'court-actors'],
          note: 'Direct rescue uses an equivalent start snapshot without a clinic fee.',
        },
        {
          id: 'chase-ready',
          afterStage: 'court',
          resumeStage: 'pursuit',
          snapshot: ['court-outcome', 'Felix-health-seat', 'Reeve-car', 'player-car'],
          note: 'Replacement rides are real boarded cars, not named-vehicle deadlocks.',
        },
        {
          id: 'deck-entry',
          afterStage: 'pursuit',
          resumeStage: 'deck',
          snapshot: ['both-car-poses', 'Felix-safe', 'Reeve-foot-route', 'health-ammo'],
          note: 'Restore Reeve before the stair, preserving player equipment at arrival.',
        },
      ],
      failures: [
        {
          id: 'felix-lost',
          condition: {
            type: 'actor-dead-or-abandoned',
            actor: 'LL-CHAR-002',
            grace: 30,
          },
          resumeCheckpoint: 'court-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Felix! Nadia, send someone to the court.',
              when: 'always',
            },
          ],
        },
        {
          id: 'reeve-escaped',
          condition: {
            type: 'target-lost',
            actor: 'LL-ARC-REEVE',
            grace: 20,
          },
          resumeCheckpoint: 'chase-ready',
          dialogue: [
            {
              speaker: 'Felix',
              text: 'He has the names. We cannot let him sell them.',
              when: 'always',
            },
          ],
        },
        {
          id: 'book-destroyed',
          condition: {
            type: 'objective-destroyed',
            id: 'drivers-payroll-book',
          },
          resumeCheckpoint: 'deck-entry',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Without the names, we cannot undo what he signed.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'reeve-outcome',
          stage: 'resolve',
          options: [
            {
              id: 'disarm-early',
              text: 'Counter and disarm him before the ledge.',
              effects: [
                {
                  type: 'flag',
                  id: 'reeve-fate',
                  value: 'survived',
                },
              ],
            },
            {
              id: 'fatal-fall',
              text: 'Survive the fight as it reaches the broken edge.',
              effects: [
                {
                  type: 'flag',
                  id: 'reeve-fate',
                  value: 'dead',
                },
              ],
            },
          ],
          outcome:
            'An original tactical outcome, additional to the mapped mandatory fight; both retain the payroll evidence and next arc.',
        },
      ],
      consequences: [
        'Felix’s date-deferred clinic variant is remembered in personal dialogue.',
        'Nadia receives the payroll book; Senn’s insurance scheme becomes a named lead.',
      ],
      rewards: {
        cash: 200,
        unlocks: ['LL-ST-006 when LL-ST-004 complete', 'Felix-outings'],
      },
      requiredCapabilities: [
        {
          id: 'melee',
          missionWork: 'Two-person tutorial and knife disarm',
        },
        {
          id: 'chase',
          missionWork: 'Car-to-foot pursuit handoff',
        },
        {
          id: 'passengers',
          missionWork: 'Felix safely waits and rides',
        },
        {
          id: 'vertical',
          missionWork: 'Real stairs/deck edge/fall',
        },
        {
          id: 'director',
          missionWork: 'Clinic/date variants and evidence',
        },
        {
          id: 'cinematic',
          missionWork: 'Original supported fall/rescue outcome',
        },
      ],
    },
    {
      id: 'LL-ST-006',
      title: 'Unmarked Fare',
      contact: 'LL-CHAR-002',
      source: {
        game: 'GTA IV base game',
        title: 'Easy Fare',
        url: 'https://gta.fandom.com/wiki/Easy_Fare',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'fare',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Nora Keel hires a taxi to recover a relief manifest before its bonded shed is emptied. A corrupt patrol treats the archive crate as contraband.',
      cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-ARC-NORA', 'saira-bell'],
      dependencies: {
        all: ['LL-ST-004', 'LL-ST-005'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Passenger collected for yard retrieval; two-star police ambush',
          stageIds: ['fare', 'retrieve', 'escape'],
          adaptation: 'Relief archive crate replaces stolen consumer electronics.',
        },
        {
          sourceBeat: 'Wanted escape, repair/respray introduction and passenger delivery',
          stageIds: ['garage', 'archive'],
          adaptation: 'Real loss of sight precedes a once-funded garage tutorial.',
        },
      ],
      stages: [
        {
          id: 'fare',
          type: 'taxi-pickup',
          scene: 'dispatch',
          objective: 'Collect Nora Keel in a roadworthy taxi.',
          completion: [
            {
              type: 'passenger-boarded',
              actor: 'LL-ARC-NORA',
              vehicleRole: 'taxi',
            },
          ],
          dialogue: [
            {
              speaker: 'Nora',
              text: 'Pier Eight. Shed C. They have marked the records for auction.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Records of what?',
              when: 'always',
            },
            {
              speaker: 'Nora',
              text: 'Every relief vehicle that entered this port. Including the ones the city says never arrived.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'No meter on this one. Bring her back with the papers.',
              when: 'always',
            },
          ],
        },
        {
          id: 'retrieve',
          type: 'cargo-pickup',
          scene: 'manifest-yard',
          objective:
            'Wait for Nora to collect the sealed manifest crate, then let her return to the taxi.',
          completion: [
            {
              type: 'cargo-loaded',
              id: 'relief-manifest-crate',
            },
            {
              type: 'passenger-boarded',
              actor: 'LL-ARC-NORA',
            },
          ],
          dialogue: [
            {
              speaker: 'Nora',
              text: 'There. I left a duplicate under the shelf years ago.',
              when: 'always',
            },
            {
              speaker: 'Patrol',
              text: 'Step away from the archive. This is a secured seizure.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The seizure notice is dated tomorrow.',
              when: 'always',
            },
            {
              speaker: 'Nora',
              text: 'They always gave themselves time to make it legal.',
              when: 'always',
            },
          ],
          staging:
            'Patrol enters by a real yard gate after Nora opens the crate locker; warning lights and vehicle movement precede pursuit.',
          onComplete: [
            {
              type: 'wanted-at-least',
              level: 2,
              cause: 'contested archive seizure',
            },
          ],
        },
        {
          id: 'escape',
          type: 'wanted-escape',
          scene: 'manifest-yard',
          objective:
            'Keep Nora and the crate safe; break police sight and leave the active search perimeter.',
          completion: [
            {
              type: 'wanted-zero',
            },
            {
              type: 'passenger-alive',
              actor: 'LL-ARC-NORA',
            },
            {
              type: 'cargo-intact',
              id: 'relief-manifest-crate',
            },
          ],
          dialogue: [
            {
              speaker: 'Nora',
              text: 'They only need to burn one box. We need to get it somewhere people can read it.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Watch the patrol lights. When they lose sight, we leave where they last saw us.',
              when: 'always',
            },
          ],
          tutorial: ['observed-versus-searching', 'last-seen-perimeter', 'concealment'],
          routePolicy: 'Open legal escape; no mandatory death funnel or scripted wanted reset.',
        },
        {
          id: 'garage',
          type: 'repair-tutorial',
          scene: 'garage',
          objective:
            'Use Nora’s emergency voucher at Saira’s garage; inspect repair and respray options.',
          completion: [
            {
              type: 'vehicle-service-completed',
              repair: true,
              resprayTutorialViewed: true,
            },
          ],
          dialogue: [
            {
              speaker: 'Saira',
              text: 'An archivist in a taxi with patrol marks. Felix keeps finding economical work.',
              when: 'always',
            },
            {
              speaker: 'Nora',
              text: 'Emergency records fund. This receipt will be honest, at least.',
              when: 'always',
            },
            {
              speaker: 'Saira',
              text: 'A new coat can confuse a plate reader. It cannot hide you from somebody watching the door.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then we arrive after they stop watching.',
              when: 'always',
            },
          ],
          fee: {
            payer: 'archive-emergency-voucher',
            amount: 120,
            once: true,
          },
          entryAllowed: 'Only unseen, not observed by police; no magical repair immunity.',
          onComplete: [
            {
              type: 'unlock',
              ids: ['repair-service', 'respray-service'],
            },
          ],
        },
        {
          id: 'archive',
          type: 'passenger-delivery',
          scene: 'tomas-cafe',
          objective: 'Deliver Nora and the archive crate to the cafe’s community document room.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-ARC-NORA',
            },
            {
              type: 'evidence-secured',
              id: 'relief-manifest-crate',
            },
          ],
          dialogue: [
            {
              speaker: 'Nora',
              text: 'I can copy the ledger here. Tomas has a generator that belongs to the neighborhood.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Look for a coach diverted after dispatch. Coastal route, six years ago.',
              when: 'always',
            },
            {
              speaker: 'Nora',
              text: 'That request has come from other people. Not all of them wanted an answer.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Tell me before you give it to them.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'contact-added',
              actor: 'LL-CHAR-003',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'yard',
          afterStage: 'fare',
          resumeStage: 'retrieve',
          snapshot: ['Nora-seat', 'taxi-pose-health', 'crate-locker', 'wallet'],
          note: 'Patrol event is pending, not already shooting on restore.',
        },
        {
          id: 'garage-ready',
          afterStage: 'escape',
          resumeStage: 'garage',
          snapshot: ['wanted-zero', 'crate', 'Nora', 'taxi-health', 'voucher'],
          note: 'Retain real escape result; voucher cannot multiply.',
        },
        {
          id: 'archive-ready',
          afterStage: 'garage',
          resumeStage: 'archive',
          snapshot: ['service-receipt', 'crate', 'taxi', 'Nora'],
          note: 'Continue charges no second service fee.',
        },
      ],
      failures: [
        {
          id: 'fare-lost',
          condition: {
            type: 'passenger-dead-or-abandoned',
            actor: 'LL-ARC-NORA',
            grace: 30,
          },
          resumeCheckpoint: 'yard',
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Nora trusted a co-op driver. We need to be worth that.',
              when: 'always',
            },
          ],
        },
        {
          id: 'crate-lost',
          condition: {
            type: 'objective-destroyed-or-left',
            id: 'relief-manifest-crate',
          },
          resumeCheckpoint: 'yard',
          dialogue: [
            {
              speaker: 'Nora',
              text: 'Those are people’s names, Mara. Go back before they burn them.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'respray',
          stage: 'garage',
          options: [
            {
              id: 'retain-coop-color',
              text: 'Repair and retain the taxi’s co-op colors.',
              effects: ['No new disguise; repair tutorial still complete'],
            },
            {
              id: 'temporary-slate',
              text: 'Use a temporary slate respray.',
              effects: [
                {
                  type: 'vehicle-color',
                  id: 'current-taxi',
                  color: 'slate',
                },
              ],
            },
          ],
          outcome:
            'Original optional appearance; neither bypasses observed police or substitutes for escape.',
        },
      ],
      consequences: [
        'Nora begins investigating the altered evacuation dispatch.',
        'Repair/respray and legitimate optional taxi work are unlocked; Tomas becomes a contact.',
      ],
      rewards: {
        cash: 300,
        unlocks: ['LL-ST-007', 'LL-ST-009', 'taxi-fares', 'vehicle-services'],
      },
      requiredCapabilities: [
        {
          id: 'passengers',
          missionWork: 'Nora walks/boards with archive crate',
        },
        {
          id: 'police',
          missionWork: 'Yard patrol trigger and real escape',
        },
        {
          id: 'props',
          missionWork: 'Serializable mission cargo',
        },
        {
          id: 'driving',
          missionWork: 'Taxi service voucher',
        },
        {
          id: 'wash',
          missionWork: 'Respray identity service distinct from car wash',
        },
        {
          id: 'director',
          missionWork: 'Cargo and transaction persistence',
        },
      ],
    },
    {
      id: 'LL-ST-007',
      title: 'After the Siren',
      contact: 'LL-CHAR-003',
      source: {
        game: 'GTA IV base game',
        title: 'Jamaican Heat',
        url: 'https://gta.fandom.com/wiki/Jamaican_Heat',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'meet',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Tomas asks Mara to watch a generator exchange from a service landing. Three profiteers and a roof gunman turn the deal into an ambush.',
      cast: ['LL-CHAR-001', 'LL-CHAR-003', 'LL-ARC-SOL'],
      dependencies: {
        all: ['LL-ST-006'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Companion pickup, handgun supply and elevated lookout',
          stageIds: ['meet', 'landing'],
          adaptation: 'Protect a community generator exchange from a real vantage.',
        },
        {
          sourceBeat: 'Three ground attackers plus rooftop threat; companion protection and return',
          stageIds: ['ambush', 'return'],
          adaptation: 'Four distinct combat positions and extraction unlock Tomas’s delivery work.',
        },
      ],
      stages: [
        {
          id: 'meet',
          type: 'escort-equipment',
          scene: 'tomas-cafe',
          objective:
            'Meet Tomas, accept or inspect his loaned handgun, and drive him to the exchange.',
          completion: [
            {
              type: 'companion-collected',
              actor: 'LL-CHAR-003',
            },
            {
              type: 'equipment-ready',
              role: 'pistol',
              minimumRounds: 90,
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'Two generators. Every shelter on the south route has already paid for them once.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then why pay again?',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Because people cannot charge an insulin fridge with a principle.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I will watch the exchange. You choose when to leave.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Take this Pier Nine. Keep it down unless somebody makes that impossible.',
              when: 'always',
            },
          ],
          equipment: {
            loanWeapon: 'pistol',
            rounds: 150,
            receipt: 'Tomas-loan',
            ownedEquivalentAllowed: true,
          },
          route: {
            from: 'tomas-cafe',
            to: 'battery-exchange',
          },
        },
        {
          id: 'landing',
          type: 'overwatch-position',
          scene: 'battery-exchange',
          objective: 'Climb the service landing and find a clear view of Tomas and the roofline.',
          completion: [
            {
              type: 'position-held',
              volume: '12-unit lookout landing',
              seconds: 2,
            },
            {
              type: 'companion-at-exchange',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'Do not stand over me. Let them think this is one foolish mechanic.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You are making a persuasive case.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'The foolishness is negotiable. The generators are not.',
              when: 'always',
            },
          ],
          tutorial: ['aim', 'height-aware-sight', 'reload', 'ally-marker'],
          geometry: 'Landing has cover and two visible steps; no automatic camera teleport.',
        },
        {
          id: 'ambush',
          type: 'overwatch-combat',
          scene: 'battery-exchange',
          objective: 'Protect Tomas from the three yard attackers and the gunman on the roof.',
          completion: [
            {
              type: 'hostiles-neutralized',
              group: 'exchange-ambush',
              count: 4,
            },
            {
              type: 'actor-alive',
              actor: 'LL-CHAR-003',
            },
          ],
          dialogue: [
            {
              speaker: 'Profiteer',
              text: 'Your tender was cancelled. Hand over the cash.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Then give me the cancellation in writing.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Tomas, behind the generator! Roof on your left!',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'I see him. Keep that landing.',
              when: 'always',
            },
          ],
          encounter: {
            waves: [
              {
                trigger: 'exchange price dispute',
                actors: [
                  {
                    id: 'exchange-front',
                    role: 'pistol',
                    start: 'front alley',
                  },
                  {
                    id: 'exchange-flank',
                    role: 'pistol',
                    start: 'west corner',
                  },
                  {
                    id: 'exchange-loader',
                    role: 'pistol',
                    start: 'rear loading door',
                  },
                ],
              },
              {
                trigger: 'first attacker neutralized or 8 seconds',
                actors: [
                  {
                    id: 'exchange-roof',
                    role: 'pistol',
                    z: 30,
                    start: 'opposite roof',
                  },
                ],
              },
            ],
            ally: {
              id: 'LL-CHAR-003',
              cover: 'generator crate',
              canBeDamaged: true,
            },
            collateral: 'Housing occupants remain behind screened windows, not enemy targets.',
          },
        },
        {
          id: 'return',
          type: 'companion-extraction',
          scene: 'tomas-cafe',
          objective: 'Collect Tomas and return to the cafe after any police search is over.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-003',
            },
            {
              type: 'wanted-zero',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'They took the generators out before we came. Empty housings, fresh paint.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Who knew the shelter would pay anyway?',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'A supplier at the boiler house. I hoped the people here were simply greedy.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'It takes planning to sell nothing twice.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'If you still want work, mine is moving things people actually need.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'unlock',
              ids: ['Tomas-deliveries', 'LL-ST-008'],
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'lookout-ready',
          afterStage: 'meet',
          resumeStage: 'landing',
          snapshot: ['loan-weapon-ammo', 'Tomas-health', 'vehicle-pose', 'wallet'],
          note: 'Never grants a second pistol/ammunition loan on restore.',
        },
        {
          id: 'exchange-ready',
          afterStage: 'landing',
          resumeStage: 'ambush',
          snapshot: ['player-landing', 'Tomas-cover', 'four-hostile-spawns', 'ammo-health'],
          note: 'Roof attacker cannot spawn inside the player’s cover volume.',
        },
      ],
      failures: [
        {
          id: 'tomas-killed',
          condition: {
            type: 'actor-dead',
            actor: 'LL-CHAR-003',
          },
          resumeCheckpoint: 'exchange-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Tomas! Someone call the clinic!',
              when: 'always',
            },
          ],
        },
        {
          id: 'abandoned-overwatch',
          condition: {
            type: 'ally-abandoned-during-combat',
            actor: 'LL-CHAR-003',
            grace: 20,
          },
          resumeCheckpoint: 'exchange-ready',
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'Mara, I cannot watch four doors from one crate.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'loan',
          stage: 'meet',
          options: [
            {
              id: 'loan-pier-nine',
              text: 'Accept Tomas’s pistol loan.',
              effects: [
                {
                  type: 'loan-equipment',
                  role: 'pistol',
                  rounds: 150,
                },
              ],
            },
            {
              id: 'use-owned',
              text: 'Use an owned handgun with sufficient ammunition.',
              effects: ['Same combat, no redundant gun grant'],
            },
          ],
          outcome:
            'Both keep the firearm tutorial; restitution dialogue follows the inventory receipt.',
        },
      ],
      consequences: [
        'Mara learns the relief tender fraud involves counterfeit equipment.',
        'Tomas’s community delivery contact opens; no friend discount is granted before a relationship system exists.',
      ],
      rewards: {
        cash: 350,
        unlocks: ['LL-ST-008', 'Tomas-deliveries'],
      },
      requiredCapabilities: [
        {
          id: 'firearms',
          missionWork: 'Four height-aware hostiles and ally cover AI',
        },
        {
          id: 'passengers',
          missionWork: 'Tomas drive/exit/extract',
        },
        {
          id: 'vertical',
          missionWork: 'Lookout landing and roof attacker',
        },
        {
          id: 'director',
          missionWork: 'Equipment loan ledger',
        },
        {
          id: 'police',
          missionWork: 'Natural shot witness/escape',
        },
      ],
    },
    {
      id: 'LL-ST-008',
      title: 'Boiler Rooms',
      contact: 'LL-CHAR-003',
      source: {
        game: 'GTA IV base game',
        title: 'Concrete Jungle',
        url: 'https://gta.fandom.com/wiki/Concrete_Jungle',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'deal',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'A supplier offers replacement generators and instead tries to rob Tomas. The fleeing crew leads to a workshop where Mara must breach carefully and recover usable stock.',
      cast: ['LL-CHAR-001', 'LL-CHAR-003', 'LL-ARC-SOL'],
      dependencies: {
        all: ['LL-ST-007'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Companion deals at front while player guards rear; three fleeing enemies',
          stageIds: ['deal', 'rear', 'runners'],
          adaptation: 'A replacement-parts exchange becomes a coordinated robbery.',
        },
        {
          sourceBeat:
            'Regroup, second house approach, door cover, window shot, two interior enemies',
          stageIds: ['regroup', 'breach', 'workshop'],
          adaptation:
            'All four interior positions have collision/sight volumes; shotgun and medical pickup retained.',
        },
        {
          sourceBeat: 'Companion return and next tail mission unlock',
          stageIds: ['return'],
          adaptation: 'The supplier’s delivery runner becomes an investigative lead.',
        },
      ],
      stages: [
        {
          id: 'deal',
          type: 'companion-drive',
          scene: 'battery-exchange',
          objective: 'Drive Tomas to the replacement-parts seller and let him enter by the front.',
          completion: [
            {
              type: 'companion-entered',
              actor: 'LL-CHAR-003',
              entrance: 'front',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'Sol says yesterday was a subcontractor’s mistake.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'A mistake with four guns.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'I am not going in because I believe him. I am going in because the shelters still need power.',
              when: 'always',
            },
          ],
        },
        {
          id: 'rear',
          type: 'rear-guard',
          scene: 'battery-exchange',
          objective: 'Drive around to the rear alley and keep the exit vehicle available.',
          completion: [
            {
              type: 'vehicle-positioned',
              bay: 'rear-guard',
              engineReady: true,
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'Keep the car. If someone runs out with the payment, stop them.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'And if you run out?',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Do not stop me.',
              when: 'always',
            },
          ],
          route:
            'A physically drivable block loop connects front to rear; no turn through a solid building.',
        },
        {
          id: 'runners',
          type: 'moving-ambush',
          scene: 'battery-exchange',
          objective: 'Stop the three armed runners before they leave with Tomas’s payment.',
          completion: [
            {
              type: 'hostiles-neutralized',
              group: 'payment-runners',
              count: 3,
            },
            {
              type: 'evidence-collected',
              id: 'generator-payment-bag',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'No parts. They pulled a gun. Three are coming out your door.',
              when: 'always',
            },
            {
              speaker: 'Runner',
              text: 'Get to the street!',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Drop the bag and you can stop running.',
              when: 'always',
            },
          ],
          encounter: {
            actors: [
              {
                id: 'runner-bag',
                weapon: 'pistol',
                destination: 'street sedan',
                carries: 'generator-payment-bag',
              },
              {
                id: 'runner-left',
                weapon: 'pistol',
                destination: 'canal corner',
              },
              {
                id: 'runner-right',
                weapon: 'pistol',
                destination: 'street sedan',
              },
            ],
            surrenderCounts: true,
            vehicleOrFootCombatAllowed: true,
            escapeGraceSeconds: 20,
          },
        },
        {
          id: 'regroup',
          type: 'escort-escape',
          scene: 'boiler-house',
          objective:
            'Collect Tomas, lose any witnessed wanted level, then reach the boiler-house supplier.',
          completion: [
            {
              type: 'wanted-zero',
            },
            {
              type: 'companion-at-scene',
              actor: 'LL-CHAR-003',
              scene: 'boiler-house',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'They called Sol before they tried it. He is at the boiler house.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You are not going through another door alone.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Then teach me which side of the door belongs to us.',
              when: 'always',
            },
          ],
          route: {
            from: 'battery-exchange',
            to: 'boiler-house',
          },
        },
        {
          id: 'breach',
          type: 'cover-breach',
          scene: 'boiler-house',
          objective:
            'Take cover at the stoop; clear the stair gunman and the shotgun threat visible through the side window.',
          completion: [
            {
              type: 'hostiles-neutralized',
              actors: ['boiler-stair', 'boiler-window'],
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Stay against the wall. Do not cross the doorway until we see the stair.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Window on the right. There is a workbench behind it.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I have the angle. Keep the door covered.',
              when: 'always',
            },
          ],
          encounter: {
            actors: [
              {
                id: 'boiler-stair',
                weapon: 'pistol',
                z: 18,
                cover: 'stair return',
              },
              {
                id: 'boiler-window',
                weapon: 'shotgun',
                cover: 'bench behind side window',
              },
            ],
            windowRayMustMatchCollision: true,
          },
          tutorial: ['cover-enter', 'peek', 'reposition-to-window'],
        },
        {
          id: 'workshop',
          type: 'interior-combat-recovery',
          scene: 'boiler-house',
          objective:
            'Advance with Tomas, clear the two remaining workshop guards and inspect the generators.',
          completion: [
            {
              type: 'hostiles-neutralized',
              actors: ['boiler-kitchen', 'boiler-sol'],
            },
            {
              type: 'cargo-identified',
              id: 'working-generator-pair',
            },
          ],
          dialogue: [
            {
              speaker: 'Sol',
              text: 'You are taking inventory from a licensed contractor.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Those licenses did not keep the lights on.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Put the gun down. The machines are going back to the shelters.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Serial plates have been filed off. Somebody wanted them to disappear twice.',
              when: 'always',
            },
          ],
          encounter: {
            actors: [
              {
                id: 'boiler-kitchen',
                weapon: 'pistol',
                cover: 'kitchen half-wall',
              },
              {
                id: 'boiler-sol',
                cast: 'LL-ARC-SOL',
                weapon: 'pistol',
                cover: 'boiler manifold',
              },
            ],
            allyCanBeHurt: true,
          },
          pickups: [
            {
              id: 'boiler-shotgun',
              from: 'boiler-window',
              role: 'shotgun',
            },
            {
              id: 'boiler-medical-kit',
              at: 'kitchen table',
              optional: true,
            },
          ],
          onComplete: [
            {
              type: 'evidence-note',
              id: 'filed-generator-serials',
            },
          ],
        },
        {
          id: 'return',
          type: 'companion-delivery',
          scene: 'tomas-cafe',
          objective: 'Bring Tomas and the recovered generator claim documents back to the cafe.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-003',
            },
            {
              type: 'evidence-secured',
              id: 'generator-claim-documents',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'I will bring a proper flatbed. Today we keep the claim papers safe.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Somebody still has to explain who gave Sol that license.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'His runner takes batteries to a flat by the canal. Watch her, not the advertisement on the van.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'rear-ready',
          afterStage: 'rear',
          resumeStage: 'runners',
          snapshot: ['guard-car', 'Tomas-front', 'runners', 'payment-bag', 'wallet'],
          note: 'The three runners begin inside the actual rear door.',
        },
        {
          id: 'house-ready',
          afterStage: 'regroup',
          resumeStage: 'breach',
          snapshot: ['Tomas-health', 'payment-bag', 'wanted-zero', 'player-ammo-health'],
          note: 'The second battle is independently restartable.',
        },
        {
          id: 'inside',
          afterStage: 'breach',
          resumeStage: 'workshop',
          snapshot: [
            'cleared-two-guards',
            'Tomas-pose',
            'remaining-two-guards',
            'shotgun-pickup',
            'health-ammo',
          ],
          note: 'Clearance and optional pickups cannot respawn for farming.',
        },
      ],
      failures: [
        {
          id: 'payment-escaped',
          condition: {
            type: 'objective-carrier-escaped',
            id: 'runner-bag',
            grace: 20,
          },
          resumeCheckpoint: 'rear-ready',
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'That payment came from people who cannot pay a third time.',
              when: 'always',
            },
          ],
        },
        {
          id: 'companion-killed',
          condition: {
            type: 'actor-dead',
            actor: 'LL-CHAR-003',
          },
          resumeCheckpoint: 'house-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Tomas, stay down. I am coming.',
              when: 'always',
            },
          ],
        },
        {
          id: 'generator-destroyed',
          condition: {
            type: 'objective-destroyed',
            id: 'working-generator-pair',
          },
          resumeCheckpoint: 'inside',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'We came to restore power. Burning the machines restores nothing.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'runner-force',
          stage: 'runners',
          options: [
            {
              id: 'accept-surrender',
              text: 'Accept any runner’s surrender.',
              effects: [
                {
                  type: 'flag',
                  id: 'boiler-surviving-witness',
                  value: true,
                },
              ],
            },
            {
              id: 'armed-resistance',
              text: 'Fight runners who keep shooting.',
              effects: ['Ordinary lethal combat; payment retrieval still required'],
            },
          ],
          outcome:
            'Adds witness testimony if a real surrender occurs; does not skip either battle.',
        },
      ],
      consequences: [
        'The generators become a later logistics objective; no invisible cargo delivery is claimed.',
        'Serial filing links emergency contractors to inventory fraud; Second Shift becomes available in the parallel Tomas strand.',
      ],
      rewards: {
        cash: 450,
        unlocks: ['LL-ST-019', 'shotgun-role'],
      },
      requiredCapabilities: [
        {
          id: 'chase',
          missionWork: 'Three armed runners and escape endpoints',
        },
        {
          id: 'interior',
          missionWork: 'Stair/window/kitchen workshop',
        },
        {
          id: 'firearms',
          missionWork: 'Companion cover and shotgun pickup',
        },
        {
          id: 'props',
          missionWork: 'Payment/evidence/cargo safety',
        },
        {
          id: 'director',
          missionWork: 'Two distinct battle checkpoints',
        },
      ],
    },
    {
      id: 'LL-ST-009',
      title: 'Glass Tax',
      contact: 'LL-CHAR-009',
      source: {
        game: 'GTA IV base game',
        title: 'Bull in a China Shop',
        url: 'https://gta.fandom.com/wiki/Bull_in_a_China_Shop',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'order',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Victor claims Bea’s protection premium is overdue. He wants a broken window to make his invoice persuasive; Bea has a receipt that proves the policy never existed.',
      cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-ARC-BEA', 'LL-CHAR-043'],
      dependencies: {
        all: ['LL-ST-006'],
        availability:
          'Parallel Victor strand; Tomas’s later jobs are not artificial prerequisites.',
      },
      sourceBeats: [
        {
          sourceBeat: 'Debt order, taxi travel introduction and shopkeeper refusal',
          stageIds: ['order', 'ride', 'ask'],
          adaptation: 'A fraudulent insurance levy targets the workwear store already visited.',
        },
        {
          sourceBeat:
            'Retrieve throwable object, break a window without killing owner and return payment',
          stageIds: ['glass', 'receipt', 'return'],
          adaptation: 'A safe display pane and proof of fraud replace copied threats/dialogue.',
        },
      ],
      stages: [
        {
          id: 'order',
          type: 'contact-scene',
          scene: 'quay-meeting',
          objective: 'Hear Victor’s collection terms and take the written invoice.',
          completion: [
            {
              type: 'objective-received',
              id: 'senn-premium-invoice',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'Your cousin keeps an expensive family. A small errand settles the account.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'What account?',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Pier Goods. Bea pays to remain protected from interruption.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'And you are the interruption.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'I am the man who can explain it to an insurer.',
              when: 'always',
            },
          ],
        },
        {
          id: 'ride',
          type: 'taxi-travel-tutorial',
          scene: 'pier-goods',
          objective: 'Reach Pier Goods; hail Amin’s taxi or use your own vehicle.',
          completion: [
            {
              type: 'scene-reached',
              scene: 'pier-goods',
            },
            {
              type: 'taxi-ride-tutorial-viewed',
            },
          ],
          dialogue: [
            {
              speaker: 'Amin',
              text: 'Flag a car with an empty light. Tell us the destination before you insult the meter.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'What if I drive myself?',
              when: 'always',
            },
            {
              speaker: 'Amin',
              text: 'Then you can insult your own meter. It costs less.',
              when: 'always',
            },
          ],
          transportOptions: ['hail/riding taxi with visible fare', 'player-driven car', 'walk'],
          tutorialNoForcedFee: true,
        },
        {
          id: 'ask',
          type: 'intimidation-dialogue',
          scene: 'pier-goods',
          objective: 'Show Bea the premium invoice and hear her refusal.',
          completion: [
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Bea',
              text: 'I paid for six months. The underwriter says there is no policy number.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Victor sent me to collect.',
              when: 'always',
            },
            {
              speaker: 'Bea',
              text: 'Then collect an answer. I have people changing clothes in here, not hostages.',
              when: 'always',
            },
          ],
        },
        {
          id: 'glass',
          type: 'object-throw',
          scene: 'pier-goods',
          objective:
            'Pick up a street bottle and throw it through the empty display pane without hurting Bea or customers.',
          completion: [
            {
              type: 'prop-collected',
              id: 'street-bottle',
            },
            {
              type: 'glass-broken-by-throw',
              id: 'empty-display-pane',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'A pane is cheaper than a premium. Show her the arithmetic.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Everybody away from the display.',
              when: 'always',
            },
            {
              speaker: 'Bea',
              text: 'So that is what your protection protects against.',
              when: 'always',
            },
          ],
          props: [
            {
              id: 'street-bottle',
              material: 'glass',
              pickup: 'public bin',
            },
            {
              id: 'empty-display-pane',
              destructible: true,
              shardSafetyVolume: 'display bay only',
            },
          ],
          forbiddenSubstitutes: [
            'gunshot pane completion',
            'shopkeeper death',
            'menu acknowledge without physical throw',
          ],
          aimPreview: 'Real projectile arc and pane hit volume.',
        },
        {
          id: 'receipt',
          type: 'evidence-payment',
          scene: 'pier-goods',
          objective:
            'Take Bea’s payment envelope and preserve the false-policy receipt she includes.',
          completion: [
            {
              type: 'objective-received',
              ids: ['premium-envelope', 'false-policy-receipt'],
            },
          ],
          dialogue: [
            {
              speaker: 'Bea',
              text: 'Here. This pays the invoice. That slip proves he cannot sell what he broke.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I will keep a copy.',
              when: 'always',
            },
            {
              speaker: 'Bea',
              text: 'Keep the original. I kept copies before you arrived.',
              when: 'always',
            },
          ],
        },
        {
          id: 'return',
          type: 'contact-delivery',
          scene: 'quay-meeting',
          objective: 'Deliver the envelope to Victor without handing over Bea’s evidence.',
          completion: [
            {
              type: 'payment-delivered',
              id: 'premium-envelope',
            },
            {
              type: 'evidence-retained',
              id: 'false-policy-receipt',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'See? An honest conversation.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Nothing honest happened at that window.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'She paid. The city recognizes that kind of truth.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then it will recognize the receipt too.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'shop',
          afterStage: 'ride',
          resumeStage: 'ask',
          snapshot: ['invoice', 'wallet', 'taxi-fare-receipt', 'Bea-alive', 'unbroken-pane'],
          note: 'Transport choice and its actual cost persist.',
        },
        {
          id: 'throw-ready',
          afterStage: 'ask',
          resumeStage: 'glass',
          snapshot: ['customers-clear', 'bottle-available', 'pane-intact', 'player-health'],
          note: 'No customers restore inside the shard-safe display.',
        },
        {
          id: 'return-ready',
          afterStage: 'receipt',
          resumeStage: 'return',
          snapshot: ['envelope', 'false-receipt', 'broken-pane', 'wallet'],
          note: 'Payment is not free-roam spending money and cannot be collected twice.',
        },
      ],
      failures: [
        {
          id: 'shopkeeper-hurt',
          condition: {
            type: 'protected-actor-hurt',
            actor: 'LL-ARC-BEA',
          },
          resumeCheckpoint: 'shop',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'This was already wrong. Hurting Bea will not make it right.',
              when: 'always',
            },
          ],
        },
        {
          id: 'wrong-force',
          condition: {
            type: 'pane-broken-with-firearm',
          },
          resumeCheckpoint: 'throw-ready',
          dialogue: [
            {
              speaker: 'Victor',
              text: 'I said a window. Now every shop on the block is calling the precinct.',
              when: 'always',
            },
          ],
        },
        {
          id: 'money-lost',
          condition: {
            type: 'objective-missing',
            id: 'premium-envelope',
          },
          resumeCheckpoint: 'return-ready',
          dialogue: [
            {
              speaker: 'Victor',
              text: 'A collector who loses the collection is just another debtor.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'taxi-method',
          stage: 'ride',
          options: [
            {
              id: 'ride',
              text: 'Hire Amin’s taxi at the displayed fare.',
              effects: ['Actual boarding, travel, fare debit and skip-to-safe-arrival option'],
            },
            {
              id: 'self-travel',
              text: 'Travel yourself after viewing the taxi tutorial.',
              effects: ['No hired fare debit'],
            },
          ],
          outcome:
            'Accessibility and travel choice retain the same physical throw/evidence mission.',
        },
      ],
      consequences: [
        'Bea remembers Mara’s participation; a later restitution contact requires an actual payment.',
        'False policy receipt is persistent reconstruction-corruption evidence.',
      ],
      rewards: {
        cash: 180,
        unlocks: ['LL-ST-010', 'taxi-rides'],
      },
      requiredCapabilities: [
        {
          id: 'props',
          missionWork: 'Pickup, throw, glass shards and evidence envelope',
        },
        {
          id: 'selectiveForce',
          missionWork: 'Store occupants clear before pane hit',
        },
        {
          id: 'passengers',
          missionWork: 'Hired taxi travel',
        },
        {
          id: 'director',
          missionWork: 'Payment custody, receipt/restitution flags',
        },
        {
          id: 'interior',
          missionWork: 'Pier Goods storefront',
        },
      ],
    },
    {
      id: 'LL-ST-010',
      title: 'Spin Cycle',
      contact: 'LL-CHAR-009',
      source: {
        game: 'GTA IV base game',
        title: 'Hung Out to Dry',
        url: 'https://gta.fandom.com/wiki/Hung_Out_to_Dry',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'order',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Leon operates a laundry counter over a refrigerated medicine store. Victor calls him a debtor; Leon thinks Mara has come to seize the medicines and flees in his delivery van.',
      cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-ARC-LEON'],
      dependencies: {
        all: ['LL-ST-009'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Shop confrontation, thrown obstruction and rear van escape',
          stageIds: ['order', 'counter', 'rear'],
          adaptation: 'A rolling linen rack blocks a physically traversable rear path.',
        },
        {
          sourceBeat:
            'Car pursuit and repeated nonlethal rams force surrender; driver and van must survive',
          stageIds: ['pursuit', 'terms'],
          adaptation:
            'A compliance meter measures controlled impacts separately from medicine/vehicle destruction; pre-spooking the van remains a failure.',
        },
      ],
      stages: [
        {
          id: 'order',
          type: 'contact-scene',
          scene: 'quay-meeting',
          objective: 'Take Victor’s demand to Leon at Canal Bottling Store.',
          completion: [
            {
              type: 'objective-received',
              id: 'leon-demand',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'Pike has a van and an excellent excuse for every bill.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'What does he owe you?',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Access. Electricity. The privilege of keeping the shutter up.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Those are three names for one threat.',
              when: 'always',
            },
          ],
        },
        {
          id: 'counter',
          type: 'confrontation',
          scene: 'coldstore-front',
          objective: 'Enter through the public counter and speak to Leon.',
          completion: [
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Leon',
              text: 'If you are from the seizure office, tell them the insulin has already gone.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Senn sent me.',
              when: 'always',
            },
            {
              speaker: 'Leon',
              text: 'Same office, different stationery.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Leon, stop! We have not even spoken.',
              when: 'always',
            },
          ],
          sceneAction:
            'Leon rolls a linen rack across the aisle and runs through the actual rear door.',
          precondition: 'Rear escape van remains undamaged/unoccupied before the confrontation.',
        },
        {
          id: 'rear',
          type: 'foot-to-vehicle',
          scene: 'coldstore-front',
          objective: 'Follow Leon into the yard and take an available healthy car.',
          completion: [
            {
              type: 'vehicle-boarded',
              role: 'road-car',
              minimumHealth: 35,
            },
            {
              type: 'target-fleeing',
              actor: 'LL-ARC-LEON',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'He thinks I am taking the medicine.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Then stop the van before he changes his mind about paying.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I will stop him. I will not destroy what is inside.',
              when: 'always',
            },
          ],
          playerCarSupply:
            'Two naturally parked accessible road cars plus the player’s surviving arrival car; never force a wrecked specific taxi.',
          targetVehicle: {
            id: 'pike-cold-van',
            cargo: 'medicine-stock',
            maxHealth: 100,
          },
        },
        {
          id: 'pursuit',
          type: 'controlled-ram-chase',
          scene: 'coldstore-front',
          objective:
            'Use controlled side/rear bumps to make Leon stop; preserve him, his van and the medicine.',
          completion: [
            {
              type: 'target-compliant',
              actor: 'LL-ARC-LEON',
              pressureAtLeast: 100,
            },
            {
              type: 'vehicle-health-at-least',
              vehicle: 'pike-cold-van',
              value: 25,
            },
            {
              type: 'cargo-intact',
              id: 'medicine-stock',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Leon, pull over! I am not taking the stock!',
              when: 'always',
            },
            {
              speaker: 'Leon',
              text: 'Everybody says that until the door is open.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then keep the door shut and talk to me.',
              when: 'always',
            },
          ],
          chase: {
            loopScenes: ['coldstore-front', 'canal-stair', 'battery-exchange'],
            solver: 'legal-road',
            pressure: {
              moderateImpact: 25,
              closeSirenOrVoice: 5,
              heavyImpact: 'damage without safe pressure bonus',
            },
            surrenderAt: 100,
            escapeDistance: 250,
            escapeGrace: 25,
            hud: ['compliance', 'van-integrity', 'medicine-safe'],
          },
          noShortcut: 'Shooting driver/engine does not complete the controlled-force objective.',
        },
        {
          id: 'terms',
          type: 'roadside-dialogue',
          scene: 'coldstore-front',
          objective:
            'Hear Leon’s evidence, agree a payment schedule and release him with the stock.',
          completion: [
            {
              type: 'dialogue-finished',
            },
            {
              type: 'actor-released',
              actor: 'LL-ARC-LEON',
              vehicle: 'pike-cold-van',
            },
          ],
          dialogue: [
            {
              speaker: 'Leon',
              text: 'That refrigerator is on a private meter. Senn bought the debt from the city.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Give me the meter account. Pay what you can document, not what he invents.',
              when: 'always',
            },
            {
              speaker: 'Leon',
              text: 'He will call that theft.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'He already calls everything else protection.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Did he get the message?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'He will pay an account that exists. Send me the number.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'evidence-note',
              id: 'privatized-cold-chain-meter',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'counter-ready',
          afterStage: 'order',
          resumeStage: 'counter',
          snapshot: [
            'demand',
            'Leon-counter',
            'undamaged-van',
            'healthy-player-car-options',
            'wallet',
          ],
          note: 'Target van tampering cannot survive a retry as an unwinnable setup.',
        },
        {
          id: 'chase-ready',
          afterStage: 'rear',
          resumeStage: 'pursuit',
          snapshot: ['both-moving-vehicles', 'Leon-health', 'medicine-health', 'pressure-zero'],
          note: 'Pressure, damage and route progress saved together; no instant compliance on load.',
        },
      ],
      failures: [
        {
          id: 'pre-spooked',
          condition: {
            type: 'target-van-tampered-before-confrontation',
            vehicle: 'pike-cold-van',
          },
          resumeCheckpoint: 'counter-ready',
          dialogue: [
            {
              speaker: 'Leon',
              text: 'I saw you at the van. The front door is not a trap I intend to stand in.',
              when: 'always',
            },
          ],
        },
        {
          id: 'driver-or-cargo-killed',
          condition: {
            type: 'protected-object-lost',
            ids: ['LL-ARC-LEON', 'pike-cold-van', 'medicine-stock'],
          },
          resumeCheckpoint: 'chase-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The shelves will be empty because of us. That was never the job.',
              when: 'always',
            },
          ],
        },
        {
          id: 'van-escaped',
          condition: {
            type: 'target-lost',
            actor: 'LL-ARC-LEON',
            grace: 25,
          },
          resumeCheckpoint: 'chase-ready',
          dialogue: [
            {
              speaker: 'Victor',
              text: 'You let a refrigeration van outrun you. How will you phrase that on an invoice?',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'payment-record',
          stage: 'terms',
          options: [
            {
              id: 'documented-payment',
              text: 'Record Leon’s documented payment schedule.',
              effects: [
                {
                  type: 'flag',
                  id: 'leon-debt',
                  value: 'documented',
                },
              ],
            },
            {
              id: 'hold-for-review',
              text: 'Keep the account for Nadia to audit before paying.',
              effects: [
                {
                  type: 'flag',
                  id: 'leon-debt',
                  value: 'audit-pending',
                },
                {
                  type: 'trust',
                  actor: 'LL-CHAR-009',
                  delta: -1,
                },
              ],
            },
          ],
          outcome:
            'Leon survives and leaves in both; later collection/restitution dialogue changes.',
        },
      ],
      consequences: [
        'The private cold-chain meter joins the fraud evidence.',
        'Leon remains an actual shop actor, with his van, rather than disappearing after a success menu.',
      ],
      rewards: {
        cash: 220,
        unlocks: ['LL-ST-011'],
      },
      requiredCapabilities: [
        {
          id: 'chase',
          missionWork: 'Moving van and foot-to-car handoff',
        },
        {
          id: 'selectiveForce',
          missionWork: 'Controlled impact compliance separate from damage',
        },
        {
          id: 'props',
          missionWork: 'Linen obstruction and medicine cargo',
        },
        {
          id: 'interior',
          missionWork: 'Counter/rear yard',
        },
        {
          id: 'director',
          missionWork: 'Pre-spook failure and saved pressure',
        },
      ],
    },
    {
      id: 'LL-ST-011',
      title: 'Clean Plate',
      contact: 'LL-CHAR-009',
      source: {
        game: 'GTA IV base game',
        title: 'Clean Getaway',
        url: 'https://gta.fandom.com/wiki/Clean_Getaway',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'brief',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Victor sends Mara by rail to reclaim a lender’s sedan. Its owner disputes the repossession, and luminous inspection paint must be washed away before delivery.',
      cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-ARC-MILO'],
      dependencies: {
        all: ['LL-ST-010'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Climb station, wait, ride train and steal identified silver car',
          stageIds: ['brief', 'rail', 'identify', 'recover'],
          adaptation: 'Real platform access and a fare-paying ride connect two districts.',
        },
        {
          sourceBeat:
            'Owner alive, stunned or killed changes dialogue; car wash then lockup; damage-sensitive call',
          stageIds: ['recover', 'wash', 'deliver', 'callback'],
          adaptation:
            'Original repossession dispute has three witnessed force outcomes and an actual physical wash.',
        },
      ],
      stages: [
        {
          id: 'brief',
          type: 'contact-scene',
          scene: 'quay-meeting',
          objective: 'Obtain the sedan’s registration and reach Boardwalk station.',
          completion: [
            {
              type: 'objective-received',
              id: 'silver-sedan-order',
            },
            {
              type: 'scene-reached',
              scene: 'boardwalk-station',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'Milo Ash has a company car on a private lease. He forgot which side of that sentence matters.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Why send me on the train?',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Because I want one car brought back, not two left outside his door.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'What happens if his paperwork says the lease is paid?',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Paperwork is what I am paying you to stop discussing.',
              when: 'always',
            },
          ],
        },
        {
          id: 'rail',
          type: 'train-journey',
          scene: 'brigid-station',
          objective:
            'Reach the platform, wait for the correct train, ride to Brigid Market and exit onto the street.',
          completion: [
            {
              type: 'rail-trip-completed',
              fromStation: 'LL-CITY-ST01',
              toStation: 'LL-CITY-ST04',
              actualBoarding: true,
              actualDisembarkation: true,
            },
          ],
          dialogue: [
            {
              speaker: 'Station announcement',
              text: 'Outer Line toward Brigid Market. Keep the boarding edge clear.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'A timetable. Something here admits that people are waiting.',
              when: 'always',
            },
          ],
          transit: {
            from: 'LL-CITY-ST01',
            to: 'LL-CITY-ST04',
            service: 'LL-CITY-SERVICE-01',
            farePolicy:
              'actual controller tariff; Victor advances the displayed fare once if needed',
            wrongTrain: 'May alight/transfer; not instant mission failure',
            requiredProof:
              'Actual rider pose follows moving train; reaching destination marker by car is insufficient.',
          },
        },
        {
          id: 'identify',
          type: 'vehicle-identification',
          scene: 'brigid-station',
          objective: 'Find the silver lender sedan and check its registration before taking it.',
          completion: [
            {
              type: 'identified-vehicle',
              vehicle: 'ash-silver-sedan',
              clue: 'registration-match',
            },
          ],
          dialogue: [
            {
              speaker: 'Milo',
              text: 'That plate is my employer’s. The lease balance is mine.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I have an order from Senn.',
              when: 'always',
            },
            {
              speaker: 'Milo',
              text: 'He sold the same lease to two offices. Which one paid you?',
              when: 'always',
            },
          ],
          vehicle: {
            id: 'ash-silver-sedan',
            role: 'compact',
            color: 'silver',
            dirt: 'luminous yard inspection paint',
            spawn: 'approved Brigid Market street bay',
          },
          witnesses: ['Milo', 'Milo-colleague'],
        },
        {
          id: 'recover',
          type: 'vehicle-recovery-choice',
          scene: 'brigid-station',
          objective: 'Recover the marked sedan; Milo’s actual condition changes the report.',
          completion: [
            {
              type: 'vehicle-boarded',
              vehicle: 'ash-silver-sedan',
            },
            {
              type: 'owner-outcome-recorded',
              actor: 'LL-ARC-MILO',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'I am taking the car. Keep your receipts.',
              when: 'always',
            },
            {
              speaker: 'Milo',
              text: 'Those receipts were supposed to keep my car.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Have you got it?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The car, yes. An uncontested debt, no.',
              when: 'always',
            },
          ],
          encounter: {
            ownerOptions: [
              'talk while colleague distracted, board unlocked car',
              'counter/disarm owner’s attempted grab; nonlethal stun',
              'ordinary lethal attack with real police/witness consequences',
            ],
            colleagueResponse:
              'Foot pursuit if vehicle is taken by force; stops at a physical last-seen endpoint.',
          },
          onComplete: [
            {
              type: 'flag-from-actor',
              id: 'milo-recovery-outcome',
              actor: 'LL-ARC-MILO',
              values: ['unhurt', 'stunned', 'dead'],
            },
          ],
        },
        {
          id: 'wash',
          type: 'vehicle-wash',
          scene: 'kiln-wash',
          objective:
            'Lose any active pursuit, then wash the inspection paint from the sedan at Kiln Row Wash.',
          completion: [
            {
              type: 'wanted-zero',
            },
            {
              type: 'wash-cycle-completed',
              vehicle: 'ash-silver-sedan',
              removes: 'inspection-paint',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The bonnet is covered in tracking paint.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Kiln Row Wash. It cannot arrive looking like a disputed asset.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'It will still be one.',
              when: 'always',
            },
            {
              speaker: 'Wash attendant',
              text: 'Stop at the red line. Engine off while the rails draw you through.',
              when: 'always',
            },
          ],
          route: {
            from: 'brigid-station',
            to: 'kiln-wash',
            solver: 'legal-road-and-open-crossings',
          },
          service: {
            fee: 15,
            missionAdvanceIfNeeded: true,
            cycleSeconds: 18,
            abort:
              'Retain paid receipt but repaint remains until an entire physical cycle completes.',
          },
        },
        {
          id: 'deliver',
          type: 'vehicle-delivery',
          scene: 'vector-lockup',
          objective:
            'Park the washed sedan inside Vector Garage’s inspection bay and leave the keys.',
          completion: [
            {
              type: 'vehicle-delivered',
              vehicle: 'ash-silver-sedan',
              bay: 'inspection',
              minimumHealth: 10,
            },
            {
              type: 'paint-removed',
              vehicle: 'ash-silver-sedan',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'He still breathing?',
              when: 'milo-recovery-outcome=unhurt',
            },
            {
              speaker: 'Mara',
              text: 'Yes. Nobody needed to get hurt for a set of keys.',
              when: 'milo-recovery-outcome=unhurt',
            },
            {
              speaker: 'Victor',
              text: 'He still breathing?',
              when: 'milo-recovery-outcome=stunned',
            },
            {
              speaker: 'Mara',
              text: 'Yes. He will remember why his employer changed the locks.',
              when: 'milo-recovery-outcome=stunned',
            },
            {
              speaker: 'Mara',
              text: 'Milo is dead. The lease is not.',
              when: 'milo-recovery-outcome=dead',
            },
            {
              speaker: 'Victor',
              text: 'Then I have lost a payment and gained a car. An expensive choice.',
              when: 'milo-recovery-outcome=dead',
            },
          ],
          onComplete: [
            {
              type: 'record-vehicle-condition',
              id: 'sedan-delivery-condition',
              vehicle: 'ash-silver-sedan',
            },
          ],
        },
        {
          id: 'callback',
          type: 'delayed-phone',
          scene: 'quay-meeting',
          objective: 'Hear Victor’s condition-sensitive call; record Milo’s lease discrepancy.',
          completion: [
            {
              type: 'call-resolved',
              topic: 'sedan-condition',
            },
            {
              type: 'evidence-note',
              id: 'double-sold-lease',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'Clean bodywork. You have an eye for an asset.',
              when: 'sedan-delivery-condition=undamaged',
            },
            {
              speaker: 'Victor',
              text: 'The paint is clean. The rest of it looks like an argument with a bridge.',
              when: 'sedan-delivery-condition=damaged',
            },
            {
              speaker: 'Mara',
              text: 'Perhaps stop sending your assets into arguments.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Come back. A depot employee has been reading the wrong files.',
              when: 'always',
            },
          ],
          callDelay: {
            minimumWorldSeconds: 30,
            noRealTimeWaitingRequiredInTests:
              'test event scheduling separately; never fast-forward natural evidence',
          },
        },
      ],
      checkpoints: [
        {
          id: 'station-ready',
          afterStage: 'brief',
          resumeStage: 'rail',
          snapshot: ['registration-order', 'fare-advance-receipt', 'wallet', 'station-arrival'],
          note: 'Rail save retains actual timetable, fare and rider identity.',
        },
        {
          id: 'car-ready',
          afterStage: 'identify',
          resumeStage: 'recover',
          snapshot: ['identified-sedan', 'Milo-health', 'colleague-pose', 'player-inventory'],
          note: 'Owner state restores before the force decision.',
        },
        {
          id: 'wash-ready',
          afterStage: 'recover',
          resumeStage: 'wash',
          snapshot: ['Milo-outcome', 'sedan-pose-health-paint', 'wanted-state', 'wallet'],
          note: 'A restore cannot wash off a police observation; escape remains real.',
        },
        {
          id: 'lockup-ready',
          afterStage: 'wash',
          resumeStage: 'deliver',
          snapshot: ['wash-receipt', 'paint-removed', 'sedan-health', 'wallet'],
          note: 'No second wash debit on Continue.',
        },
      ],
      failures: [
        {
          id: 'sedan-destroyed',
          condition: {
            type: 'required-vehicle-destroyed',
            vehicle: 'ash-silver-sedan',
          },
          resumeCheckpoint: 'car-ready',
          dialogue: [
            {
              speaker: 'Victor',
              text: 'A plate is not enough. I asked for the car attached to it.',
              when: 'always',
            },
          ],
        },
        {
          id: 'wrong-car',
          condition: {
            type: 'delivery-attempt-wrong-vehicle',
          },
          resumeCheckpoint: 'lockup-ready',
          dialogue: [
            {
              speaker: 'Garage clerk',
              text: 'Wrong registration. I am not signing a different theft into this bay.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'owner-force',
          stage: 'recover',
          options: [
            {
              id: 'unhurt',
              text: 'Take the sedan while leaving Milo unhurt.',
              effects: ['actual unhurt actor condition'],
            },
            {
              id: 'stunned',
              text: 'Counter his grab and leave him alive.',
              effects: ['actual nonlethal actor condition'],
            },
            {
              id: 'dead',
              text: 'Use lethal violence, with witnesses and police consequences.',
              effects: ['actual actor death; no reward bonus'],
            },
          ],
          outcome:
            'Owner outcome and delivered condition independently affect callbacks and later neighborhood testimony.',
        },
      ],
      consequences: [
        'Milo’s lease discrepancy is added to Victor’s false-policy trail.',
        'Original car condition, owner outcome and fare/wash transactions persist.',
      ],
      rewards: {
        cash: 250,
        unlocks: ['LL-ST-012', 'rail-travel', 'vehicle-wash'],
      },
      requiredCapabilities: [
        {
          id: 'rail',
          missionWork: 'Full station-platform-train-street trip',
        },
        {
          id: 'wash',
          missionWork: 'Kiln Row physical wash and paint removal',
        },
        {
          id: 'selectiveForce',
          missionWork: 'Owner unhurt/stunned/dead variants',
        },
        {
          id: 'phone',
          missionWork: 'Delayed damage-sensitive callback',
        },
        {
          id: 'director',
          missionWork: 'Registration, rider, fee and outcome snapshots',
        },
      ],
    },
    {
      id: 'LL-ST-012',
      title: 'High Water Mark',
      contact: 'LL-CHAR-009',
      source: {
        game: 'GTA IV base game',
        title: 'Ivan the Not So Terrible',
        url: 'https://gta.fandom.com/wiki/Ivan_the_Not_So_Terrible',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'order',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Victor brands Ilan a depot thief. Ilan flees through unfinished flood works carrying proof that workers have been made collateral; Mara decides whether to surrender him or protect his testimony.',
      cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-CHAR-045'],
      dependencies: {
        all: ['LL-ST-011'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Depot target flees by car to construction site',
          stageIds: ['order', 'depot', 'road'],
          adaptation: 'Ilan carries workers’ deposit ledger rather than stealing a taxi.',
        },
        {
          sourceBeat:
            'Ladders, construction/crane climb, multiple rooftop jumps and hanging target',
          stageIds: ['climb', 'roof-route', 'ledge'],
          adaptation:
            'A flood-defense frame supplies actual continuous traversal and a rescueable ledge.',
        },
        {
          sourceBeat: 'Kill/spare branch changes later street encounter',
          stageIds: ['decision', 'capture', 'safe-passage'],
          adaptation:
            'Original capture/protection branches preserve removal versus later witness availability, without copying an execution scene.',
        },
      ],
      stages: [
        {
          id: 'order',
          type: 'contact-scene',
          scene: 'quay-meeting',
          objective: 'Hear Victor’s claim and ask what Ilan took.',
          completion: [
            {
              type: 'objective-received',
              id: 'ilan-recovery-order',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'Ilan Vale took a depot ledger. A foolish man imagines a book can negotiate.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Why not file a report?',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Because the report contains other people’s business. Bring him where he cannot interfere.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I will hear his business first.',
              when: 'always',
            },
          ],
        },
        {
          id: 'depot',
          type: 'target-discovery',
          scene: 'dispatch',
          objective: 'Approach the co-op depot and identify Ilan’s blue utility coupe.',
          completion: [
            {
              type: 'target-identified',
              actor: 'LL-CHAR-045',
              vehicle: 'ilan-utility-coupe',
            },
          ],
          dialogue: [
            {
              speaker: 'Ilan',
              text: 'Senn sent you. I copied nothing. Those deposits belong to the drivers.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then stop and tell me.',
              when: 'always',
            },
            {
              speaker: 'Ilan',
              text: 'Everybody says that before they sell the answer.',
              when: 'always',
            },
          ],
          staging:
            'Ilan visibly boards and pulls away; pursuit cannot start before an accessible player vehicle is present.',
        },
        {
          id: 'road',
          type: 'vehicle-pursuit',
          scene: 'old-quay-works',
          objective: 'Follow Ilan to Old Quay Works without destroying his car.',
          completion: [
            {
              type: 'target-arrived',
              actor: 'LL-CHAR-045',
              scene: 'old-quay-works',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'He is going into the construction frame.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'It has many exits. Most are a long way down.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You sound familiar with them.',
              when: 'always',
            },
          ],
          route: {
            from: 'dispatch',
            to: 'old-quay-works',
            solver: 'legal-road',
            targetStopsAt: 'grade loading apron',
            targetNoTeleport: true,
          },
          lostDistance: 240,
          graceSeconds: 25,
        },
        {
          id: 'climb',
          type: 'vertical-pursuit',
          scene: 'old-quay-works',
          objective: 'Climb the two service ladders and crane access walk after Ilan.',
          completion: [
            {
              type: 'traversal-sequence',
              sequence: ['ladder-grade-to-18', 'ladder-18-to-36', 'crane-walk-to-54'],
            },
          ],
          dialogue: [
            {
              speaker: 'Ilan',
              text: 'The inspector signed this before the ladder was bolted!',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then stop making both of us test the signature.',
              when: 'always',
            },
            {
              speaker: 'Ilan',
              text: 'I know where it holds. Keep up if you intend to listen.',
              when: 'always',
            },
          ],
          traversal: {
            ladders: [
              {
                fromZ: 0,
                toZ: 18,
              },
              {
                fromZ: 18,
                toZ: 36,
              },
            ],
            craneWalkZ: 54,
            targetWaitsAtSafeBeat:
              'Brief credible hesitation at crane gate; not invulnerable rubber-banding.',
            tutorial: ['continuous-ladder', 'dismount-to-supported-floor'],
          },
        },
        {
          id: 'roof-route',
          type: 'rooftop-pursuit',
          scene: 'old-quay-works',
          objective: 'Cross the three roof gaps and reach Ilan at the failing parapet.',
          completion: [
            {
              type: 'traversal-sequence',
              sequence: ['roof-gap-one', 'roof-gap-two', 'roof-gap-three'],
            },
            {
              type: 'target-hanging',
              actor: 'LL-CHAR-045',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Ilan, the far roof has no rail!',
              when: 'always',
            },
            {
              speaker: 'Ilan',
              text: 'That roof was a shelter plan once.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Hold on. I can reach you.',
              when: 'always',
            },
          ],
          traversal: {
            roofsZ: [54, 54, 48, 48],
            gapsUnits: [12, 15, 10],
            validLandingVolumesRequired: true,
            fallBelowRoof: 'Actual fall damage/clinic failure; never snap to a mission marker.',
            targetLedgeHang: true,
          },
        },
        {
          id: 'ledge',
          type: 'evidence-dialogue',
          scene: 'old-quay-works',
          objective: 'Reach Ilan’s handhold and hear what is in the ledger.',
          completion: [
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Ilan',
              text: 'He sold our deposits as security for his next contract. If the job fails, he takes our homes.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Pass me the ledger.',
              when: 'always',
            },
            {
              speaker: 'Ilan',
              text: 'If you give me back to him, keep a copy. Make him admit we existed.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You are not a document. Give me your other hand.',
              when: 'always',
            },
          ],
          sceneAction:
            'Mara pulls Ilan onto a supported roof before the decision. No dialogue menu leaves him hanging indefinitely.',
        },
        {
          id: 'decision',
          type: 'branch-choice',
          scene: 'old-quay-works',
          objective:
            'Choose whether to surrender Ilan to the investigators or get him to a safe address.',
          completion: [
            {
              type: 'branch-resolved',
              choice: 'ilan-disposition',
            },
          ],
          dialogue: [
            {
              speaker: 'Ilan',
              text: 'The private investigators collect for Senn. They do not investigate him.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'And if I hide you?',
              when: 'always',
            },
            {
              speaker: 'Ilan',
              text: 'I can trace the bonds he sold. I cannot do it from a cell.',
              when: 'always',
            },
          ],
          branches: [
            {
              choice: 'capture',
              next: 'capture',
            },
            {
              choice: 'safe-passage',
              next: 'safe-passage',
            },
          ],
        },
        {
          id: 'capture',
          type: 'custody-escort',
          scene: 'old-quay-works',
          objective:
            'Escort Ilan down the safe stair to the investigator van; retain the ledger copy.',
          completion: [
            {
              type: 'custody-transferred',
              actor: 'LL-CHAR-045',
            },
            {
              type: 'evidence-retained',
              id: 'workers-deposit-ledger',
            },
          ],
          dialogue: [
            {
              speaker: 'Ilan',
              text: 'They will call me the thief so they never have to name the owner.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Nadia gets the book. They will have to answer her.',
              when: 'always',
            },
            {
              speaker: 'Investigator',
              text: 'You have completed the recovery. The witness is our responsibility now.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'That is exactly what worries me.',
              when: 'always',
            },
          ],
          enabledWhen: {
            type: 'choice-is',
            id: 'ilan-disposition',
            value: 'capture',
          },
          next: 'complete',
          onComplete: [
            {
              type: 'flag',
              id: 'ilan_fate',
              value: 'detained',
            },
            {
              type: 'flag',
              id: 'ilan_later_street_encounter',
              value: false,
            },
          ],
        },
        {
          id: 'safe-passage',
          type: 'witness-escort',
          scene: 'dockside-rooms',
          objective: 'Escort Ilan off the roof and take him to Nadia’s protected address.',
          completion: [
            {
              type: 'witness-delivered',
              actor: 'LL-CHAR-045',
              protectedAddress: true,
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Nadia knows a room where your name is not the price of admission.',
              when: 'always',
            },
            {
              speaker: 'Ilan',
              text: 'Tell Senn I went over the edge.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I will tell him you cannot interfere. He can misunderstand it for once.',
              when: 'always',
            },
            {
              speaker: 'Nadia',
              text: 'Keep the ledger dry. Keep the witness alive. We can work with the rest.',
              when: 'always',
            },
          ],
          enabledWhen: {
            type: 'choice-is',
            id: 'ilan-disposition',
            value: 'safe-passage',
          },
          next: 'complete',
          onComplete: [
            {
              type: 'flag',
              id: 'ilan_fate',
              value: 'protected',
            },
            {
              type: 'flag',
              id: 'ilan_later_street_encounter',
              value: true,
            },
            {
              type: 'queue-street-content',
              id: 'LL-STREET-ILAN',
              status: 'required-unimplemented',
            },
          ],
        },
        {
          id: 'complete',
          type: 'phone-report',
          scene: 'dispatch',
          objective: 'Report the disposition to Victor and secure the workers’ ledger.',
          completion: [
            {
              type: 'evidence-secured',
              id: 'workers-deposit-ledger',
            },
            {
              type: 'call-resolved',
              topic: 'ilan-report',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'He will not be coming back?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You will not see him at the depot.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Excellent. That is the kind of certainty I buy.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then stop selling everyone else’s.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'construction',
          afterStage: 'road',
          resumeStage: 'climb',
          snapshot: ['Ilan-route', 'cars-parked', 'ledger-carried', 'health-equipment'],
          note: 'Resume at ground before the first ladder, not on an unsupported air point.',
        },
        {
          id: 'roofs',
          afterStage: 'climb',
          resumeStage: 'roof-route',
          snapshot: ['player-crane-walk', 'Ilan-first-roof', 'health', 'ledger'],
          note: 'Both poses require supported geometry validation.',
        },
        {
          id: 'rescued',
          afterStage: 'ledge',
          resumeStage: 'decision',
          snapshot: ['Ilan-on-roof', 'ledger-copy', 'choice-uncommitted', 'health'],
          note: 'Replay may reconsider the choice until one branch is committed; Continue retains a committed branch.',
        },
      ],
      failures: [
        {
          id: 'target-escaped',
          condition: {
            type: 'target-lost',
            actor: 'LL-CHAR-045',
            grace: 25,
          },
          resumeCheckpoint: 'start',
          dialogue: [
            {
              speaker: 'Victor',
              text: 'He has a head start and your sympathy. Neither was in the order.',
              when: 'always',
            },
          ],
        },
        {
          id: 'ilan-killed',
          condition: {
            type: 'protected-actor-dead',
            actor: 'LL-CHAR-045',
          },
          resumeCheckpoint: 'construction',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'He was trying to show me the record. Now someone else will write it.',
              when: 'always',
            },
          ],
        },
        {
          id: 'witness-left',
          condition: {
            type: 'escort-abandoned',
            actor: 'LL-CHAR-045',
            grace: 30,
          },
          resumeCheckpoint: 'rescued',
          dialogue: [
            {
              speaker: 'Ilan',
              text: 'You pulled me up to leave me here?',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'ilan-disposition',
          stage: 'decision',
          options: [
            {
              id: 'capture',
              text: 'Surrender Ilan and retain his evidence.',
              effects: [
                {
                  type: 'flag',
                  id: 'ilan_fate',
                  value: 'detained',
                },
                {
                  type: 'disable-street-content',
                  id: 'LL-STREET-ILAN',
                },
              ],
            },
            {
              id: 'safe-passage',
              text: 'Protect Ilan and let him trace the bonds.',
              effects: [
                {
                  type: 'flag',
                  id: 'ilan_fate',
                  value: 'protected',
                },
                {
                  type: 'unlock-street-content',
                  id: 'LL-STREET-ILAN',
                  notImplemented: true,
                },
              ],
            },
          ],
          outcome:
            'Both have full escort resolutions; later witness availability and testimony differ. This is an original counterpart to the source removal/survival branch, not a claim to reproduce its exact kill option.',
        },
      ],
      consequences: [
        'ilan_fate and later street eligibility must survive the following displacement arc.',
        'Worker deposits provide the concrete reason Nadia challenges Victor.',
      ],
      rewards: {
        cash: 300,
        unlocks: ['LL-ST-013'],
        branchUnlocks: {
          'safe-passage': ['LL-STREET-ILAN'],
        },
      },
      requiredCapabilities: [
        {
          id: 'vertical',
          missionWork: 'Two ladders/crane/three gaps/ledge rescue',
        },
        {
          id: 'chase',
          missionWork: 'Car-to-roof pursuit',
        },
        {
          id: 'arrestBranch',
          missionWork: 'Custody versus protected witness escort',
        },
        {
          id: 'director',
          missionWork: 'Persistent Ilan branch and future street hook',
        },
        {
          id: 'interior',
          missionWork: 'Construction multi-floor collision',
        },
      ],
    },
    {
      id: 'LL-ST-013',
      title: 'Premium Due',
      contact: 'LL-CHAR-002',
      source: {
        game: 'GTA IV base game',
        title: 'Uncle Vlad',
        url: 'https://gta.fandom.com/wiki/Uncle_Vlad',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'records',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Nadia finds that Victor sold the co-op drivers’ identities into demolition permits. Felix wants his signatures back; Mara follows the broker to the waterfront before he can destroy the record.',
      cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-CHAR-008', 'LL-CHAR-009'],
      dependencies: {
        all: ['LL-ST-012'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Family crisis, bar confrontation and two guards',
          stageIds: ['records', 'cafe', 'guards'],
          adaptation: 'Identity exploitation replaces the source affair motive.',
        },
        {
          sourceBeat:
            'Antagonist vehicle escape, crashed car, waterfront foot pursuit and consequential death',
          stageIds: ['road', 'waterfront', 'confront'],
          adaptation:
            'Victor tries to burn the ledger and attacks Mara; lethal resistance ends his leverage.',
        },
        {
          sourceBeat: 'Protagonist reveals past search to cousin after killing',
          stageIds: ['confession'],
          adaptation:
            'Mara explains the falsified evacuation dispatch in wholly original dialogue.',
        },
      ],
      stages: [
        {
          id: 'records',
          type: 'family-scene',
          scene: 'dispatch',
          objective: 'Read Nadia’s permit comparison with Felix.',
          completion: [
            {
              type: 'evidence-compared',
              ids: ['workers-deposit-ledger', 'false-policy-receipt', 'duplicate-impound-invoices'],
            },
          ],
          dialogue: [
            {
              speaker: 'Nadia',
              text: 'These demolition crews do not exist. Every signature belongs to one of our drivers.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'I signed a transport guarantee. Not this.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Victor sold people as a list of permissions.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Then we get the list back before the permits become a crime scene.',
              when: 'always',
            },
          ],
        },
        {
          id: 'cafe',
          type: 'escort-confrontation',
          scene: 'quay-meeting',
          objective:
            'Take Felix to Quay House and confront Victor about the forged worker permits.',
          completion: [
            {
              type: 'dialogue-finished',
            },
            {
              type: 'actor-fleeing',
              actor: 'LL-CHAR-009',
            },
          ],
          dialogue: [
            {
              speaker: 'Victor',
              text: 'You both look uninsurable.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Cancel the forged crew permits. Give Nadia the originals.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'A driver’s name is worth more on a form than in a cab. I improved your business.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'You made my drivers liable for buildings they have never seen.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Then they had better hope the buildings stay up.',
              when: 'always',
            },
          ],
          staging:
            'Victor signals two guards and leaves through a rear door into a waiting coupe; Felix moves into real booth cover.',
        },
        {
          id: 'guards',
          type: 'interior-combat',
          scene: 'quay-meeting',
          objective: 'Defeat Victor’s two armed guards while protecting Felix and cafe staff.',
          completion: [
            {
              type: 'hostiles-neutralized',
              actors: ['senn-door-guard', 'senn-booth-guard'],
            },
            {
              type: 'actor-alive',
              actor: 'LL-CHAR-002',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Everyone behind the counter. Felix, stay down.',
              when: 'always',
            },
            {
              speaker: 'Guard',
              text: 'The contract says you leave him alone.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Your contract has run out of witnesses.',
              when: 'always',
            },
          ],
          encounter: {
            actors: [
              {
                id: 'senn-door-guard',
                weapon: 'pistol',
                cover: 'door return',
              },
              {
                id: 'senn-booth-guard',
                weapon: 'baton',
                tactics: 'close rush',
              },
            ],
            civiliansFlee: 'front service gate',
            companionCover: 'booth wall',
          },
        },
        {
          id: 'road',
          type: 'car-pursuit',
          scene: 'pier-berth',
          objective: 'Collect Felix and follow Victor’s coupe to the Pier Eight seawall.',
          completion: [
            {
              type: 'target-stopped',
              actor: 'LL-CHAR-009',
              reason: 'failed-yard-barrier-turn',
            },
            {
              type: 'player-followed',
              grace: 20,
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'He still has the originals!',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'We follow. Do not shoot out of the window.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'There is no case without a record. You should have accepted the improvements.',
              when: 'always',
            },
          ],
          route: {
            from: 'quay-meeting',
            to: 'pier-berth',
            solver: 'legal-road',
            targetCrash:
              'Physical collision with a closed cargo barrier at the approved endpoint; no wreck teleported in.',
            targetCanBeStoppedEarlier:
              'Then waterfront confrontation relocates to a validated nearby safe volume with the same evidence/battle.',
          },
        },
        {
          id: 'waterfront',
          type: 'foot-interception',
          scene: 'pier-berth',
          objective:
            'Leave Felix at the car and stop Victor reaching the water with the permit folder.',
          completion: [
            {
              type: 'target-intercepted',
              actor: 'LL-CHAR-009',
            },
            {
              type: 'objective-intact',
              id: 'forged-permit-originals',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'He is running for the ladder!',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Stay at the car. Call Nadia and tell her we have the folder.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Nobody owns what is already under water.',
              when: 'always',
            },
          ],
          route: ['damaged coupe', 'cargo fence opening', 'seawall service ladder top'],
          timer: {
            seconds: 45,
            fail: 'folder thrown irretrievably into channel',
          },
        },
        {
          id: 'confront',
          type: 'antagonist-fight',
          scene: 'pier-berth',
          objective: 'Recover the permit folder and survive Victor’s armed attack.',
          completion: [
            {
              type: 'actor-dead',
              actor: 'LL-CHAR-009',
            },
            {
              type: 'evidence-collected',
              id: 'forged-permit-originals',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Leave the folder. You can still answer for it.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Answer to whom? The office that bought it?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The people whose names you stole.',
              when: 'always',
            },
            {
              speaker: 'Victor',
              text: 'Names are replaceable. You are about to find out.',
              when: 'always',
            },
          ],
          encounter: {
            actor: 'LL-CHAR-009',
            weapon: 'pistol',
            action:
              'Throws the folder into reachable quay-side cover and draws; actual damaging combat determines death.',
            noExecutionMenu: true,
            lethalStoryOutcome: true,
          },
          aftermath:
            'Mara checks the folder for a burn/soak mark; Felix hears the shot from the car. Original fatal encounter is not optional cosmetic text.',
        },
        {
          id: 'confession',
          type: 'family-aftermath',
          scene: 'dispatch',
          objective:
            'Return with Felix, give Nadia the original permits and explain why Mara recognizes falsified dispatches.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-002',
            },
            {
              type: 'evidence-secured',
              id: 'forged-permit-originals',
            },
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'I asked you to drive, Mara. Not become the answer to every threat.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'A dispatcher changed a road on the night my convoy left. We trusted the signed sheet.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Is that why you came?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Someone in this port bought the dispatch archive. I wanted work while I found out who.',
              when: 'always',
            },
            {
              speaker: 'Nadia',
              text: 'Then we find the buyer without giving them more names to bury.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Victor worked for Corvus. He said the office already bought the folder.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'cafe-entry',
          afterStage: 'records',
          resumeStage: 'cafe',
          snapshot: ['Felix', 'evidence-comparison', 'player-vehicle', 'health-ammo'],
          note: 'Restore before guards activate.',
        },
        {
          id: 'chase-ready',
          afterStage: 'guards',
          resumeStage: 'road',
          snapshot: ['Felix-health', 'Victor-moving-coupe', 'player-car', 'health-ammo'],
          note: 'Pursuit routes cannot advance while replay menu is open.',
        },
        {
          id: 'quay',
          afterStage: 'road',
          resumeStage: 'waterfront',
          snapshot: ['Victor-foot-start', 'Felix-safe-car', 'folder', 'timer', 'health-ammo'],
          note: 'Folder timer begins only when the player regains control.',
        },
      ],
      failures: [
        {
          id: 'felix-harmed',
          condition: {
            type: 'protected-actor-dead',
            actor: 'LL-CHAR-002',
          },
          resumeCheckpoint: 'cafe-entry',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Felix! I brought you here. Stay with me.',
              when: 'always',
            },
          ],
        },
        {
          id: 'victor-escaped',
          condition: {
            type: 'target-lost',
            actor: 'LL-CHAR-009',
            grace: 20,
          },
          resumeCheckpoint: 'chase-ready',
          dialogue: [
            {
              speaker: 'Nadia',
              text: 'He can forge copies all night if we never get the originals.',
              when: 'always',
            },
          ],
        },
        {
          id: 'permits-lost',
          condition: {
            type: 'objective-destroyed',
            id: 'forged-permit-originals',
          },
          resumeCheckpoint: 'quay',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The names are gone. We need to get there before he reaches the ladder.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'confession-depth',
          stage: 'confession',
          options: [
            {
              id: 'name-convoy',
              text: 'Tell Felix the convoy’s date and dispatch office.',
              effects: [
                {
                  type: 'flag',
                  id: 'felix-knows-convoy',
                  value: true,
                },
              ],
            },
            {
              id: 'keep-date-private',
              text: 'Explain the falsification while keeping the date private.',
              effects: [
                {
                  type: 'flag',
                  id: 'felix-knows-convoy',
                  value: false,
                },
              ],
            },
          ],
          outcome:
            'Felix knows Mara’s purpose in both; later search dialogue differs. Victor’s fatal battle and Corvus retaliation remain.',
        },
      ],
      consequences: [
        'Victor is dead; his employer escalates the coercion. Quay House staff remember the violence.',
        'The original evacuation question becomes explicit and persists into both eventual ending routes.',
      ],
      rewards: {
        cash: 0,
        unlocks: ['LL-ST-014'],
        flags: ['victor-dead', 'mara-past-search-revealed'],
      },
      requiredCapabilities: [
        {
          id: 'interior',
          missionWork: 'Cafe battle and civilian escape',
        },
        {
          id: 'chase',
          missionWork: 'Coupe/crash/foot interception',
        },
        {
          id: 'passengers',
          missionWork: 'Felix protected through combat and return',
        },
        {
          id: 'props',
          missionWork: 'Folder timer and custody',
        },
        {
          id: 'cinematic',
          missionWork: 'Consequential death/family aftermath',
        },
        {
          id: 'director',
          missionWork: 'Fatal story state and source arc handoff',
        },
      ],
    },
    {
      id: 'LL-ST-014',
      title: 'Borrowed Authority',
      contact: 'LL-CHAR-010',
      source: {
        game: 'GTA IV base game',
        title: 'Crime and Punishment',
        url: 'https://gta.fandom.com/wiki/Crime_and_Punishment',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'abduction',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Bran Corvus abducts Mara and Felix over Victor’s death. His violent coercion ends with a demand: steal a patrol car and find a relief crate hidden among three moving vans.',
      cast: [
        'LL-CHAR-001',
        'LL-CHAR-002',
        'LL-CHAR-004',
        'LL-CHAR-010',
        'LL-ARC-SEDGE',
        'LL-CHAR-048',
      ],
      dependencies: {
        all: ['LL-ST-013'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Abduction, bound cousins, employer kills subordinate and wounds cousin',
          stageIds: ['abduction', 'coercion'],
          adaptation:
            'A contractor basement makes Bran’s unpredictability physically consequential.',
        },
        {
          sourceBeat:
            'Acquire police car, siren-stop three candidate vans, inspect cargo before shooting; correct van guarded',
          stageIds: ['patrol', 'stops', 'crate'],
          adaptation:
            'A relief equipment crate replaces televisions; first inspected van is never correct.',
        },
        {
          sourceBeat: 'Deliver stolen van and hear cousin recovery call',
          stageIds: ['deliver', 'recovery'],
          adaptation: 'Silas mediates injury and secures Bran’s new worker.',
        },
      ],
      stages: [
        {
          id: 'abduction',
          type: 'scripted-scene',
          scene: 'saltgate-estate',
          objective:
            'Attend the requested settlement meeting with Felix; survive the abduction scene.',
          completion: [
            {
              type: 'scene-resolved',
              id: 'corvus-abduction',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'The message says someone can cancel the forged permits.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Who sent it?',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Corvus’s office. They already know where we park.',
              when: 'always',
            },
            {
              speaker: 'Cora',
              text: 'Hands visible. Your settlement is downstairs.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'That word is doing a lot of work.',
              when: 'always',
            },
          ],
          staging:
            'Named contractor crew surround the meeting bay, confiscate carried weapons into a recoverable locker and bind both cousins; skip must produce the same actor/inventory state, no hidden player-health cheat.',
          weaponsReturn: 'Exit locker restores owned inventory exactly once.',
        },
        {
          id: 'coercion',
          type: 'scripted-scene',
          scene: 'saltgate-estate',
          objective: 'Hear Bran’s demand and Silas’s conditions for Felix’s treatment.',
          completion: [
            {
              type: 'dialogue-finished',
            },
            {
              type: 'inventory-returned-from-locker',
            },
          ],
          dialogue: [
            {
              speaker: 'Cora',
              text: 'Senn used your permits to collateralize the drivers. They brought the originals.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'You were paid to guard my name, not explain theirs.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Bran. Put it down. Cora is on your payroll.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Then she should have known what her advice cost.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'We did not know who bought the forms!',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'You know now.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Mara, there are three relief vans crossing the basin. One has our control crate. Bring it here. I will keep Felix alive.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'If he dies, you will need a different kind of contractor.',
              when: 'always',
            },
          ],
          sceneAction:
            'Bran shoots Cora fatally, then shoots Felix’s shoulder when he intervenes. Silas stops the assault and opens Mara’s restraint; the medical actor applies an actual injury state to Felix.',
          treatment:
            'Felix is a scene-local wounded protected actor; recovery is a saved storyline event, not a player clinic teleport.',
        },
        {
          id: 'patrol',
          type: 'police-vehicle-acquisition',
          scene: 'impound-counter',
          objective:
            'Take the unattended patrol car at the annex after its officer responds to a real call.',
          completion: [
            {
              type: 'vehicle-boarded',
              vehicle: 'annex-patrol',
              role: 'police',
            },
          ],
          dialogue: [
            {
              speaker: 'Silas',
              text: 'Use the siren, not the gun. Van drivers understand a uniformed car.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'And real patrol?',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'They understand theft. Do not let them watch you take it.',
              when: 'always',
            },
          ],
          staging:
            'Officer exits at an authored dispatch event and follows a walkable response route; car remains theft-witnessable. Alternative real police car allowed after identity check.',
          tutorial: ['police-siren', 'traffic-stop-command'],
        },
        {
          id: 'stops',
          type: 'traffic-stop-inspection',
          scene: 'dry-basin-yard',
          objective:
            'Use the siren to pull over candidate vans; inspect their cargo before deciding which to take.',
          completion: [
            {
              type: 'cargo-identified',
              id: 'corvus-control-crate',
              validInspection: true,
            },
          ],
          dialogue: [
            {
              speaker: 'Driver',
              text: 'Is this about the manifest? The depot said the route was cleared.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Stop at the curb and open the cargo doors.',
              when: 'always',
            },
            {
              speaker: 'Empty driver',
              text: 'Filters. Six pallets of filters. Check the seal and let me go.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The seal matches. Leave when I return to the car.',
              when: 'always',
            },
            {
              speaker: 'Crate driver',
              text: 'That case belongs to Cobalt Freight. You are not the patrol we paid for.',
              when: 'always',
            },
          ],
          candidates: [
            {
              id: 'relief-van-a',
              cargoRole: 'filters',
              routeScenes: ['manifest-yard', 'dry-basin-yard'],
            },
            {
              id: 'relief-van-b',
              cargoRole: 'pumps-or-control-crate',
              routeScenes: ['dry-basin-yard', 'coldstore-front'],
            },
            {
              id: 'relief-van-c',
              cargoRole: 'pumps-or-control-crate',
              routeScenes: ['coldstore-front', 'manifest-yard'],
            },
          ],
          selection:
            'First actual inspected van is empty; a saved seeded second/third selection holds the correct crate. Inspection changes no NPC identity on release.',
          clock: {
            seconds: 420,
            startsOn: 'first-siren-stop',
            stopWhileGamePaused: true,
            tuning: 'Original deadline; requires natural route validation.',
          },
          stopRules: {
            sirenRange: 65,
            playerBehindTarget: true,
            targetCurbDeceleration: true,
            playerExitAfterStop: true,
            driverAndGuardVisible: true,
          },
        },
        {
          id: 'crate',
          type: 'guarded-van-theft',
          scene: 'dry-basin-yard',
          objective:
            'Survive the crate van’s armed guard, then take the inspected van with its cargo intact.',
          completion: [
            {
              type: 'guard-neutralized',
              id: 'crate-van-guard',
            },
            {
              type: 'vehicle-boarded',
              vehicle: 'identified-crate-van',
            },
            {
              type: 'cargo-intact',
              id: 'corvus-control-crate',
            },
          ],
          dialogue: [
            {
              speaker: 'Guard',
              text: 'Cobalt bought this cargo and the police route with it.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then your invoice can explain why you are pointing that at me.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Take the van. Do not open the case.',
              when: 'always',
            },
          ],
          encounter: {
            id: 'crate-van-guard',
            weapon: 'pistol',
            startsOnlyAfter: 'completed cargo inspection',
            driverCanSurrender: true,
          },
          sourceFailureCounterpart:
            'Attacking a candidate driver/guard before cargo inspection fails the identification job, even if it happens to be the right van.',
        },
        {
          id: 'deliver',
          type: 'cargo-delivery',
          scene: 'vector-lockup',
          objective:
            'Lose any active wanted search and deliver the crate van to the designated lockup.',
          completion: [
            {
              type: 'wanted-zero',
            },
            {
              type: 'vehicle-delivered',
              vehicle: 'identified-crate-van',
            },
            {
              type: 'cargo-secured',
              id: 'corvus-control-crate',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The van is inside. How is Felix?',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'The shoulder wound is clean. The fear is more difficult to invoice.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Do not invoice either to him.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'I will talk to Bran. You have made yourself useful.',
              when: 'always',
            },
          ],
        },
        {
          id: 'recovery',
          type: 'phone-aftermath',
          scene: 'dispatch',
          objective: 'Speak to Felix after his release and register Bran’s contact.',
          completion: [
            {
              type: 'call-resolved',
              topic: 'Felix-recovery',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'They gave me a sling and a form promising not to discuss the sling.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Did you sign it?',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Nadia signed the discharge. She took the other form away.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Good. Stay with her.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Silas said you have work now. That is how they said it. Work.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'released',
          afterStage: 'coercion',
          resumeStage: 'patrol',
          snapshot: [
            'Felix-injury',
            'Cora-dead',
            'owned-inventory-return',
            'wallet',
            'van-selection-seed',
          ],
          note: 'Cutscene skip/retry must never duplicate confiscated weapons.',
        },
        {
          id: 'patrol-ready',
          afterStage: 'patrol',
          resumeStage: 'stops',
          snapshot: [
            'patrol-identity-pose',
            'three-van-routes-cargo',
            'inspection-history',
            'deadline',
            'wanted',
          ],
          note: 'Cargo identity and first-empty constraint persist across Continue.',
        },
        {
          id: 'identified',
          afterStage: 'stops',
          resumeStage: 'crate',
          snapshot: [
            'correct-van-curb-pose',
            'cargo-inspection',
            'guard-pose',
            'deadline',
            'health-ammo',
          ],
          note: 'Guard never fires before control returns and inspection is recorded.',
        },
      ],
      failures: [
        {
          id: 'uninspected-attack',
          condition: {
            type: 'candidate-harmed-before-inspection',
          },
          resumeCheckpoint: 'patrol-ready',
          dialogue: [
            {
              speaker: 'Silas',
              text: 'You have attacked a relief driver without even knowing which case he carries.',
              when: 'always',
            },
          ],
        },
        {
          id: 'shipment-expired',
          condition: {
            type: 'candidate-cargo-reached-unrecoverable-destination-or-clock-expired',
          },
          resumeCheckpoint: 'patrol-ready',
          dialogue: [
            {
              speaker: 'Silas',
              text: 'The case has crossed into bonded custody. Bran will not enjoy the delay.',
              when: 'always',
            },
          ],
        },
        {
          id: 'cargo-van-lost',
          condition: {
            type: 'required-cargo-vehicle-destroyed',
          },
          resumeCheckpoint: 'identified',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The case is burning. We need another approach before I take the van.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'empty-driver-treatment',
          stage: 'stops',
          options: [
            {
              id: 'explain',
              text: 'Release inspected empty vans with an explanation.',
              effects: [
                {
                  type: 'flag',
                  id: 'relief-drivers-warned',
                  value: true,
                },
              ],
            },
            {
              id: 'silent-release',
              text: 'Return to the patrol car without naming Bran.',
              effects: [
                {
                  type: 'flag',
                  id: 'relief-drivers-warned',
                  value: false,
                },
              ],
            },
          ],
          outcome:
            'Candidate inspection order is player-driven; released drivers resume their same routes and identities.',
        },
      ],
      consequences: [
        'Bran’s violence, Cora’s death and Felix’s injury are persistent.',
        'Mara now holds a contractor contact under coercion; Cobalt Freight sees an apparent police theft.',
      ],
      rewards: {
        cash: 400,
        unlocks: ['LL-ST-015'],
        flags: ['Felix-shoulder-injury', 'Corvus-coercion'],
      },
      requiredCapabilities: [
        {
          id: 'cinematic',
          missionWork: 'Abduction/restraint/shooting/skip state',
        },
        {
          id: 'impersonation',
          missionWork: 'Siren stops, curb compliance and cargo checks',
        },
        {
          id: 'chase',
          missionWork: 'Three simultaneous named van routes',
        },
        {
          id: 'props',
          missionWork: 'Crate and confiscation locker',
        },
        {
          id: 'director',
          missionWork: 'First-empty selection and injured Felix recovery',
        },
        {
          id: 'police',
          missionWork: 'Legitimate theft/witness heat',
        },
      ],
    },
    {
      id: 'LL-ST-015',
      title: 'Safety Margin',
      contact: 'LL-CHAR-010',
      source: {
        game: 'GTA IV base game',
        title: 'Do You Have Protection?',
        url: 'https://gta.fandom.com/wiki/Do_You_Have_Protection%3F',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'order',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Bran demands a warehouse debtor’s death. Silas instead directs controlled intimidation, revealing his preference for recoverable assets while Mara buys the compact weapon he recommends.',
      cast: [
        'LL-CHAR-001',
        'LL-CHAR-004',
        'LL-CHAR-010',
        'LL-ARC-ARVEN',
        'LL-ARC-CELI',
        'LL-ARC-ORIN',
      ],
      dependencies: {
        all: ['LL-ST-014'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Unstable patron demands killing; companion argues for restraint',
          stageIds: ['order', 'drive'],
          adaptation:
            'The disputed warehouse holds safety equipment rather than a copied adult-business scene.',
        },
        {
          sourceBeat: 'Aim at debtors and selectively wound one resistant actor without killing',
          stageIds: ['aim', 'selective-shot', 'release'],
          adaptation: 'Verified aim ray and leg injury are real mechanics, not a choice label.',
        },
        {
          sourceBeat: 'Companion takes player to gun shop for compact automatic weapon, then home',
          stageIds: ['shop', 'return'],
          adaptation: 'Actual shop transaction, original weapon, funded receipt and persistence.',
        },
      ],
      stages: [
        {
          id: 'order',
          type: 'contractor-scene',
          scene: 'saltgate-estate',
          objective: 'Hear Bran’s warehouse order and leave with Silas.',
          completion: [
            {
              type: 'companion-collected',
              actor: 'LL-CHAR-004',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'The warehouse has paid Cobalt instead of me. Close it.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Close the account or the building?',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Whichever keeps them from making the mistake again.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'We can collect without removing everyone who can pay.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Then make your lesson memorable.',
              when: 'always',
            },
          ],
        },
        {
          id: 'drive',
          type: 'companion-drive',
          scene: 'vector-lockup',
          objective: 'Take Silas to the warehouse safety-equipment counter.',
          completion: [
            {
              type: 'companion-at-scene',
              actor: 'LL-CHAR-004',
              scene: 'vector-lockup',
            },
          ],
          dialogue: [
            {
              speaker: 'Silas',
              text: 'Bran confuses fear with agreement. Fear stops working when it has nothing left to lose.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You waited to explain that until we were outside.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'It works better without his interruption.',
              when: 'always',
            },
          ],
        },
        {
          id: 'aim',
          type: 'aim-intimidation',
          scene: 'vector-lockup',
          objective:
            'Keep your weapon trained on the foreman until he presents the safety-tender ledger; keep the clerk alive.',
          completion: [
            {
              type: 'aim-held',
              actor: 'warehouse-foreman',
              rayVisible: true,
              seconds: 3,
            },
            {
              type: 'ledger-presented',
              id: 'safety-tender-ledger',
            },
          ],
          dialogue: [
            {
              speaker: 'Arven',
              text: 'We paid the route office. Cobalt said Corvus lost the tender.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Open your book. We will settle the difference.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Hands where I can see them. Nobody behind the counter moves toward a weapon.',
              when: 'always',
            },
            {
              speaker: 'Celi',
              text: 'The book is in the drawer. I can open it slowly.',
              when: 'always',
            },
          ],
          encounter: {
            castBindings: {
              'warehouse-foreman': 'LL-ARC-ARVEN',
              'warehouse-clerk': 'LL-ARC-CELI',
              'warehouse-enforcer': 'LL-ARC-ORIN',
            },
            civilians: ['warehouse-clerk', 'warehouse-loader'],
            resistantActor: 'warehouse-enforcer',
            aimTargets: ['warehouse-foreman', 'warehouse-enforcer', 'warehouse-loader'],
            noArbitraryFearTickWithoutAim: true,
          },
        },
        {
          id: 'selective-shot',
          type: 'localized-injury',
          scene: 'vector-lockup',
          objective:
            'Stop the armed enforcer with a controlled leg shot; do not kill him or the staff.',
          completion: [
            {
              type: 'localized-injury',
              actor: 'warehouse-enforcer',
              hitRegion: 'leg',
              alive: true,
            },
            {
              type: 'hostile-disarmed',
              actor: 'warehouse-enforcer',
            },
          ],
          dialogue: [
            {
              speaker: 'Orin',
              text: 'You do not take that ledger out of here.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'The leg, Mara. We need the answer alive.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Put it down. You have seen what I am aiming at.',
              when: 'always',
            },
            {
              speaker: 'Orin',
              text: 'All right! Keep it away from me!',
              when: 'always',
            },
          ],
          hitVolumes: {
            leg: 'Distinct live limb region, generous readable target assistance for all controls',
            torso: 'Normal physical damage; killing fails',
            environment: 'May fire a warning shot but it does not count as the localized injury',
          },
          afterHit:
            'Visible drop of weapon, injured kneel and clinic assistance call; no invulnerable leg-health fiction.',
        },
        {
          id: 'release',
          type: 'ledger-resolution',
          scene: 'vector-lockup',
          objective:
            'Collect the ledger copy, arrange medical help and release the warehouse staff.',
          completion: [
            {
              type: 'evidence-collected',
              id: 'safety-tender-ledger',
            },
            {
              type: 'injured-actor-care-arranged',
            },
            {
              type: 'civilians-released',
            },
          ],
          dialogue: [
            {
              speaker: 'Arven',
              text: 'You have the book. We can pay one of you, not both.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The city has already paid for every mask in this room.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'The right to deliver them is separate.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'That is a convenient separation.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Convenience is most of my job.',
              when: 'always',
            },
          ],
        },
        {
          id: 'shop',
          type: 'escorted-purchase',
          scene: 'rook-store',
          objective: 'Go with Silas to Rook and purchase or equip the approved compact SMG.',
          completion: [
            {
              type: 'owned-equipped-weapon-role',
              role: 'compact-smg',
            },
            {
              type: 'story-purchase-receipt',
              id: 'Silas-equipment-advance',
            },
          ],
          dialogue: [
            {
              speaker: 'Silas',
              text: 'Bran has financed your equipment. A compact automatic, not a siege.',
              when: 'always',
            },
            {
              speaker: 'Shopkeeper',
              text: 'Here is the Wren. Price is on the card. Ammunition is a separate receipt.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Put the payer on it too.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'You do like records.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I like to know who claims to own my hands.',
              when: 'always',
            },
          ],
          service: {
            itemRole: 'compact-smg',
            allowance:
              'Exact displayed item price credited as a one-use employer equipment voucher',
            ifAlreadyOwned: 'Equip existing weapon; convert no unused allowance into cash.',
            ammunition:
              'One displayed basic pack included and recorded; further packs ordinary purchases.',
          },
        },
        {
          id: 'return',
          type: 'companion-report',
          scene: 'saltgate-estate',
          objective: 'Return Silas to Bran and report the warehouse resolution.',
          completion: [
            {
              type: 'passenger-delivered',
              actor: 'LL-CHAR-004',
            },
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'Is the warehouse closed?',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'The payment is coming. Their foreman has understood the margin for error.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The staff are alive. They will need a route that does not change owners every morning.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'You concern yourself with the wrong part of a contract.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'warehouse',
          afterStage: 'drive',
          resumeStage: 'aim',
          snapshot: ['Silas-pose', 'staff-health', 'enforcer-weapon', 'player-ammo', 'wallet'],
          note: 'Aim must be reacquired after resume; no unseen completion tick.',
        },
        {
          id: 'shot-ready',
          afterStage: 'aim',
          resumeStage: 'selective-shot',
          snapshot: [
            'foreman-compliance',
            'clerk-safe',
            'enforcer-hit-volumes',
            'ledger',
            'ammo-health',
          ],
          note: 'Restores before lethal failure; region/hit feedback must remain readable.',
        },
        {
          id: 'store-ready',
          afterStage: 'release',
          resumeStage: 'shop',
          snapshot: [
            'witnesses-released',
            'enforcer-injury-care',
            'ledger-copy',
            'one-use-voucher',
          ],
          note: 'Continue and owned weapons cannot double the employer allowance.',
        },
      ],
      failures: [
        {
          id: 'wrong-victim',
          condition: {
            type: 'protected-actor-dead',
            actors: [
              'warehouse-foreman',
              'warehouse-clerk',
              'warehouse-loader',
              'warehouse-enforcer',
            ],
          },
          resumeCheckpoint: 'warehouse',
          dialogue: [
            {
              speaker: 'Silas',
              text: 'We needed a payment and an explanation. Dead staff give us neither.',
              when: 'always',
            },
          ],
        },
        {
          id: 'silas-lost',
          condition: {
            type: 'companion-dead-or-abandoned',
            actor: 'LL-CHAR-004',
            grace: 30,
          },
          resumeCheckpoint: 'warehouse',
          dialogue: [
            {
              speaker: 'Silas',
              text: 'We are supposed to be negotiating together. Where are you?',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'medical-cost',
          stage: 'release',
          options: [
            {
              id: 'employer',
              text: 'Charge medical transport to Bran’s tender account.',
              effects: [
                {
                  type: 'flag',
                  id: 'warehouse-medical-payer',
                  value: 'Corvus',
                },
              ],
            },
            {
              id: 'personal',
              text: 'Pay the disclosed transport cost yourself.',
              effects: [
                {
                  type: 'pay',
                  amount: 40,
                },
                {
                  type: 'flag',
                  id: 'warehouse-medical-payer',
                  value: 'Mara',
                },
              ],
            },
          ],
          outcome:
            'Medical help arrives in both; personal choice appears only with sufficient cash and is never a hidden success gate.',
        },
      ],
      consequences: [
        'Silas’s asset-preservation motive is visible before his betrayal.',
        'Safety tender evidence, wounded enforcer and compact SMG receipt persist.',
      ],
      rewards: {
        cash: 450,
        unlocks: ['LL-ST-016', 'compact-smg-role'],
      },
      requiredCapabilities: [
        {
          id: 'selectiveForce',
          missionWork: 'Real aim intimidation and nonfatal leg hit region',
        },
        {
          id: 'passengers',
          missionWork: 'Silas escorted shop trip',
        },
        {
          id: 'firearms',
          missionWork: 'Compact weapon role/shop transaction',
        },
        {
          id: 'director',
          missionWork: 'Voucher, care and evidence',
        },
        {
          id: 'interior',
          missionWork: 'Warehouse counter and visible staff',
        },
      ],
    },
    {
      id: 'LL-ST-016',
      title: 'Last Platform',
      contact: 'LL-CHAR-010',
      source: {
        game: 'GTA IV base game',
        title: 'Final Destination',
        url: 'https://gta.fandom.com/wiki/Final_Destination',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'order',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Bran blames Marek Cobalt for leaking a cargo schedule. Silas warns that attacking him will start a freight war; Mara meets an armed courier on the upper rail platform.',
      cast: ['LL-CHAR-001', 'LL-CHAR-004', 'LL-CHAR-010', 'LL-CHAR-049', 'LL-CHAR-048'],
      dependencies: {
        all: ['LL-ST-015'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Patron accuses rival’s son; adviser objects; rail-platform target and guard',
          stageIds: ['order', 'station', 'platform'],
          adaptation: 'A freight heir is blamed for the falsified control-crate schedule.',
        },
        {
          sourceBeat:
            'Target can be killed on platform or flee across tracks to car, requiring chase',
          stageIds: ['platform', 'tracks', 'car', 'aftermath'],
          adaptation:
            'Both battle routes have real geometry and distinct dialogue; no immediate win after a waypoint.',
        },
        {
          sourceBeat: 'Retaliation and wider contact unlock',
          stageIds: ['aftermath'],
          adaptation: 'Cobalt feud and Public Terminal LL-ST-022 unlock remain in the graph.',
        },
      ],
      stages: [
        {
          id: 'order',
          type: 'contractor-scene',
          scene: 'saltgate-estate',
          objective: 'Hear Bran’s accusation and Silas’s warning.',
          completion: [
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'Marek sold the control-crate schedule. Cobalt’s son thinks a surname makes him untouchable.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'We do not know who altered the schedule. Killing the courier closes the question, not the leak.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Then leave the question with me.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'If he has the schedule, I will get it.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'And make sure he does not sell another.',
              when: 'always',
            },
          ],
        },
        {
          id: 'station',
          type: 'station-access',
          scene: 'brigid-station',
          objective: 'Reach Brigid Market’s upper platform and identify Marek and his escort.',
          completion: [
            {
              type: 'scene-volume-reached',
              volume: 'upper-platform',
              z: 22,
            },
            {
              type: 'actor-identified',
              actor: 'LL-CHAR-049',
            },
          ],
          dialogue: [
            {
              speaker: 'Marek',
              text: 'You are the driver who wore a police car to take our crate.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Show me the cargo schedule.',
              when: 'always',
            },
            {
              speaker: 'Marek',
              text: 'Ask the man who gave you the car.',
              when: 'always',
            },
          ],
          traversal:
            'Actual stair/elevator to upper platform; passenger crowd evacuates through marked access.',
          targets: [
            {
              id: 'LL-CHAR-049',
              clue: 'Cobalt cargo case',
            },
            {
              id: 'marek-escort',
              clue: 'freight guard insignia',
            },
          ],
        },
        {
          id: 'platform',
          type: 'platform-combat',
          scene: 'brigid-station',
          objective:
            'Survive the escort’s attack and stop Marek before he escapes with the schedule.',
          completion: [
            {
              type: 'guard-neutralized',
              id: 'marek-escort',
            },
            {
              type: 'branch-outcome-recorded',
              values: ['Marek-stopped-on-platform', 'Marek-fled'],
            },
          ],
          dialogue: [
            {
              speaker: 'Escort',
              text: 'Nobody takes the case. Clear the platform.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Everybody off the edge!',
              when: 'always',
            },
            {
              speaker: 'Marek',
              text: 'Bran is burning his own evidence. Tell him that if you live.',
              when: 'always',
            },
          ],
          encounter: {
            guardWeapon: 'compact-smg',
            targetWeapon: 'pistol',
            targetRunsAfter: 'guard draws or initial damage',
            targetCanBeKilledHere: true,
            civilians:
              'Real crowd flight, protected by normal collision/cover, not invisible despawn.',
          },
          branches: [
            {
              when: {
                type: 'actor-dead',
                actor: 'LL-CHAR-049',
              },
              next: 'aftermath',
              collect: 'cargo-schedule',
              effects: [
                {
                  type: 'flag',
                  id: 'Marek-fled',
                  value: false,
                },
              ],
            },
            {
              when: {
                type: 'actor-reached',
                actor: 'LL-CHAR-049',
                volume: 'service-footbridge',
              },
              next: 'tracks',
              effects: [
                {
                  type: 'flag',
                  id: 'Marek-fled',
                  value: true,
                },
              ],
            },
          ],
        },
        {
          id: 'tracks',
          type: 'track-pursuit',
          scene: 'brigid-station',
          objective: 'Cross by the service footbridge and follow Marek down the far station exit.',
          completion: [
            {
              type: 'player-reached',
              volume: 'far-street-exit',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Marek, leave the case!',
              when: 'always',
            },
            {
              speaker: 'Marek',
              text: 'You need to learn which way these trains run!',
              when: 'always',
            },
          ],
          enabledWhen: {
            type: 'flag-is',
            id: 'Marek-fled',
            value: true,
          },
          traversal: {
            sourceCounterpart: 'Dangerous track crossing escape',
            originalRoute:
              'An operational service crossing/footbridge with actual trains underneath; exposed rail shortcut remains physically dangerous.',
            noAutomaticTrainFreeze: true,
            targetVehicle: 'Cobalt-station-sedan',
          },
        },
        {
          id: 'car',
          type: 'target-car-chase',
          scene: 'brigid-station',
          objective:
            'Take an available vehicle and stop Marek’s sedan before it enters Cobalt’s secured yard.',
          completion: [
            {
              type: 'actor-dead',
              actor: 'LL-CHAR-049',
            },
            {
              type: 'evidence-collected',
              id: 'cargo-schedule',
            },
          ],
          dialogue: [
            {
              speaker: 'Silas',
              text: 'Mara, do you still have a choice?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'He opened fire. He is heading for a freight gate.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Then Bran has already made the choice expensive.',
              when: 'always',
            },
          ],
          enabledWhen: {
            type: 'flag-is',
            id: 'Marek-fled',
            value: true,
          },
          chase: {
            from: 'brigid-station',
            to: 'bellhaven-lot',
            terminal: 'Cobalt security road',
            routeSolver: 'legal-road',
            canDisableCar: true,
            dismountedFinalResistance: 'Marek takes actual cover and continues armed combat.',
            lossGrace: 25,
          },
        },
        {
          id: 'aftermath',
          type: 'phone-evidence',
          scene: 'dispatch',
          objective: 'Recover Marek’s schedule and hear the fallout from Bran and Silas.',
          completion: [
            {
              type: 'evidence-secured',
              id: 'cargo-schedule',
            },
            {
              type: 'call-resolved',
              topic: 'Cobalt-retaliation',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'My port has become quieter.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'His schedule was changed after he signed it.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Then he should have read it again.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Idris Cobalt will not read it that way. Be careful who offers to repair this.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Nadia found a public terminal that can read the document stamps. Meet her when you can.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'unlock',
              ids: ['LL-ST-017', 'LL-ST-022'],
            },
            {
              type: 'flag',
              id: 'cobalt-feud',
              value: true,
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'platform-ready',
          afterStage: 'station',
          resumeStage: 'platform',
          snapshot: ['Marek', 'escort', 'civilian-routes', 'train-timetable', 'player-health-ammo'],
          note: 'Crowd/rail traffic remain deterministic and supported, not cleared from the scene.',
        },
        {
          id: 'street-chase',
          afterStage: 'tracks',
          resumeStage: 'car',
          snapshot: ['Marek-sedan', 'player-vehicle-options', 'schedule', 'target-route'],
          note: 'Only exists if target genuinely fled the platform.',
        },
      ],
      failures: [
        {
          id: 'target-escaped',
          condition: {
            type: 'target-reached-secured-destination-or-lost',
            actor: 'LL-CHAR-049',
            grace: 25,
          },
          resumeCheckpoint: 'street-chase',
          dialogue: [
            {
              speaker: 'Bran',
              text: 'He is behind Cobalt’s gates. Do not ask me to call them for you.',
              when: 'always',
            },
          ],
        },
        {
          id: 'schedule-lost',
          condition: {
            type: 'objective-destroyed',
            id: 'cargo-schedule',
          },
          resumeCheckpoint: 'platform-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Without the schedule, this is only Bran’s accusation and another body.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'combat-route',
          stage: 'platform',
          options: [
            {
              id: 'platform-stop',
              text: 'Stop Marek during the platform fight.',
              effects: [
                {
                  type: 'flag',
                  id: 'marek-battle-route',
                  value: 'platform',
                },
              ],
            },
            {
              id: 'pursuit-stop',
              text: 'Follow his rail/street escape and stop him later.',
              effects: [
                {
                  type: 'flag',
                  id: 'marek-battle-route',
                  value: 'pursuit',
                },
              ],
            },
          ],
          outcome:
            'Emergent combat branches; player actions, not a menu, select them. Both recover the schedule and cause the freight feud.',
        },
      ],
      consequences: [
        'Marek’s death escalates the conflict with Idris Cobalt.',
        'Public Terminal is a separate full mission LL-ST-022, required before Pressure Vessel; it is not folded into an email popup here.',
      ],
      rewards: {
        cash: 600,
        unlocks: ['LL-ST-017', 'LL-ST-022'],
        flags: ['cobalt-feud', 'marek-dead'],
      },
      requiredCapabilities: [
        {
          id: 'rail',
          missionWork: 'Real platform/track traffic and station exit',
        },
        {
          id: 'vertical',
          missionWork: 'Upper platform stair/service crossing',
        },
        {
          id: 'chase',
          missionWork: 'Target foot-to-sedan alternative',
        },
        {
          id: 'firearms',
          missionWork: 'Crowded station fight',
        },
        {
          id: 'director',
          missionWork: 'Emergent route and outside-pack unlock',
        },
        {
          id: 'phone',
          missionWork: 'Evidence/retaliation calls',
        },
      ],
    },
    {
      id: 'LL-ST-017',
      title: 'Chain Reaction',
      contact: 'LL-CHAR-010',
      source: {
        game: 'GTA IV base game',
        title: 'No Love Lost',
        url: 'https://gta.fandom.com/wiki/No_Love_Lost',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'order',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Rhea Corvus has hired Ansel, a biker courier, to disclose unsafe floodgate schedules. Bran calls it a code theft and orders Mara to stop him before the riders meet.',
      cast: ['LL-CHAR-001', 'LL-CHAR-010', 'LL-ARC-RHEA', 'LL-ARC-ANSEL'],
      dependencies: {
        all: ['LL-ST-016'],
      },
      sourceBeats: [
        {
          sourceBeat: 'Patron’s family dispute and biker target',
          stageIds: ['order', 'meet'],
          adaptation:
            'Adult engineer niece defies contractor control over safety testimony; no copied romance/daughter scene.',
        },
        {
          sourceBeat: 'Motorcycle target chase with rider reinforcements then park firefight',
          stageIds: ['ride', 'riders', 'lot', 'report'],
          adaptation:
            'Actual two-wheel pursuit, three reinforcing riders and a dismounted terminal battle.',
        },
      ],
      stages: [
        {
          id: 'order',
          type: 'contractor-scene',
          scene: 'saltgate-estate',
          objective: 'Hear Bran’s claim about stolen floodgate access schedules.',
          completion: [
            {
              type: 'objective-received',
              id: 'gate-schedule-recovery',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'My niece handed access schedules to a courier with a club patch.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Why would your engineer do that?',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Because she mistakes a family name for permission to embarrass it.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You hired her to certify the gates.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'I hired her to certify them open.',
              when: 'always',
            },
          ],
        },
        {
          id: 'meet',
          type: 'courier-confrontation',
          scene: 'brigid-station',
          objective: 'Find Rhea and Ansel at the service-road meeting point.',
          completion: [
            {
              type: 'target-fleeing',
              actor: 'LL-ARC-ANSEL',
            },
            {
              type: 'schedule-transfer-seen',
            },
          ],
          dialogue: [
            {
              speaker: 'Rhea',
              text: 'The opening sequence is unsafe. He changed the pressure limits.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then send the test record, not just the keys.',
              when: 'always',
            },
            {
              speaker: 'Ansel',
              text: 'It is on this drive. Three people get a copy before anyone burns it.',
              when: 'always',
            },
            {
              speaker: 'Bran on phone',
              text: 'Stop the rider, Mara. You were not hired to hold a hearing.',
              when: 'always',
            },
            {
              speaker: 'Rhea',
              text: 'If you stop him, read it first.',
              when: 'always',
            },
          ],
          staging:
            'Ansel mounts and accelerates a visible motorcycle; a second functional bike is parked with a spoken offer from Rhea.',
          protect: ['LL-ARC-RHEA'],
        },
        {
          id: 'ride',
          type: 'motorcycle-pursuit',
          scene: 'bellhaven-lot',
          objective:
            'Mount the available motorcycle and follow Ansel toward Bellhaven Gantry Park.',
          completion: [
            {
              type: 'mounted-pursuit-route',
              target: 'LL-ARC-ANSEL',
              playerVehicleRole: 'motorcycle',
              minimumRouteLegs: 2,
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Ansel, let me see the pressure test!',
              when: 'always',
            },
            {
              speaker: 'Ansel',
              text: 'Corvus sees documents by setting fire to them. Keep your distance!',
              when: 'always',
            },
          ],
          vehicle: {
            role: 'motorcycle',
            mechanics: ['lean-steering', 'braking', 'rider-fall', 'remount'],
          },
          route: {
            from: 'brigid-station',
            to: 'bellhaven-lot',
            via: 'two Bellhaven public road segments',
            targetSpeed: 'Fast but corners and traffic constrain it.',
            lossDistance: 270,
            graceSeconds: 25,
          },
        },
        {
          id: 'riders',
          type: 'moving-reinforcement',
          scene: 'bellhaven-lot',
          objective: 'Stay with Ansel as three riders join him; avoid the public promenade.',
          completion: [
            {
              type: 'reinforcement-arrival-recorded',
              count: 3,
            },
            {
              type: 'target-at-terminal-lot',
              actor: 'LL-ARC-ANSEL',
            },
          ],
          dialogue: [
            {
              speaker: 'Rider',
              text: 'That is Corvus’s driver. Take him to the stalls.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You are putting the whole park between him and a gun.',
              when: 'always',
            },
            {
              speaker: 'Ansel',
              text: 'Then leave the gun outside it.',
              when: 'always',
            },
          ],
          encounter: {
            mountedActors: ['gantry-rider-one', 'gantry-rider-two', 'gantry-rider-three'],
            joinTriggers: ['crossing one', 'repair-stall approach'],
            targetAdaptsToBlockedRoad: true,
            playerCanBrakeAndRecover: true,
          },
        },
        {
          id: 'lot',
          type: 'biker-firefight',
          scene: 'bellhaven-lot',
          objective:
            'Survive the riders’ ambush, stop Ansel’s armed resistance and recover the drive.',
          completion: [
            {
              type: 'hostiles-neutralized',
              actors: [
                'gantry-rider-one',
                'gantry-rider-two',
                'gantry-rider-three',
                'LL-ARC-ANSEL',
              ],
            },
            {
              type: 'evidence-collected',
              id: 'gate-pressure-drive',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Do not shoot. Rhea sent this for a reason.',
              when: 'always',
            },
            {
              speaker: 'Rider',
              text: 'He ordered Marek dead and sent you for the next name.',
              when: 'always',
            },
            {
              speaker: 'Ansel',
              text: 'Get behind the stall!',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The drive stays out of this. Leave it on the bench.',
              when: 'always',
            },
          ],
          encounter: {
            dismounts: 'Actual braking/parking and transition into repair-stall cover',
            weapons: ['pistol', 'compact-smg', 'pistol', 'pistol'],
            targetOutcome: 'Ansel dies in armed resistance; civilian Rhea is not a hidden target.',
            cover: ['repair stall masonry', 'gantry footings', 'parked bikes'],
            civiliansExit: 'promenade away from stalls',
          },
        },
        {
          id: 'report',
          type: 'evidence-report',
          scene: 'saltgate-estate',
          objective:
            'Retain a copy of the unsafe pressure test and return the recovered schedule drive to Bran.',
          completion: [
            {
              type: 'evidence-copied',
              id: 'gate-pressure-drive',
            },
            {
              type: 'objective-delivered',
              id: 'gate-schedule-drive',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'Is my niece’s courier finished?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The rider is dead. The pressure limits are wrong.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'You drive. She calculates. I decide which error we can afford.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You have decided who pays for every one.',
              when: 'always',
            },
            {
              speaker: 'Rhea by message',
              text: 'You recovered the drive. Please do not let that be the last place the test exists.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'courier-ready',
          afterStage: 'order',
          resumeStage: 'meet',
          snapshot: ['Rhea', 'Ansel-drive-bike', 'player-bike', 'wallet'],
          note: 'Both motorcycles are accessible; never restore an already-destroyed offered bike.',
        },
        {
          id: 'mounted',
          afterStage: 'meet',
          resumeStage: 'ride',
          snapshot: ['Ansel-route', 'player-bike', 'Rhea-safe', 'drive', 'health-equipment'],
          note: 'Rider falls remain recoverable until the target genuinely escapes.',
        },
        {
          id: 'lot-ready',
          afterStage: 'riders',
          resumeStage: 'lot',
          snapshot: ['four-biker-poses', 'bikes', 'civilians-exits', 'health-ammo', 'drive'],
          note: 'Dismount and cover positions cannot overlap collision props.',
        },
      ],
      failures: [
        {
          id: 'courier-escaped',
          condition: {
            type: 'target-lost',
            actor: 'LL-ARC-ANSEL',
            grace: 25,
          },
          resumeCheckpoint: 'mounted',
          dialogue: [
            {
              speaker: 'Bran',
              text: 'The courier has a city full of people willing to listen. I wanted one willing to stop him.',
              when: 'always',
            },
          ],
        },
        {
          id: 'rhea-hurt',
          condition: {
            type: 'protected-actor-harmed',
            actor: 'LL-ARC-RHEA',
          },
          resumeCheckpoint: 'courier-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'She was trying to prevent a failure. I will not turn her into another one.',
              when: 'always',
            },
          ],
        },
        {
          id: 'drive-burned',
          condition: {
            type: 'objective-destroyed',
            id: 'gate-pressure-drive',
          },
          resumeCheckpoint: 'lot-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'That test was the only thing here worth protecting.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'test-recipient',
          stage: 'report',
          options: [
            {
              id: 'nadia',
              text: 'Give Nadia the copied pressure test.',
              effects: [
                {
                  type: 'flag',
                  id: 'pressure-test-custodian',
                  value: 'Nadia',
                },
              ],
            },
            {
              id: 'tomas',
              text: 'Give Tomas the copy for an independent engineering check.',
              effects: [
                {
                  type: 'flag',
                  id: 'pressure-test-custodian',
                  value: 'Tomas',
                },
              ],
            },
          ],
          outcome:
            'Both preserve the safety evidence; later interpretation/callback scene changes. Bran receives the schedule drive but not the sole copy.',
        },
      ],
      consequences: [
        'Rhea’s resistance and Ansel’s death expose the human cost of Bran’s safety regime.',
        'A copied pressure test is a durable original clue for the commissioning finale.',
      ],
      rewards: {
        cash: 650,
        unlocks: ['LL-ST-018 when LL-ST-022 complete'],
      },
      requiredCapabilities: [
        {
          id: 'motorcycles',
          missionWork: 'Real mounted pursuit/falls/recovery and rider AI',
        },
        {
          id: 'chase',
          missionWork: 'Three mounted reinforcements and terminal dismount',
        },
        {
          id: 'firearms',
          missionWork: 'Park battle and civilian paths',
        },
        {
          id: 'director',
          missionWork: 'Drive duplication is a narrative copy, never a farming pickup',
        },
        {
          id: 'cinematic',
          missionWork: 'Family-engineering conflict',
        },
      ],
    },
    {
      id: 'LL-ST-018',
      title: 'Pressure Vessel',
      contact: 'LL-CHAR-010',
      source: {
        game: 'GTA IV base game',
        title: 'Rigged to Blow',
        url: 'https://gta.fandom.com/wiki/Rigged_to_Blow_%28GTA_IV%29',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'edda',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Bran calls a loaded truck obsolete equipment for disposal. Edda’s warning and a leaking detonator reveal its real purpose: destroying Cobalt’s evacuated contractor yard.',
      cast: ['LL-CHAR-001', 'LL-CHAR-010', 'LL-CHAR-026', 'LL-CHAR-002'],
      dependencies: {
        all: ['LL-ST-017', 'LL-ST-022'],
        externalToPack: ['LL-ST-022'],
        reason:
          'Public Terminal authenticates the disposal authorization; source counterpart also requires Logging On. Do not silently remove this outside-pack mission.',
      },
      sourceBeats: [
        {
          sourceBeat: 'Patron’s spouse discusses domestic/moral cost before misleading truck order',
          stageIds: ['edda', 'order'],
          adaptation: 'Engineer Edda questions the way Bran turns compliance into ownership.',
        },
        {
          sourceBeat: 'Factory pickup; explosive truck integrity and cautious drive',
          stageIds: ['truck', 'route'],
          adaptation: 'A live impact gauge and real bridge route preserve hazardous cargo tension.',
        },
        {
          sourceBeat:
            'Park inside garage, trigger explosive, escape area; permanent destroyed garage and incidental cousin call',
          stageIds: ['arm', 'retreat', 'detonate', 'escape'],
          adaptation:
            'Evacuation must be verified before a safe remote detonation; rubble persists.',
        },
      ],
      stages: [
        {
          id: 'edda',
          type: 'residence-scene',
          scene: 'saltgate-estate',
          objective: 'Speak with Edda while Bran’s office prepares the disposal papers.',
          completion: [
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Edda',
              text: 'I designed the gate controller. He put my name on every pressure limit he changed.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Why stay in the office?',
              when: 'always',
            },
            {
              speaker: 'Edda',
              text: 'Because if I leave, the next signature will be somebody who never saw the water.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I signed a route once because I could not imagine anyone changing it.',
              when: 'always',
            },
            {
              speaker: 'Edda',
              text: 'Then you know certainty is not the same thing as care.',
              when: 'always',
            },
          ],
        },
        {
          id: 'order',
          type: 'contractor-order',
          scene: 'saltgate-estate',
          objective: 'Take Bran’s authenticated disposal order to the Furnace factory.',
          completion: [
            {
              type: 'objective-received',
              id: 'authenticated-disposal-order',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'A truck of obsolete equipment. Dry Basin has offered to accept it.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Offered in writing?',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'The terminal authenticated the form. You have your precious record.',
              when: 'always',
            },
            {
              speaker: 'Edda',
              text: 'Read the load label before you start the engine.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'It is a disposal run, not a lecture.',
              when: 'always',
            },
          ],
          route: {
            from: 'saltgate-estate',
            to: 'furnace-factory',
            solver: 'legal-city-road',
          },
        },
        {
          id: 'truck',
          type: 'hazardous-vehicle-pickup',
          scene: 'furnace-factory',
          objective: 'Inspect and board the loaded flatbed; recognize the demolition circuit.',
          completion: [
            {
              type: 'vehicle-boarded',
              vehicle: 'pressure-flatbed',
            },
            {
              type: 'hazard-identified',
              id: 'loaded-demolition-circuit',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'These are not obsolete parts. That is a demolition receiver.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Then drive it as if the equipment has value.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Is the yard empty?',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'The disposal permit says it is.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I will check before I turn anything on.',
              when: 'always',
            },
          ],
          vehicle: {
            id: 'pressure-flatbed',
            role: 'heavy-truck',
            cargo: 'sealed-demolition-charge',
            integrity: 100,
            lowIntegrityWarningAt: 45,
            criticalAt: 20,
          },
          hud: ['truck-integrity', 'impact-warning', 'destination-evacuation-status'],
          handling: 'Ordinary truck inertia and collision, never an on-rails movie.',
        },
        {
          id: 'route',
          type: 'hazardous-drive',
          scene: 'dry-basin-yard',
          objective: 'Drive the flatbed to Dry Basin without exhausting the cargo integrity gauge.',
          completion: [
            {
              type: 'vehicle-at-scene',
              vehicle: 'pressure-flatbed',
              scene: 'dry-basin-yard',
            },
            {
              type: 'integrity-positive',
              vehicle: 'pressure-flatbed',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Mara, Nadia found a discount dinner. Want a ride?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I am carrying a demolition circuit across the city.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'Then I will leave the reservation open. Call me when your work stops sounding like a warning label.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Read every label they give you, Felix.',
              when: 'always',
            },
          ],
          route: {
            from: 'furnace-factory',
            to: 'dry-basin-yard',
            solver: 'legal open heavy-vehicle route via graded crossings',
            exclude: ['broken crossing', 'stairs', 'rail decks', 'unrated pedestrian alleys'],
            auditRequired:
              'Validate actual bridge/turn clearances and traffic before any runtime mission claim.',
          },
          hazard: {
            ordinaryMinorBumpLoss: 3,
            hardImpactLoss: 'proportional to real collision impulse',
            criticalWarning: 'audible receiver alarm plus subtitle/gauge pulse',
            simulationPausedDuringMenus: true,
          },
          phone:
            'Optional answer or accessible subtitle summary; driving input remains owned by the game.',
        },
        {
          id: 'arm',
          type: 'park-verify-arm',
          scene: 'dry-basin-yard',
          objective:
            'Park inside the garage, verify the muster board and send the final worker outside before arming.',
          completion: [
            {
              type: 'vehicle-parked-inside',
              vehicle: 'pressure-flatbed',
              garage: 'demolition-bay',
              speedBelow: 2,
            },
            {
              type: 'evacuation-verified',
              civiliansRemaining: 0,
            },
            {
              type: 'charge-armed',
            },
          ],
          dialogue: [
            {
              speaker: 'Worker',
              text: 'They told us disposal after the shift. We are still here.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Get everyone past the berm. Nobody returns for a tool.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'The authorization says vacant.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I am standing here. The authorization is lying.',
              when: 'always',
            },
          ],
          originalAdditionalObjective:
            'Real civilian evacuation before the source-equivalent detonation; adds substance rather than replacing careful driving.',
          arming:
            'Visible receiver at driver-side exit; no touch prompt until truck stationary and muster verified.',
        },
        {
          id: 'retreat',
          type: 'blast-distance',
          scene: 'dry-basin-yard',
          objective: 'Leave the truck and reach the blast-safe berm with the remote trigger.',
          completion: [
            {
              type: 'player-in-safe-volume',
              volume: 'yard-blast-berm',
            },
            {
              type: 'all-civilians-in-safe-volume',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Everybody down behind the wall. Hands over your ears.',
              when: 'always',
            },
            {
              speaker: 'Worker',
              text: 'They will say we abandoned the yard.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then tell them I made you. Keep the names on that muster sheet.',
              when: 'always',
            },
          ],
          range:
            'Safe volume and line-of-blast tested against authored charge radius; no invisible off-screen immunity.',
        },
        {
          id: 'detonate',
          type: 'remote-detonation',
          scene: 'dry-basin-yard',
          objective:
            'Activate the remote only after everyone is clear; witness the physical demolition.',
          completion: [
            {
              type: 'charge-detonated-by-player',
            },
            {
              type: 'garage-destroyed',
              id: 'dry-basin-demolition-bay',
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The yard is clear. I am ending the load here.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Good. Cobalt can tender for his own reconstruction.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'This was never a disposal contract.',
              when: 'always',
            },
          ],
          action:
            'Actual remote input invokes existing physical explosive/fire volumes with authored structure damage; original art/audio required.',
          persistentWorldPatch: {
            id: 'dry-basin-yard-demolished',
            rubble: true,
            closedBay: true,
            dateRecorded: true,
          },
        },
        {
          id: 'escape',
          type: 'area-and-wanted-escape',
          scene: 'dispatch',
          objective:
            'Leave the blast cordon, lose any active police search and preserve the muster sheet.',
          completion: [
            {
              type: 'outside-blast-cordon',
            },
            {
              type: 'wanted-zero',
            },
            {
              type: 'evidence-secured',
              id: 'yard-evacuation-muster',
            },
          ],
          dialogue: [
            {
              speaker: 'Edda',
              text: 'The alarms reached my office. Tell me there were no workers.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'There were. They are outside now.',
              when: 'always',
            },
            {
              speaker: 'Edda',
              text: 'He will call that a successful calculation.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Nadia gets the muster sheet before he edits it.',
              when: 'always',
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'truck-ready',
          afterStage: 'order',
          resumeStage: 'truck',
          snapshot: [
            'disposal-authentication',
            'truck-charge-integrity',
            'wallet',
            'Edda-dialogue',
          ],
          note: 'No claim this mission is available until separate LL-ST-022 is integrated and complete.',
        },
        {
          id: 'yard-ready',
          afterStage: 'route',
          resumeStage: 'arm',
          snapshot: ['truck-position-integrity', 'charge-unarmed', 'workers', 'muster', 'wanted'],
          note: 'Retains damage and workers; never auto-certifies an occupied yard as vacant.',
        },
        {
          id: 'armed',
          afterStage: 'arm',
          resumeStage: 'retreat',
          snapshot: ['armed-charge', 'remote', 'worker-routes', 'truck', 'muster'],
          note: 'Mid-arming Continue must neither detonate twice nor lose the remote.',
        },
        {
          id: 'blast-ready',
          afterStage: 'retreat',
          resumeStage: 'detonate',
          snapshot: ['player-safe', 'civilians-safe', 'charge-armed', 'muster'],
          note: 'Safe volume verified again before trigger, including after restore.',
        },
      ],
      failures: [
        {
          id: 'truck-lost',
          condition: {
            type: 'truck-destroyed-or-abandoned',
            vehicle: 'pressure-flatbed',
            grace: 30,
          },
          resumeCheckpoint: 'truck-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Stop the road. Nobody approaches that load.',
              when: 'always',
            },
          ],
        },
        {
          id: 'integrity-exhausted',
          condition: {
            type: 'cargo-integrity-zero',
            vehicle: 'pressure-flatbed',
          },
          resumeCheckpoint: 'truck-ready',
          dialogue: [
            {
              speaker: 'Receiver warning',
              text: 'Circuit unstable. Clear the vehicle.',
              when: 'always',
            },
          ],
        },
        {
          id: 'occupied-blast',
          condition: {
            type: 'player-detonates-with-person-in-blast-volume',
          },
          resumeCheckpoint: 'armed',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The permit was a lie. I cannot make it true by leaving people inside.',
              when: 'always',
            },
          ],
        },
        {
          id: 'muster-lost',
          condition: {
            type: 'objective-destroyed',
            id: 'yard-evacuation-muster',
          },
          resumeCheckpoint: 'yard-ready',
          dialogue: [
            {
              speaker: 'Edda',
              text: 'Keep their names. Otherwise the vacant-yard record wins.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'evacuation-record',
          stage: 'escape',
          options: [
            {
              id: 'public-copy',
              text: 'Give Nadia the signed muster sheet for public release.',
              effects: [
                {
                  type: 'flag',
                  id: 'yard-evacuation-evidence',
                  value: 'public',
                },
              ],
            },
            {
              id: 'protected-copy',
              text: 'Preserve worker identities while giving Nora a protected copy.',
              effects: [
                {
                  type: 'flag',
                  id: 'yard-evacuation-evidence',
                  value: 'protected',
                },
              ],
            },
          ],
          outcome:
            'Both prove the yard was occupied; public exposure and worker privacy change later testimony.',
        },
      ],
      consequences: [
        'Dry Basin garage remains physically destroyed in free roam and future saves.',
        'Cobalt’s contractor feud escalates; Edda and Mara know Bran forged a vacant-yard permit.',
      ],
      rewards: {
        cash: 900,
        unlocks: ['LL-ST-020', 'LL-ST-023'],
        worldPatches: ['dry-basin-yard-demolished'],
      },
      requiredCapabilities: [
        {
          id: 'hazardousCargo',
          missionWork: 'Impact integrity, arming, safe remote blast and rubble',
        },
        {
          id: 'driving',
          missionWork: 'Heavy vehicle real cross-city route',
        },
        {
          id: 'passengers',
          missionWork: 'Worker evacuation paths, not numeric vacancy switch',
        },
        {
          id: 'props',
          missionWork: 'Muster evidence',
        },
        {
          id: 'phone',
          missionWork: 'Incidental cousin call',
        },
        {
          id: 'director',
          missionWork: 'LL-ST-022 dependency and persistent world patch',
        },
      ],
    },
    {
      id: 'LL-ST-019',
      title: 'Second Shift',
      contact: 'LL-CHAR-003',
      source: {
        game: 'GTA IV base game',
        title: 'Shadow',
        url: 'https://gta.fandom.com/wiki/Shadow',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'brief',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Tomas follows counterfeit battery deliveries to a canal supplier. Mara must identify the destination before confronting the runner, with different doors and tactics if she is spotted.',
      cast: [
        'LL-CHAR-001',
        'LL-CHAR-003',
        'LL-ARC-UNA',
        'LL-ARC-MIRA',
        'LL-ARC-KIRO',
        'LL-CHAR-002',
      ],
      dependencies: {
        all: ['LL-ST-008'],
        availability:
          'Parallel Tomas investigation, independent of Bran’s mission order; required before LL-ST-021 later.',
      },
      sourceBeats: [
        {
          sourceBeat: 'Foot tail identifies supplier; phone interruption may alert runner',
          stageIds: ['brief', 'identify', 'tail', 'phone'],
          adaptation:
            'Battery courier Una changes suspicion through actual sight, spacing and distraction.',
        },
        {
          sourceBeat: 'Unspotted unlocked apartment versus spotted locked-door breach',
          stageIds: ['stairs', 'entry'],
          adaptation:
            'Both lead to a full supplier battle; lock is a real shootable volume in the spotted path.',
        },
        {
          sourceBeat:
            'Courier/suppliers fight; premature courier harm or lost tail fails; friendship unlock',
          stageIds: ['suppliers', 'report'],
          adaptation:
            'Evidence and Tomas social contact require completing the investigation, not killing one runner early.',
        },
      ],
      stages: [
        {
          id: 'brief',
          type: 'contact-scene',
          scene: 'tomas-cafe',
          objective:
            'Ask Tomas about counterfeit battery markings and the courier’s delivery time.',
          completion: [
            {
              type: 'objective-received',
              id: 'counterfeit-battery-clue',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'The replacement packs die under load. Somebody replaced the cells and kept the relief stamp.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Where do they assemble them?',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Una carries the returns up the canal stair. Follow her until she puts them down. Do not make her choose a new address.',
              when: 'always',
            },
          ],
        },
        {
          id: 'identify',
          type: 'courier-observation',
          scene: 'canal-stair',
          objective: 'Identify Una at the supply curb by the blue battery sling.',
          completion: [
            {
              type: 'actor-identified',
              actor: 'LL-ARC-UNA',
              clue: 'blue battery sling',
            },
          ],
          dialogue: [
            {
              speaker: 'Una',
              text: 'Another return? Tell them it was tested before it left.',
              when: 'always',
            },
            {
              speaker: 'Resident',
              text: 'Tell them my lift stopped between floors.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Blue sling. Relief stamp. I have her.',
              when: 'always',
            },
          ],
          startPlacement:
            'A required approved sidewalk approach 180–240 units from Canal Tenement Stair; exact collision-tested coordinates must be authored, not inferred from the site center.',
        },
        {
          id: 'tail',
          type: 'discreet-foot-tail',
          scene: 'canal-stair',
          objective:
            'Follow Una on foot without hurting her; keep her visible often enough to identify her supplier.',
          completion: [
            {
              type: 'target-at-supplier-building',
              actor: 'LL-ARC-UNA',
            },
            {
              type: 'supplier-location-discovered',
            },
          ],
          dialogue: [
            {
              speaker: 'Una',
              text: 'You there again? Keep walking.',
              when: 'courier-suspicion>=50',
            },
            {
              speaker: 'Mara',
              text: 'She has noticed me. Stay with the route, not on her heels.',
              when: 'courier-spotted',
            },
            {
              speaker: 'Mara',
              text: 'She is checking the next corner. Wait for the sightline to close.',
              when: 'courier-unspotted',
            },
          ],
          tail: {
            comfortableDistance: [35, 100],
            suspicionFrom: [
              'visible close following',
              'weapon aimed',
              'sprinting at courier',
              'loud phone within earshot',
            ],
            suspicionFallsWhen: 'Real wall/door occlusion at a viable route distance',
            spottedAt: 100,
            spottedAlternate:
              'Una runs a longer stair approach but still leads to the supplier if tracked',
            lostGraceSeconds: 30,
            doNotDamageTargetBeforeReveal: true,
            footRoute: [
              'delivery curb',
              'tenement side walk',
              'laundry service corner',
              'canal stair front',
            ],
          },
        },
        {
          id: 'phone',
          type: 'tail-distraction-event',
          scene: 'canal-stair',
          objective: 'Handle Felix’s optional call while keeping the courier’s route.',
          completion: [
            {
              type: 'phone-distraction-resolved',
            },
          ],
          dialogue: [
            {
              speaker: 'Felix',
              text: 'Nadia says I should walk more. You know any streets that do not end in paperwork?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I am following a battery courier. Quietly.',
              when: 'always',
            },
            {
              speaker: 'Felix',
              text: 'That is not a recommendation I can put on a map.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I will call you back when this street has an answer.',
              when: 'always',
            },
          ],
          concurrentWith: 'tail',
          scheduling:
            'At the laundry corner, before supplier reveal; not a second serial tail run.',
          answer:
            'Speaker/handset near Una contributes a readable suspicion cue; silent decline does not.',
          mutedPhone: 'Text notification preserves the optional event without unavoidable noise.',
        },
        {
          id: 'stairs',
          type: 'vertical-follow',
          scene: 'canal-stair',
          objective: 'Follow Una up the physical tenement stairs to the supplier’s landing.',
          completion: [
            {
              type: 'player-at-supplier-landing',
              z: 36,
            },
            {
              type: 'courier-entered-supplier-flat',
            },
          ],
          dialogue: [
            {
              speaker: 'Una',
              text: 'Return packs. Somebody followed me.',
              when: 'courier-spotted',
            },
            {
              speaker: 'Una',
              text: 'Return packs. Three more failures on the lift circuit.',
              when: 'courier-unspotted',
            },
          ],
          traversal: ['ground vestibule', '18-unit landing', '36-unit supplier landing'],
          civilianRoom: 'Separate rear residential door, not an enemy funnel.',
        },
        {
          id: 'entry',
          type: 'conditional-door-entry',
          scene: 'canal-stair',
          objective: 'Enter the supplier flat; breach the locked door only if Una warned them.',
          completion: [
            {
              type: 'supplier-door-opened',
              mode: 'unlocked-or-lock-destroyed',
            },
          ],
          dialogue: [
            {
              speaker: 'Mira',
              text: 'Who is that? You brought an inspector?',
              when: 'courier-unspotted',
            },
            {
              speaker: 'Una',
              text: 'I did not see anyone.',
              when: 'courier-unspotted',
            },
            {
              speaker: 'Kiro',
              text: 'Hold the door. We move the stamps out the back.',
              when: 'courier-spotted',
            },
            {
              speaker: 'Mara',
              text: 'Leave the stamps and put your weapons down.',
              when: 'always',
            },
          ],
          branches: [
            {
              when: {
                type: 'flag-is',
                id: 'courier-spotted',
                value: false,
              },
              door: 'unlocked',
              enemies: 'surprised behind workshop benches',
            },
            {
              when: {
                type: 'flag-is',
                id: 'courier-spotted',
                value: true,
              },
              door: 'locked',
              requiredAction: 'Physical shot at lock hit volume or owned breaching tool',
              enemies: 'prepared workshop cover; no extra enemies replacing the base battle',
            },
          ],
        },
        {
          id: 'suppliers',
          type: 'apartment-firefight',
          scene: 'canal-stair',
          objective:
            'Survive Una and the two armed suppliers, preserving the relief-stamp press and returned battery labels.',
          completion: [
            {
              type: 'hostiles-neutralized',
              actors: ['LL-ARC-UNA', 'canal-supplier-one', 'canal-supplier-two'],
              surrenderCounts: true,
            },
            {
              type: 'evidence-collected',
              ids: ['counterfeit-relief-stamp', 'battery-return-labels'],
            },
          ],
          dialogue: [
            {
              speaker: 'Mira',
              text: 'The packs passed inspection. The stamp says so.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The lift says otherwise.',
              when: 'always',
            },
            {
              speaker: 'Una',
              text: 'I only delivered them!',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Then put the gun down and tell Tomas where the cells went.',
              when: 'always',
            },
          ],
          encounter: {
            actors: [
              {
                id: 'LL-ARC-UNA',
                weapon: 'pistol',
                maySurrender: true,
              },
              {
                id: 'canal-supplier-one',
                cast: 'LL-ARC-MIRA',
                weapon: 'compact-smg',
                cover: 'battery bench',
              },
              {
                id: 'canal-supplier-two',
                cast: 'LL-ARC-KIRO',
                weapon: 'pistol',
                cover: 'stamp cabinet',
              },
            ],
            civilianRearRoom:
              'Closed and clearly labeled; shots through it have ordinary consequences.',
            clues: ['stolen relief-stamp press', 'return labels with Corvus tender numbers'],
          },
        },
        {
          id: 'report',
          type: 'contact-evidence',
          scene: 'tomas-cafe',
          objective: 'Bring the returned labels to Tomas and arrange the next safe deliveries.',
          completion: [
            {
              type: 'evidence-secured',
              ids: ['counterfeit-relief-stamp', 'battery-return-labels'],
            },
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'The tender numbers are Corvus’s. That ties the broken machines to the same office.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Una may have a list of the deliveries.',
              when: 'Una-survived',
            },
            {
              speaker: 'Mara',
              text: 'We have the labels. No courier left to explain them.',
              when: 'Una-dead',
            },
            {
              speaker: 'Tomas',
              text: 'Then we keep every one. When you want an evening that does not involve a crate, call me.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I may take you up on that.',
              when: 'always',
            },
          ],
          onComplete: [
            {
              type: 'unlock',
              ids: ['Tomas-outings', 'Tomas-delivery-strand-complete'],
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'tail-ready',
          afterStage: 'identify',
          resumeStage: 'tail',
          snapshot: ['Una-route-start', 'player-sidewalk', 'suspicion', 'phone-event', 'wallet'],
          note: 'Phone event and concurrent tail tick once each; never skip a route by serial-stage progression.',
        },
        {
          id: 'landing',
          afterStage: 'stairs',
          resumeStage: 'entry',
          snapshot: ['Una-inside', 'spotted-flag', 'door-state', 'supplier-poses', 'health-ammo'],
          note: 'Door and enemy preparation stay coupled to the actual spotted branch.',
        },
        {
          id: 'flat-open',
          afterStage: 'entry',
          resumeStage: 'suppliers',
          snapshot: [
            'open-door-lock-health',
            'three-hostiles',
            'civilian-room',
            'evidence',
            'ammo',
          ],
          note: 'Broken lock remains broken; evidence appears only where it physically was.',
        },
      ],
      failures: [
        {
          id: 'courier-hurt-early',
          condition: {
            type: 'target-hurt-before-supplier-discovery',
            actor: 'LL-ARC-UNA',
          },
          resumeCheckpoint: 'tail-ready',
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'One courier is not the workshop. We needed the address before the argument.',
              when: 'always',
            },
          ],
        },
        {
          id: 'courier-lost',
          condition: {
            type: 'tail-target-lost',
            actor: 'LL-ARC-UNA',
            grace: 30,
          },
          resumeCheckpoint: 'tail-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'I lost the blue sling. We need another return run.',
              when: 'always',
            },
          ],
        },
        {
          id: 'labels-burned',
          condition: {
            type: 'objective-destroyed',
            id: 'battery-return-labels',
          },
          resumeCheckpoint: 'flat-open',
          dialogue: [
            {
              speaker: 'Tomas',
              text: 'The failed packs already lost their marks. Do not lose the people’s return labels too.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'tail-detection',
          stage: 'tail',
          options: [
            {
              id: 'unspotted',
              text: 'Maintain distance and use genuine occlusion.',
              effects: [
                {
                  type: 'flag',
                  id: 'courier-spotted',
                  value: false,
                },
              ],
            },
            {
              id: 'spotted',
              text: 'Recover the trail after Una spots you.',
              effects: [
                {
                  type: 'flag',
                  id: 'courier-spotted',
                  value: true,
                },
              ],
            },
          ],
          outcome:
            'Actual behavior selects door/preparation branch; detection is recoverable, early harm or a lost address is not.',
        },
        {
          id: 'courier-surrender',
          stage: 'suppliers',
          options: [
            {
              id: 'accept',
              text: 'Accept Una’s surrender if she drops the pistol.',
              effects: [
                {
                  type: 'flag',
                  id: 'Una-survived',
                  value: true,
                },
              ],
            },
            {
              id: 'armed-combat',
              text: 'Defend yourself while she remains armed.',
              effects: ['Actual health/death outcome recorded'],
            },
          ],
          outcome:
            'Survival adds testimony; all supplier combat positions and evidence objectives remain.',
        },
      ],
      consequences: [
        'Tomas’s parallel strand has an authenticated Corvus supply link, needed for the betrayal mission LL-ST-021.',
        'Courier detection, survival and friendship eligibility persist independently.',
      ],
      rewards: {
        cash: 500,
        unlocks: ['Tomas-outings', 'LL-ST-021 when LL-ST-020 complete'],
      },
      requiredCapabilities: [
        {
          id: 'tail',
          missionWork: 'Real suspicion/occlusion and recoverable spotted route',
        },
        {
          id: 'phone',
          missionWork: 'Optional concurrent distraction',
        },
        {
          id: 'vertical',
          missionWork: 'Tenement stairs',
        },
        {
          id: 'props',
          missionWork: 'Conditional shootable lock and labels',
        },
        {
          id: 'friendship',
          missionWork: 'Tomas social unlock',
        },
        {
          id: 'director',
          missionWork: 'Concurrent stage/event semantics, no generic serial shortcut',
        },
      ],
    },
    {
      id: 'LL-ST-020',
      title: "Foreman's Fall",
      contact: 'LL-CHAR-004',
      source: {
        game: 'GTA IV base game',
        title: 'The Master and the Molotov',
        url: 'https://gta.fandom.com/wiki/The_Master_and_the_Molotov',
        catalogue: 'docs/research/story-source-map.json',
        evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
        checkedOn: '2026-10-08',
        uncertainty:
          'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
      },
      status: 'authored-unintegrated',
      runtimeValidated: false,
      sourceMissionCredit: 1,
      startStage: 'meeting',
      commonFailures: ['player-dead', 'player-arrested'],
      retryPolicy: {
        choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
        preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
        restore:
          'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
        money:
          'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
        wanted:
          'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
        unavailableCheckpoint:
          'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I need another way through this.',
            when: 'always',
          },
        ],
      },
      validationGates: [
        'All source beat records bound to actual director stages, with no unresolved capability skipped.',
        'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
        'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
        'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
        'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
      ],
      premise:
        'Silas offers to stop Bran’s freight war by taking the contractor out of his shuttered exhibition hall. Mara fights through the building and reaches a roof where Bran tries to erase the office archive.',
      cast: ['LL-CHAR-001', 'LL-CHAR-004', 'LL-CHAR-010', 'LL-CHAR-026'],
      dependencies: {
        all: ['LL-ST-018'],
        availability:
          'Silas initiates by call. LL-ST-019 remains a separate required strand for next mission LL-ST-021.',
      },
      sourceBeats: [
        {
          sourceBeat:
            'Adviser orders patron death for faction peace; armor message before club entry',
          stageIds: ['meeting', 'arrival', 'armor'],
          adaptation:
            'Silas uses a contractor exhibition rather than copied nightclub fiction; armor appears only after a visible arrival event.',
        },
        {
          sourceBeat:
            'Large main-room battle, fleeing boss, rear rooms/alley stairs and roof fight',
          stageIds: ['hall', 'backstage', 'stairs', 'roof'],
          adaptation:
            'All encounter spaces and waves are authored, including a real multi-floor pursuit.',
        },
        {
          sourceBeat: 'Boss warns adviser betrayal; fatal rooftop confrontation and follow-up call',
          stageIds: ['archive', 'roof', 'report'],
          adaptation:
            'Bran names altered custody records and attacks; original archive evidence makes the warning concrete.',
        },
        {
          sourceBeat:
            'No monetary reward; incendiary access and betrayal mission conditional on companion strand',
          stageIds: ['report'],
          adaptation:
            'LL-ST-021 requires this mission plus LL-ST-019; earned equipment unlock does not imply implemented future content.',
        },
      ],
      stages: [
        {
          id: 'meeting',
          type: 'adviser-scene',
          scene: 'quay-meeting',
          objective: 'Meet Silas and hear his proposal to end Bran’s escalating feud.',
          completion: [
            {
              type: 'dialogue-finished',
            },
          ],
          dialogue: [
            {
              speaker: 'Silas',
              text: 'Cobalt wants the demolition answered. Bran wants a larger demolition.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'And you want the office between them.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'I want a city in which every shipment does not arrive with a body.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You were beside him when he shot Felix.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'And beside Felix when he needed treatment. There will be no third position if Bran keeps signing orders.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Where is Edda?',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Away from the hall. I made certain of that.',
              when: 'always',
            },
          ],
        },
        {
          id: 'arrival',
          type: 'exhibition-approach',
          scene: 'quay-exhibition',
          objective:
            'Reach Quay Cabaret’s contractor exhibition and watch Bran enter through the service gate.',
          completion: [
            {
              type: 'arrival-scene-seen',
              actor: 'LL-CHAR-010',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'No staff after close. No press. If Cobalt wants a meeting, he can bring a crane.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'The service gate is still open.',
              when: 'always',
            },
            {
              speaker: 'Silas by message',
              text: 'There is a protective vest by the transformer recess. Use it if you need it.',
              when: 'always',
            },
          ],
          staging:
            'Bran’s sedan parks, he walks inside and guards close the service gate. The later armor pickup is not pre-spawned at every visit.',
          weather:
            'Original advancing coastal squall with legible combat lighting; no source music or assets.',
        },
        {
          id: 'armor',
          type: 'optional-armor-pickup',
          scene: 'quay-exhibition',
          objective:
            'Collect the vest behind the transformer recess, or proceed with your existing armor.',
          completion: [
            {
              type: 'optional-pickup-resolved',
              id: 'silas-hall-vest',
              outcomes: ['collected', 'declined', 'already-armored'],
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'A vest and a plan. You have had time to arrange both.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'I have had time to worry. They are different costs.',
              when: 'always',
            },
          ],
          pickup: {
            id: 'silas-hall-vest',
            armor: 100,
            enabledAfter: 'arrival',
            ifArmorFull: 'May leave pickup; no duplicate armor inventory or sale value.',
            visibleMarker: true,
          },
        },
        {
          id: 'hall',
          type: 'large-interior-combat',
          scene: 'quay-exhibition',
          objective:
            'Fight through the lobby and display hall while Bran retreats toward the stage.',
          completion: [
            {
              type: 'encounter-cleared',
              group: 'exhibition-front',
            },
            {
              type: 'boss-at-service-exit',
              actor: 'LL-CHAR-010',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'Silas has sent a driver to negotiate?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Stop signing people into your disasters.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Every road here needed somebody willing to make a decision.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'You keep deciding other people are expendable.',
              when: 'always',
            },
            {
              speaker: 'Guard',
              text: 'Close the partition! He is going out the back!',
              when: 'always',
            },
          ],
          encounter: {
            waves: [
              {
                trigger: 'Mara enters lobby',
                actors: [
                  {
                    id: 'hall-door-left',
                    weapon: 'pistol',
                    cover: 'ticket desk',
                  },
                  {
                    id: 'hall-door-right',
                    weapon: 'pistol',
                    cover: 'entry partition',
                  },
                ],
              },
              {
                trigger: 'front cleared and display aisle entered',
                actors: [
                  {
                    id: 'hall-display-north',
                    weapon: 'compact-smg',
                    cover: 'pump demonstration wall',
                  },
                  {
                    id: 'hall-display-south',
                    weapon: 'shotgun',
                    cover: 'stage apron',
                  },
                  {
                    id: 'hall-gallery',
                    weapon: 'pistol',
                    z: 18,
                    cover: 'gallery parapet',
                  },
                ],
              },
            ],
            boss: {
              id: 'LL-CHAR-010',
              behavior:
                'Fires from stage cover and retreats through actual rear passage after hall pressure rises.',
              prematureDeath:
                'If ordinary combat kills Bran early, preserve the archive/roof route through a triggered final archive guard; do not mark the whole mission complete at stage one.',
            },
            cover:
              'Original display machines sized to physical ray/collision volumes, not decoration-only meshes.',
          },
        },
        {
          id: 'backstage',
          type: 'rear-combat-pursuit',
          scene: 'quay-exhibition',
          objective: 'Follow Bran through the kitchen passage and clear the service alley guards.',
          completion: [
            {
              type: 'encounter-cleared',
              group: 'exhibition-rear',
            },
            {
              type: 'player-at-service-stair',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'You think the tender dies with the man who signs it?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I think the people on the forms get to stop being your equipment.',
              when: 'always',
            },
            {
              speaker: 'Bran',
              text: 'Then ask Silas who moved the archive. Ask him before he moves you.',
              when: 'always',
            },
          ],
          encounter: {
            actors: [
              {
                id: 'hall-kitchen',
                weapon: 'shotgun',
                cover: 'masonry kitchen return',
              },
              {
                id: 'hall-alley-one',
                weapon: 'pistol',
                cover: 'loading bin',
              },
              {
                id: 'hall-alley-two',
                weapon: 'compact-smg',
                cover: 'stair base',
              },
            ],
            escapeRoute: ['rear service door', 'kitchen passage', 'service alley', 'stair base'],
          },
          alternateDialogue: [
            {
              speaker: 'Archive guard',
              text: 'Quinn moved the originals already. Corvus only kept the access copy.',
              when: 'Bran-dead-before-roof',
            },
          ],
        },
        {
          id: 'stairs',
          type: 'vertical-combat',
          scene: 'quay-exhibition',
          objective:
            'Climb the service stairs, clear the landing guard and reach the archive roof.',
          completion: [
            {
              type: 'guard-neutralized',
              id: 'hall-stair-guard',
            },
            {
              type: 'player-at-roof',
              z: 54,
            },
          ],
          dialogue: [
            {
              speaker: 'Mara',
              text: 'Edda, the hall has an archive relay. Who controls it?',
              when: 'always',
            },
            {
              speaker: 'Edda',
              text: 'Bran can erase the local copy. The custody register was transferred last month.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'To whom?',
              when: 'always',
            },
            {
              speaker: 'Edda',
              text: 'Quinn Risk Management. I thought you knew.',
              when: 'always',
            },
          ],
          traversal: {
            supportedFloors: [0, 18, 36, 54],
            continuousStairs: true,
            landingGuard: {
              id: 'hall-stair-guard',
              weapon: 'pistol',
              z: 36,
              cover: 'stair wall',
            },
            noElevatorShortcut:
              'Roof access is the authored stair pursuit, not a teleport interaction.',
          },
        },
        {
          id: 'archive',
          type: 'roof-evidence',
          scene: 'quay-exhibition',
          objective: 'Disable the archive erasure relay and preserve its custody register.',
          completion: [
            {
              type: 'relay-disabled',
              id: 'archive-erasure-relay',
            },
            {
              type: 'evidence-collected',
              id: 'quinn-custody-register',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'He owns the archive. Your convoy, the permits, every inconvenient signature.',
              when: 'Bran-alive',
            },
            {
              speaker: 'Mara',
              text: 'And you kept signing them.',
              when: 'Bran-alive',
            },
            {
              speaker: 'Bran',
              text: 'Because I knew what I was buying. He lets you call it a favor.',
              when: 'Bran-alive',
            },
            {
              speaker: 'Mara',
              text: 'Quinn has custody. That is why every road leads through his office.',
              when: 'Bran-dead-before-roof',
            },
          ],
          action:
            'An actual roof cabinet interaction disables the erasure circuit while a live target has sight; progress stops on damage, saved erasure clock never resets for free.',
          clock: {
            seconds: 90,
            startsOn: 'roof access',
            pausesWithGame: true,
          },
          ifBranAlreadyDead: 'Final archive guard is the armed defender; register still required.',
        },
        {
          id: 'roof',
          type: 'fatal-rooftop-combat',
          scene: 'quay-exhibition',
          objective: 'Survive Bran’s final armed attack and leave the archive register intact.',
          completion: [
            {
              type: 'actor-dead',
              actor: 'LL-CHAR-010',
            },
            {
              type: 'evidence-intact',
              id: 'quinn-custody-register',
            },
            {
              type: 'conditional-hostile-neutralized',
              actor: 'roof-archive-guard',
              enabledWhen: 'Bran-dead-before-roof',
            },
          ],
          dialogue: [
            {
              speaker: 'Bran',
              text: 'If you take that register, Quinn will give you the next disposal order.',
              when: 'Bran-alive',
            },
            {
              speaker: 'Mara',
              text: 'Then I will read who signed it.',
              when: 'Bran-alive',
            },
            {
              speaker: 'Bran',
              text: 'You will read it from underneath.',
              when: 'Bran-alive',
            },
          ],
          encounter: {
            actor: 'LL-CHAR-010',
            weapon: 'pistol',
            tactics:
              'Shoots from relay plinth, then rushes along roof parapet; real combat death/fall, no copied execution animation.',
            roofHasGuardrailsExcept:
              'One authored damaged service edge, visible and physically collidable.',
            replacementGuard: {
              id: 'roof-archive-guard',
              weapon: 'pistol',
              enabledWhen: 'Bran-dead-before-roof',
              trigger:
                'Bran dies before roof; record flag and activate this existing scheduled defender at the roof relay.',
            },
            ifAlreadyDead:
              'Combat completion condition is satisfied only after archive guard is neutralized; no boss respawn.',
          },
          originalAdditionalObjective:
            'Archive preservation concretizes the source warning and feeds the upcoming betrayal.',
        },
        {
          id: 'report',
          type: 'adviser-call-aftermath',
          scene: 'dispatch',
          objective:
            'Tell Silas Bran is dead and secure the custody register with an independent contact.',
          completion: [
            {
              type: 'call-resolved',
              topic: 'Bran-death',
            },
            {
              type: 'evidence-secured',
              id: 'quinn-custody-register',
            },
          ],
          dialogue: [
            {
              speaker: 'Silas',
              text: 'Is it over?',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'Bran is dead. The archive is not.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'Good. Records will be useful when we settle the damage.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'His custody register says you already own them.',
              when: 'always',
            },
            {
              speaker: 'Silas',
              text: 'I manage risk, Mara. Sometimes that means keeping the records away from a man who will burn them.',
              when: 'always',
            },
            {
              speaker: 'Mara',
              text: 'I am keeping this one away from both of you.',
              when: 'always',
            },
            {
              speaker: 'Tomas',
              text: 'Bring it here. We have copies of the battery labels. We will see which numbers agree.',
              when: 'LL-ST-019-complete',
            },
            {
              speaker: 'Nadia',
              text: 'Keep the original. Tomas is still tracing the supply records; do not let Quinn rush the comparison.',
              when: 'LL-ST-019-incomplete',
            },
          ],
          onComplete: [
            {
              type: 'unlock-weapon-role',
              role: 'incendiary-bottle',
            },
            {
              type: 'unlock-when',
              id: 'LL-ST-021',
              all: ['LL-ST-020', 'LL-ST-019'],
            },
          ],
        },
      ],
      checkpoints: [
        {
          id: 'hall-ready',
          afterStage: 'armor',
          resumeStage: 'hall',
          snapshot: [
            'Bran-inside',
            'vest-picked-or-declined',
            'front-guards',
            'player-health-armor-ammo',
            'weather',
          ],
          note: 'A declined/collected vest never duplicates through retry.',
        },
        {
          id: 'rear-ready',
          afterStage: 'hall',
          resumeStage: 'backstage',
          snapshot: [
            'Bran-life-and-route',
            'cleared-front',
            'rear-guards',
            'health-ammo',
            'roof-register',
          ],
          note: 'Early boss death stays dead; alternate archive defender preserves the complete traversal.',
        },
        {
          id: 'stairs-ready',
          afterStage: 'backstage',
          resumeStage: 'stairs',
          snapshot: ['cleared-rear', 'Bran-or-archive-guard', 'stair-guard', 'health-ammo'],
          note: 'Remaining guards restore outside collision walls.',
        },
        {
          id: 'roof-ready',
          afterStage: 'stairs',
          resumeStage: 'archive',
          snapshot: [
            'supported-player-roof',
            'relay-clock',
            'Bran-life',
            'archive-guard',
            'register',
            'ammo-health',
          ],
          note: 'Deadline begins when control returns; Continue preserves elapsed erasure time.',
        },
      ],
      failures: [
        {
          id: 'archive-erased',
          condition: {
            type: 'clock-expired',
            clock: 'archive-erasure',
          },
          resumeCheckpoint: 'roof-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The local copy is gone. We need to reach the relay before he finishes.',
              when: 'always',
            },
          ],
        },
        {
          id: 'register-destroyed',
          condition: {
            type: 'objective-destroyed',
            id: 'quinn-custody-register',
          },
          resumeCheckpoint: 'roof-ready',
          dialogue: [
            {
              speaker: 'Mara',
              text: 'The warning meant nothing if I cannot show who owns the record.',
              when: 'always',
            },
          ],
        },
        {
          id: 'boss-escaped',
          condition: {
            type: 'boss-left-authored-roof-exit',
            actor: 'LL-CHAR-010',
            grace: 20,
          },
          resumeCheckpoint: 'stairs-ready',
          dialogue: [
            {
              speaker: 'Silas',
              text: 'If he leaves the hall, he will start another contract before morning.',
              when: 'always',
            },
          ],
        },
      ],
      choices: [
        {
          id: 'armor-use',
          stage: 'armor',
          options: [
            {
              id: 'collect',
              text: 'Take Silas’s offered vest.',
              effects: ['Actual pickup and armor amount'],
            },
            {
              id: 'decline',
              text: 'Keep your existing protection and leave the vest.',
              effects: ['No hidden defense bonus or cash substitute'],
            },
          ],
          outcome: 'Both play the full battle; offered protection is a real optional pickup.',
        },
        {
          id: 'register-custodian',
          stage: 'report',
          options: [
            {
              id: 'nadia',
              text: 'Give Nadia the original custody register.',
              effects: [
                {
                  type: 'flag',
                  id: 'custody-register-holder',
                  value: 'Nadia',
                },
              ],
            },
            {
              id: 'nora',
              text: 'Give Nora the original for archive authentication.',
              effects: [
                {
                  type: 'flag',
                  id: 'custody-register-holder',
                  value: 'Nora',
                },
              ],
            },
          ],
          outcome:
            'Independent custody persists; neither trusts Silas with the only copy. Future betrayal dialogue changes.',
        },
      ],
      consequences: [
        'Bran is permanently dead. Edda’s engineering testimony and Silas’s archive custody become live leads.',
        'Bad Receipts LL-ST-021 requires the separately completed Second Shift; forthcoming betrayal is not an ending popup in this mission.',
      ],
      rewards: {
        cash: 0,
        unlocks: ['incendiary-bottle-role', 'LL-ST-021 when LL-ST-019 complete'],
        flags: ['bran-dead', 'quinn-custody-discovered'],
      },
      requiredCapabilities: [
        {
          id: 'interior',
          missionWork: 'Large exhibition/lobby/stage/kitchen/alley/roof',
        },
        {
          id: 'vertical',
          missionWork: 'Actual three-level service stairs and roof edge',
        },
        {
          id: 'firearms',
          missionWork: 'Nine guards plus boss or replacement archive defender; height-aware cover',
        },
        {
          id: 'props',
          missionWork: 'Optional armor, erasure relay and register',
        },
        {
          id: 'cinematic',
          missionWork: 'Adviser meeting and original rooftop outcome',
        },
        {
          id: 'director',
          missionWork: 'Early boss death alternative, clock and parallel strand gate',
        },
      ],
    },
  ],
  scenes: {
    'pier-berth': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC137',
      },
      title: 'Pier Eight temporary passenger berth',
      status:
        'constructed-core; passenger ferry, checked gangway/apron, duffel and taxi curb implemented in campaign/scenes.js',
      proposal:
        'A lit 90-by-130 pedestrian apron, mooring rail and accessible gangway; taxi curb separated from working cargo.',
    },
    dispatch: {
      anchor: {
        kind: 'service',
        id: 'felix-office',
      },
      existingRoom: 'voss-dispatch',
      catalogueCounterpart: 'LL-CITY-LOC161',
      status:
        'room, canonical companion proxy and Night Crossing route stop implemented; later dispatch handlers/catalogue address review pending',
    },
    'dockside-rooms': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC054',
      },
      status:
        'constructed-core; fifth real room, key/evidence, food, wardrobe, confirmed save and six-hour rest implemented',
      proposal:
        '240-by-220 walk-up with two beds, kettle, wardrobe, shelter ledger and a sheltered two-car curb; no luxury facade reveal copied from the source.',
    },
    'impound-counter': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC059',
      },
      status: 'exterior anchor exists; annex counter and lookout positions missing',
      proposal:
        'Public impound annex beside Old Quay Precinct, 180-by-220 counter interior; two visible approach streets and a taxi pickup bay.',
    },
    'quay-meeting': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC022',
      },
      status: 'exterior anchor exists; Quay House interior missing',
      proposal:
        '300-by-260 social cafe, counter booths and street-facing windows; Victor uses a rear insurance booth, never the live Lantern bar by silent substitution.',
    },
    'boardwalk-station': {
      anchor: {
        kind: 'station',
        id: 'LL-CITY-ST01',
      },
      status:
        'physical station access, rendered trains, boarding/fare/signal/save runtime implemented; campaign-specific pickup/date binding missing',
    },
    'brigid-station': {
      anchor: {
        kind: 'station',
        id: 'LL-CITY-ST04',
      },
      status:
        'physical upper/lower platform access and passenger runtime implemented; courier battle/escape choreography missing',
      proposal:
        'Street stair, elevator and track crossing safety interlocks; distinct platform approach, service footbridge and courier street exit.',
    },
    'tess-flat': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC174',
      },
      status: 'exterior anchor exists; character tenancy and interior missing',
      proposal:
        '220-by-200 temporary researcher flat; unopened survey kit hints at Tess’s cover without copying tagged furniture staging.',
    },
    'founders-clinic': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC083',
      },
      status: 'hospital exterior anchor exists; Felix discharge and medical passenger hook missing',
      proposal:
        'Street pickup bay outside the clinic, with a visible discharged Felix and sling; the hospital interior is not required for this pickup.',
    },
    'pier-goods': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC034',
      },
      status: 'apparel site exists; clothing store and breakable storefront missing',
      proposal:
        '260-by-220 workwear shop, changing booth, display window isolated from occupants and a street bin with safe throwable bottles.',
    },
    fairground: {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC131',
      },
      status:
        'Night Crossing muster sign/physical stopped-route observation implemented; cancelled screening/date event still missing',
    },
    lanes: {
      anchor: {
        kind: 'service',
        id: 'blue-hour-lanes',
      },
      existingRoom: 'blue-hour-lanes',
      status: 'room and bowling core implemented; companion/date binding missing',
    },
    'lantern-court': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC130',
      },
      status: 'promenade anchor exists; nearby basketball court is a required exterior addition',
      proposal:
        '90-by-150 fenced court off the promenade; two safe entrances, spectators flee toward the sea wall, collectors trap Felix at the far bench.',
    },
    'old-quay-works': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC181',
      },
      status: 'construction exterior exists; chase floors, ladders and roof collision missing',
      proposal:
        '320-by-420 multi-level parking/flood-defense frame: grade, 18-unit service landing, 36-unit deck, 54-unit crane walk and 72-unit roof; routes authored separately for Reeve and Ilan.',
    },
    'manifest-yard': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC137',
      },
      status: 'exterior anchor exists; bonded shed, objective cargo and patrol trigger missing',
      proposal:
        'A bonded shed away from passenger berth; archive crate, two lawful exits and real patrol sightlines.',
    },
    garage: {
      anchor: {
        kind: 'service',
        id: 'saira-shop',
      },
      existingRoom: 'saira-garage',
      catalogueCounterpart: 'LL-CITY-LOC044',
      status: 'repair room implemented; respray identity and campaign voucher missing',
    },
    'tomas-cafe': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC018',
      },
      status: 'exterior restaurant anchor exists; companion meeting/service hook missing',
    },
    'battery-exchange': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC175',
      },
      status: 'apartment anchor exists; alley, lookout and interior missing',
      proposal:
        'Outdoor L-shaped service yard with a 12-unit lookout landing, front exchange entrance, lateral cover and an independently visible roof attacker.',
    },
    'boiler-house': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC176',
      },
      status: 'derelict exterior exists; two-storey workshop interior missing',
      proposal:
        '360-by-300 workshop: stoop door, stair shooter, side window facing bench, connected kitchen/boiler rooms, generator crate and medical cabinet.',
    },
    'coldstore-front': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC158',
      },
      status: 'warehouse exterior exists; cold-store reception and rear escape route missing',
      proposal:
        'Small public laundry/refrigeration service counter in Canal Bottling Store; a rolling linen rack blocks pursuit briefly, rear van yard stays physically reachable.',
    },
    'vector-lockup': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC162',
      },
      status: 'workshop exterior exists; vehicle delivery bay and warehouse interior missing',
      proposal:
        '400-by-300 two-bay workshop with roller door, inspection pit and separated parts office; no replacement of actual live Saira room.',
    },
    'kiln-wash': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC049',
      },
      status: 'vehicle-wash catalogue exists; physical wash service missing',
      proposal:
        'One-way 54-by-160 washing bay, entrance stop signal, rinse pass and street exit; fee deducted once and paint evidence removed only at cycle completion.',
    },
    'saltgate-estate': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC166',
      },
      status: 'residence exterior exists; residence and basement interiors missing',
      proposal:
        'Main-floor 400-by-340 engineering office/kitchen; basement 360-by-280 coercion scene with loading exit, detention chairs and medical station.',
    },
    'dry-basin-yard': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC159',
      },
      status: 'warehouse exterior exists; cargo garage and demolition state missing',
      proposal:
        '500-by-460 evacuated contractor yard, drive-through garage, linked sentry/light breakers, evacuation muster board and blast-safe berm.',
    },
    'rook-store': {
      anchor: {
        kind: 'service',
        id: 'weapon-shop',
      },
      status: 'weapon service implemented; escorted story purchase binding missing',
    },
    'bellhaven-lot': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC125',
      },
      status: 'park exterior exists; biker meeting lot and moving encounter missing',
      proposal:
        'Gantry recreation lot with three approaches, disused repair stalls, motorcycle parking and protected civilian promenade.',
    },
    'furnace-factory': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC157',
      },
      status: 'factory exterior exists; hazardous truck/loading state missing',
    },
    'canal-stair': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC177',
      },
      status: 'tenement exterior exists; vertical circulation and supplier flat missing',
      proposal:
        'Ground, 18-unit and 36-unit landings with a continuous stair; supplier flat 320-by-240, breakable lock, workbenches and separate civilian rear room.',
    },
    'quay-exhibition': {
      anchor: {
        kind: 'site',
        id: 'LL-CITY-LOC028',
      },
      status: 'venue exterior exists; exhibition battle interior and roof missing',
      proposal:
        '520-by-640 converted cabaret/contractor exhibition: lobby, display floor, stage, kitchen passage, service alley, 18/36-unit stairs and 54-unit roof. Licensed facade remains Quay Cabaret.',
    },
  },
  capabilities: {
    director: {
      status: 'foundation-implemented',
      evidence:
        'campaign/director.js implements graph/dialogue/choice/checkpoint transactions; runtime.js and parent-context.js bind actual Night Crossing observations/actions',
      work: 'The other nineteen authored missions need individual physical handlers, encounters and validation; unknown gates remain explicit. No source completion credit.',
    },
    driving: {
      status: 'foundation-implemented',
      evidence: 'simulation.js physical vehicles; terrain/navigation.js legal roads',
      work: 'Night Crossing has an ordered physical route and stop dwell. Later mission routes, adaptive pursuit/interception/replacement drivers and complete natural-input validation remain due.',
    },
    passengers: {
      status: 'foundation-implemented',
      evidence:
        'companions.js and campaign/physical-context.js provide persistent living/dead actors, real reserved/occupied seats, boarding/exit, follow/escort, failure grace and portal traversal',
      work: 'Bind each later pickup/outgoing group, companion combat behavior, dates and mission-specific separation/recovery outcomes.',
    },
    phone: {
      status: 'partial',
      evidence: 'game.js phone/journal dialogue UI',
      work: 'Contact calls, incoming timed warnings, muted phone fallback and deferred mission availability.',
    },
    interior: {
      status: 'partial',
      evidence:
        'Five real rooms share doors/combat/props/NPC persistence; campaign/scenes.js adds Dockside Rooms and its physical entrance',
      work: 'Build all explicit missing scenes/portals; multi-level collision, actors, cover and camera must use actual volumes.',
    },
    shelter: {
      status: 'foundation-implemented',
      evidence:
        'Dockside tenancy/key, physical parking, finite food/eating, candidate-write-confirmed save, pending bed action/calendar6h, wardrobe and evidence use actual saved ledgers',
      work: 'Additional residences, ownership/storage policies, later shelter consequences and complete natural-play validation remain due.',
    },
    clothing: {
      status: 'foundation-implemented',
      evidence:
        'wardrobe.js owns three original outfits/transactions; reachable shelter UI equips actual owned clothes, renderer appearance and Continue persist them',
      work: 'Retail clothing interiors, broader clothing inventory, changing rooms and the later mission voucher/buying objective remain missing.',
    },
    activities: {
      status: 'foundation-implemented',
      evidence: 'minigames.js and minigame-view.js full bowling/darts/pool/arcade',
      work: 'Companion bowling, date continuity, completion/quit dialogue and no win-only gate.',
    },
    friendship: {
      status: 'partial',
      evidence: 'Director choice/trust records persist; no full relationship/invitation scheduler',
      work: 'Boundaries, invitations, outings, benefits, relationship schedules and delayed callbacks remain missing.',
    },
    melee: {
      status: 'foundation-implemented',
      evidence: 'combat.js guard, counter and disarm; simulation.js melee',
      work: 'Named-target nonlethal surrender and contextual fight tutorials without invulnerability.',
    },
    firearms: {
      status: 'foundation-implemented',
      evidence: '17 combat weapon roles and live equipment shop',
      work: 'Companion AI, overwatch waves, intimidation aim ray and selective-injury hit regions.',
    },
    police: {
      status: 'foundation-implemented',
      evidence: 'Six-level pursuits, sight, last-seen search and arrest',
      work: 'Mission-specific witnesses, real exit validation and no scripted instant wanted clear.',
    },
    props: {
      status: 'partial',
      evidence:
        'combat.js throwable/destructible objects; Night Crossing has one authoritative physically carried/delivered duffel plus key/evidence receipts',
      work: 'Safe glass shards/storefront trigger, nonweapon pickups, door lock hit volume and inventory evidence.',
    },
    chase: {
      status: 'missing',
      evidence: 'Regional traffic exists; named adaptive chase routes not authored',
      work: 'Routed target AI, foot/car handoffs, last-seen grace, finite escape endpoints and recoverable vehicle availability.',
    },
    selectiveForce: {
      status: 'missing',
      evidence: 'Physical damage exists; no surrender/intimidation contract',
      work: 'Bounded compliant rams, fear, verified aim, localized injury and civilian survival conditions.',
    },
    rail: {
      status: 'foundation-implemented',
      evidence:
        'Four physical Metro services/26 station complexes/56 directional calls have access, native train rendering, boarding/alighting, fares, signals/clearance and saved journeys',
      work: 'Mission-specific courier/target AI, platform combat/escape choreography and remaining reference-wide transport validation are not implemented by the passenger foundation.',
    },
    wash: {
      status: 'missing',
      evidence: 'Five vehicle-wash catalogue sites only',
      work: 'Physical wash approach/cycle, legal fee, dirt/evidence state and original animation/audio.',
    },
    vertical: {
      status: 'partial',
      evidence: 'Terrain heights and low vault/climb exist',
      work: 'Continuous ladders, crane catwalks, authored rooftop gaps, ledge hangs, stairs and matching collision/camera.',
    },
    arrestBranch: {
      status: 'missing',
      evidence: 'Player arrest supported, NPC custody transfer not authored',
      work: 'Escort/rescue/custody resolution and saved witness safety outcomes.',
    },
    impersonation: {
      status: 'missing',
      evidence: 'Police car exists; no traffic stop inspection system',
      work: 'Siren command, deceleration/compliant curb stops, driver exit, cargo inspection and false-stop witnesses.',
    },
    motorcycles: {
      status: 'unverified',
      evidence: 'No playable two-wheel/biker chase proof in current runtime',
      work: 'Two-wheel steering/fall physics, helmet pose, mounted target AI and dismount combat.',
    },
    hazardousCargo: {
      status: 'missing',
      evidence: 'Physical explosives/fire implemented, bomb-truck objective absent',
      work: 'Impact-integrity gauge, planted charge, exit-safe remote trigger, evacuated blast and persistent rubble.',
    },
    tail: {
      status: 'missing',
      evidence: 'World sight queries exist; discreet courier controller absent',
      work: 'Suspicion/occlusion, distance grace, phone distraction, spotted alternate route and supplier discovery.',
    },
    cinematic: {
      status: 'foundation-implemented',
      evidence:
        'campaign/cinematics.js stages real collision-checked actor routes/cameras and accelerated consistent skips; subtitles.js saves actual presentation/duration/acknowledgment',
      work: 'Night Crossing ferry/home staging is integrated. The other nineteen missions need distinct scenes/outcomes, animation/audio production and natural-input validation.',
    },
  },
  manifest: {
    id: 'lowlight-first-arc',
    schemaVersion: 1,
    status: 'authored-unintegrated',
    sourceMissionRange: ['LL-ST-001', 'LL-ST-020'],
    expectedSourceMissionCount: 20,
    implementationClaim:
      'Partial Night Crossing integration through the real director/physical adapters, companions, ferry/home scenes, shelter ledgers and frontend. The other nineteen missions remain unintegrated; all records retain runtimeValidated:false and earn no source completion credit.',
    additionalOnboardingIds: ['first-shift', 'collection-day', 'cold-freight', 'glass-house'],
    additionalOnboardingSourceCredit: 0,
    dependencyPolicy:
      'Authored original graph; catalogue order is not chronology. Out-of-pack dependencies remain explicit.',
    stagePolicy:
      'Default next is the next enabled serial stage; branch targets override it only after all completion rules pass. Unknown predicates/actions/capabilities block integration.',
    concurrentStagePolicy:
      'A stage with concurrentWith is an event running alongside that named stage, excluded from the serial successor order. Its completion must be resolved before the owner stage completes; it cannot rerun the tail or teleport its target.',
    checkpointPolicy:
      'The implicit start checkpoint precedes stage one. Explicit checkpoints supplement it; replay rolls back only the named attempt, never prior completed missions.',
    scenePolicy:
      'Resolve actual anchor and collision/access volumes; proposals are not active WORLD objects. No marker relocation silently replaces missing geometry.',
    economyPolicy:
      'Reward amounts, original mission fees and clocks are authored tuning proposals. They require natural play/economy validation and are not asserted as source prices or balanced release values.',
    evidenceBoundary:
      'Source comparison relies on indexed articles because direct Fandom access was blocked. Incidental source cinematics/failure edge cases need further audit.',
    nextPack: 'LL-ST-021 and later, authored separately; all-source campaign remains incomplete.',
  },
});
