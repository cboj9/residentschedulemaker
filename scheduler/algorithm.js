/**
 * Resident Scheduling Algorithm
 *
 * Completion tracking: all counts are in HALF-BLOCK UNITS (2 for a full 4-week block,
 * 1 for a 2-week half-block). pgyRequirements values must also be in half-block units.
 *
 * Rotation duration modes:
 *   ALWAYS-HALF  (two_week=1):            placed in one half-slot (A or B), counts +1
 *   ALWAYS-FULL  (two_week=0, csh=0):     placed in both half-slots (full), counts +2
 *   FLEXIBLE     (two_week=0, csh=1):     prefers full block; uses single half when
 *                                          only one slot is free, counts +2 or +1
 *
 * Guarantees (best-effort, violations reported):
 *  1. Coverage: required rotations meet min capacity every slot, counting cross-program residents
 *  2. Completion: each resident completes every required rotation they're PGY-eligible for
 *  3. PGY restrictions honored
 *  4. Gap rules honored
 *  5. PTO approved only on PTO-eligible rotations, within allotment, coverage-safe
 *  6. Half-block (2-week) rotations supported alongside full-block (4-week) rotations
 *
 * Scoring model:
 *  7. Temporal distribution: repeated rotations are spaced evenly across the year.
 *  8. Phase preference: rotations may specify preferredBlockMin/preferredBlockMax.
 *  9. Dynamic gap target: scales with totalBlocks/requiredBlocks.
 * 10. Intensity stacking: night-float rotations avoid being paired in A/B halves.
 *
 * v2 additions:
 * 11. Configurable scoring weights via scoringWeights parameter — all magic numbers exposed.
 * 12. Randomized restart: reruns with shuffled resident order when errors exist; keeps best.
 * 13. Chain swaps: 2-resident trade pass resolves deficits blocked by coverage minima.
 * 14. generateSchedulesMultiProgram: iterative cross-program coordinator for shared services.
 *
 * v3 additions:
 * 15. pinnedAssignments: coordinator-locked slots applied before any pass runs; swap/repair
 *     passes skip pinned entries so coordinator intent is never overwritten.
 * 16. leavePeriods: per-resident block ranges (LOA, research months, etc.) that mark a
 *     resident fully unavailable; pre-flight infeasibility is leave-aware.
 * 17. Elective scoring: phase-preference bonus/penalty applied when selecting electives
 *     so timing is optimised within the coordinator's stated rank ordering.
 * 18. Multi-program shuffle: error-program re-run order is randomised each iteration so
 *     no program is systematically disadvantaged by always running last.
 *
 * Cross-program coverage:
 *   existingCoverage[rotationId][blockNumber] = count of residents from other programs.
 */

// ── Module-level helpers ───────────────────────────────────────────────────
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateSchedule({
  residents,
  rotations,
  ptoRequests,
  blockLengthWeeks,
  totalBlocks,
  existingCoverage = {},
  maxConsecutiveBlocksSameRotation = null,
  electivePreferences = [],
  scoringWeights = {},
  maxRestarts = 4,
  // v3: coordinator-locked assignments — never overwritten by any pass
  // [{ residentId, rotationId, blockNumber, halfBlock: 'A'|'B'|'full' }]
  pinnedAssignments = [],
  // v3: per-resident unavailability windows (LOA, research, maternity, boards, etc.)
  // [{ residentId, startBlock, endBlock }]
  leavePeriods = [],
  // LNS post-processing — runs automatically after restarts when errors remain.
  // Average users need not set these; the defaults handle typical program sizes well.
  lnsMaxIterations = 40,  // set to 0 to disable
  lnsDestroyRate = 0.35,
}) {
  const halfLen = blockLengthWeeks / 2;
  if (!Number.isInteger(halfLen)) throw new Error(`blockLengthWeeks must be even; got ${blockLengthWeeks}`);

  // ── Scoring weights (all magic numbers exposed for per-program tuning) ──────
  const W = {
    deficitBase:            20,
    deficitPerUnit:          5,
    deficitUrgencyFactor:   25,
    zeroSlack:              80,
    oneSlack:               50,
    twoSlack:               25,
    temporalDistMax:        15,
    temporalDistDecay:       2,
    phaseBonus:             15,
    phasePenaltyRate:        4,
    phasePenaltyMax:        30,
    tightGapPenalty:        60,
    gapShortfallRate:        5,
    intensityStackPenalty:  50,
    consecutiveWarnPenalty: 20,
    ptoEligibleBonus:       30,
    ptoIneligiblePenalty:   40,
    worstNeedPenalty:      100,
    overcompletePenalty:    50,
    futureBlockedUrgency:   20,
    phaseExactMultiplier:   10,
    phaseWindowMultiplier:   1.4,
    phaseOverdueMultiplier:  1.8,
    // v3: weight applied to rank position in elective scoring (higher = rank dominates)
    electiveRankWeight:     12,
    ...scoringWeights,
  };

  // ── PTO candidate index ────────────────────────────────────────────────────
  const ptoCandidates = {};
  for (const r of residents) ptoCandidates[r.id] = new Set();
  for (const req of ptoRequests) {
    if (!ptoCandidates[req.residentId]) continue;
    const maxWeek = totalBlocks * blockLengthWeeks;
    if (req.weekNumber >= 1 && req.weekNumber <= maxWeek)
      ptoCandidates[req.residentId].add(req.weekNumber);
  }
  const ptoCandidateBlocks = {};
  for (const r of residents) {
    ptoCandidateBlocks[r.id] = new Set();
    for (const w of ptoCandidates[r.id])
      ptoCandidateBlocks[r.id].add(Math.ceil(w / blockLengthWeeks));
  }

  // ── v3: Leave period index ─────────────────────────────────────────────────
  const leaveSet = new Set();
  for (const lp of leavePeriods) {
    for (let b = lp.startBlock; b <= Math.min(lp.endBlock, totalBlocks); b++) {
      leaveSet.add(`${lp.residentId}|${b}`);
    }
  }
  function isOnLeave(residentId, blockNumber) {
    return leaveSet.has(`${residentId}|${blockNumber}`);
  }

  // ── v3: Pinned assignment index ────────────────────────────────────────────
  // Group by block for O(1) lookup during the block loop
  const pinnedByBlock = {};
  for (const pin of pinnedAssignments) {
    if (!pinnedByBlock[pin.blockNumber]) pinnedByBlock[pin.blockNumber] = [];
    pinnedByBlock[pin.blockNumber].push(pin);
  }

  // ── Pure helpers ───────────────────────────────────────────────────────────
  function isHalfBlock(rotation) { return rotation.durationWeeks === halfLen; }
  function isFlexible(rotation)  { return !isHalfBlock(rotation) && Boolean(rotation.canSplitToHalf); }

  function slotWeeks(block, half) {
    const base = (block - 1) * blockLengthWeeks;
    if (half === 'A') return Array.from({ length: halfLen }, (_, i) => base + i + 1);
    if (half === 'B') return Array.from({ length: halfLen }, (_, i) => base + halfLen + i + 1);
    return Array.from({ length: blockLengthWeeks }, (_, i) => base + i + 1);
  }

  function isHighIntensityCall(rotation) {
    if (rotation.callType) return rotation.callType === 'night_float' || rotation.callType === 'q_call';
    return Boolean(rotation.nightFloat);
  }

  function hasFreeSlotFor(residentId, rotation, slotUsed) {
    if (isHalfBlock(rotation) || isFlexible(rotation))
      return !slotUsed[residentId].A || !slotUsed[residentId].B;
    return !slotUsed[residentId].A && !slotUsed[residentId].B;
  }

  function nextFreeHalf(residentId, slotUsed) {
    return !slotUsed[residentId].A ? 'A' : 'B';
  }

  // ── Pre-computed lookup tables ─────────────────────────────────────────────
  function isPGYEligible(resident, rotation) {
    if (!rotation.pgyRestrictions || rotation.pgyRestrictions.length === 0) return true;
    return rotation.pgyRestrictions.includes(resident.pgyYear);
  }

  function getRequiredHalfUnits(resident, rotation) {
    if (rotation.pgyRequirements && typeof rotation.pgyRequirements === 'object') {
      const req = rotation.pgyRequirements[resident.pgyYear];
      if (req !== undefined) return req;
      if (Object.keys(rotation.pgyRequirements).length > 0) return 0;
    }
    if (rotation.type !== 'required') return 0;
    return isHalfBlock(rotation) ? 1 : 2;
  }

  const pgyEligTable = {};
  const reqHUTable   = {};
  for (const r of residents) {
    pgyEligTable[r.id] = {};
    reqHUTable[r.id]   = {};
    for (const rot of rotations) {
      pgyEligTable[r.id][rot.id] = isPGYEligible(r, rot);
      reqHUTable[r.id][rot.id]   = getRequiredHalfUnits(r, rot);
    }
  }

  const requiredRotations = rotations.filter(r => r.type === 'required');

  const totalReqHU = {};
  for (const r of residents) {
    totalReqHU[r.id] = requiredRotations.reduce((sum, rot) => {
      if (!pgyEligTable[r.id][rot.id]) return sum;
      return sum + reqHUTable[r.id][rot.id];
    }, 0);
  }

  // O(1) rotation lookup used throughout
  const rotationMap = Object.fromEntries(rotations.map(r => [r.id, r]));

  // ── Pre-flight violations (ordering-independent, computed once) ────────────
  const preflightViolations = [];

  for (const r of residents) {
    // v3: available slots shrink for each block the resident is on leave
    const leaveBlockCount = Array.from({ length: totalBlocks }, (_, i) => i + 1)
      .filter(b => isOnLeave(r.id, b)).length;
    const totalAvailable = (totalBlocks - leaveBlockCount) * 2;
    if (totalReqHU[r.id] > totalAvailable) {
      preflightViolations.push({
        type: 'INFEASIBLE_RESIDENT',
        severity: 'error',
        residentId: r.id,
        message: `${r.name} requires ${totalReqHU[r.id]} half-units across required rotations but only ${totalAvailable} half-slots exist (${leaveBlockCount > 0 ? `${leaveBlockCount} block(s) on leave, ` : ''}${totalBlocks} total blocks) — schedule is structurally impossible`,
      });
    }
  }

  for (const rotation of requiredRotations) {
    const eligibleCount = residents.filter(r => pgyEligTable[r.id][rotation.id]).length;
    if (eligibleCount < rotation.minCapacity) {
      preflightViolations.push({
        type: 'INFEASIBLE_COVERAGE',
        severity: 'error',
        rotationId: rotation.id,
        message: `${rotation.name} requires ${rotation.minCapacity} residents per block but only ${eligibleCount} PGY-eligible residents exist`,
      });
    }

    if (rotation.minCapacity > 0) {
      const curriculumBlockSlots = residents.reduce((sum, r) => {
        if (!pgyEligTable[r.id][rotation.id]) return sum;
        const hu = reqHUTable[r.id][rotation.id];
        return sum + Math.floor(hu / (isHalfBlock(rotation) ? 1 : 2));
      }, 0);
      const minNeeded = rotation.minCapacity * totalBlocks;
      if (curriculumBlockSlots < minNeeded) {
        preflightViolations.push({
          type: 'INFEASIBLE_COVERAGE_DEMAND',
          severity: 'warning',
          rotationId: rotation.id,
          message: `${rotation.name}: minCapacity=${rotation.minCapacity} requires ${minNeeded} resident-block-slots over the year but only ${curriculumBlockSlots} are in any resident's curriculum — coverage gaps and over-assignments expected; consider lowering minCapacity`,
        });
      }
    }
  }

  // ── Restart helpers ────────────────────────────────────────────────────────
  function countViolationScore(result) {
    let errors = 0, completionMissing = 0, warnings = 0;
    for (const v of result.violations) {
      if (v.type === 'INFEASIBLE_RESIDENT' || v.type === 'INFEASIBLE_COVERAGE') continue;
      if (v.severity === 'error') { errors++; if (v.type === 'COMPLETION_MISSING') completionMissing++; }
      else warnings++;
    }
    return { errors, completionMissing, warnings };
  }

  function isBetter(candidate, current) {
    const cs = countViolationScore(candidate);
    const cu = countViolationScore(current);
    if (cs.errors !== cu.errors)             return cs.errors < cu.errors;
    if (cs.completionMissing !== cu.completionMissing) return cs.completionMissing < cu.completionMissing;
    return cs.warnings < cu.warnings;
  }

  // ── Core scheduling function ───────────────────────────────────────────────
  function runOnce(orderedResidents, extraPins = []) {
    const violations = [...preflightViolations];

    // Merge coordinator pins with LNS ephemeral pins for this run
    const effectivePinnedByBlock = {};
    for (const [b, pins] of Object.entries(pinnedByBlock)) {
      effectivePinnedByBlock[b] = [...pins];
    }
    for (const pin of extraPins) {
      if (!effectivePinnedByBlock[pin.blockNumber]) effectivePinnedByBlock[pin.blockNumber] = [];
      effectivePinnedByBlock[pin.blockNumber].push(pin);
    }

    // Per-run mutable state
    const completionCount   = {};
    const lastAssignedBlock = {};
    const consecutiveCount  = {};
    const approvedPTOWeeks  = {};
    const rotBlockCount     = {};

    for (const r of orderedResidents) {
      completionCount[r.id]   = {};
      lastAssignedBlock[r.id] = {};
      consecutiveCount[r.id]  = {};
      approvedPTOWeeks[r.id]  = new Set();
      for (const rot of rotations) {
        completionCount[r.id][rot.id]  = 0;
        consecutiveCount[r.id][rot.id] = 0;
      }
    }
    for (const rot of rotations) {
      rotBlockCount[rot.id] = {};
      for (let b = 1; b <= totalBlocks; b++) rotBlockCount[rot.id][b] = 0;
    }

    // Stateful constraint helpers (close over per-run state)
    function isGapSatisfied(resident, rotation, blockNumber) {
      if (!rotation.gapRules || rotation.gapRules.length === 0) return true;
      for (const rule of rotation.gapRules) {
        const lastBlock = lastAssignedBlock[resident.id][rule.after_rotation_id];
        if (lastBlock !== undefined && blockNumber - lastBlock < rule.min_gap_blocks) return false;
      }
      return true;
    }

    function isConsecutiveLimitSatisfied(resident, rotation, blockNumber) {
      const prevBlock = lastAssignedBlock[resident.id][rotation.id];
      if (prevBlock === undefined || prevBlock !== blockNumber - 1) return true;
      const current = consecutiveCount[resident.id][rotation.id] || 1;
      if (rotation.maxConsecutiveBlocks != null && current >= rotation.maxConsecutiveBlocks) return false;
      if (maxConsecutiveBlocksSameRotation != null && current >= maxConsecutiveBlocksSameRotation) return false;
      return true;
    }

    function isPrerequisiteSatisfied(resident, rotation) {
      if (!rotation.prerequisites || rotation.prerequisites.length === 0) return true;
      return rotation.prerequisites.every(prereqId => (completionCount[resident.id][prereqId] || 0) > 0);
    }

    // ── Main block loop ──────────────────────────────────────────────────────
    const allAssignments = [];
    let blockAssignedRot = {};
    let slackCache = {};

    for (let block = 1; block <= totalBlocks; block++) {
      slackCache = {};
      blockAssignedRot = {};

      const slotUsed = {};
      for (const r of orderedResidents) slotUsed[r.id] = { A: false, B: false };

      const blockAssignments = [];

      // ── v3: Apply pinned assignments before any pass runs ─────────────────
      // Pins consume slots and update all tracking state so the rest of the
      // block loop sees them as already-assigned. Pinned entries are flagged
      // so repair/swap passes never overwrite them.
      for (const pin of (effectivePinnedByBlock[block] || [])) {
        if (!slotUsed[pin.residentId]) continue; // residentId not in this run
        const rotation = rotationMap[pin.rotationId];

        if (pin.halfBlock === 'full') {
          slotUsed[pin.residentId].A = true;
          slotUsed[pin.residentId].B = true;
        } else {
          slotUsed[pin.residentId][pin.halfBlock] = true;
        }

        const units = pin.halfBlock === 'full' ? 2 : 1;
        completionCount[pin.residentId][pin.rotationId] =
          (completionCount[pin.residentId][pin.rotationId] || 0) + units;

        if (rotation) rotBlockCount[pin.rotationId][block]++;

        const prevPinBlock = lastAssignedBlock[pin.residentId][pin.rotationId];
        if (prevPinBlock !== undefined && prevPinBlock === block - 1) {
          consecutiveCount[pin.residentId][pin.rotationId] =
            (consecutiveCount[pin.residentId][pin.rotationId] || 1) + 1;
        } else {
          consecutiveCount[pin.residentId][pin.rotationId] = 1;
        }
        lastAssignedBlock[pin.residentId][pin.rotationId] = block;

        if (rotation) blockAssignedRot[pin.residentId] = rotation;

        blockAssignments.push({
          residentId:  pin.residentId,
          rotationId:  pin.rotationId,
          blockNumber: block,
          halfBlock:   pin.halfBlock,
          ptoWeeks:    [],
          pinned:      true,
          _ephemeral:  pin._ephemeral || false,
        });
      }

      // Pre-compute future feasibility once per block (avoids O(r²×n×b) per urgency call)
      const futureBlockedCounts = {};
      for (const rotation of requiredRotations) {
        let count = 0;
        for (const r of orderedResidents) {
          if (!pgyEligTable[r.id][rotation.id]) continue;
          const req = reqHUTable[r.id][rotation.id];
          if (req === 0 || completionCount[r.id][rotation.id] >= req) continue;
          let canScheduleLater = false;
          for (let fb = block + 1; fb <= totalBlocks && !canScheduleLater; fb++) {
            if (isOnLeave(r.id, fb)) continue;
            const fbCount = rotBlockCount[rotation.id][fb] || 0;
            const fbExt   = existingCoverage[rotation.id]?.[fb] || 0;
            if (isGapSatisfied(r, rotation, fb) && fbCount + fbExt < rotation.maxCapacity)
              canScheduleLater = true;
          }
          if (!canScheduleLater) count++;
        }
        futureBlockedCounts[rotation.id] = count;
      }

      function residentSlack(resident, blockNumber) {
        const cached = slackCache[resident.id];
        if (cached !== undefined) return cached;
        const usedInCurrentBlock = (slotUsed[resident.id]?.A ? 1 : 0) + (slotUsed[resident.id]?.B ? 1 : 0);
        // v3: future slots shrink for each upcoming leave block
        const futureLeaveBlocks = Array.from({ length: totalBlocks - blockNumber }, (_, i) => blockNumber + 1 + i)
          .filter(b => isOnLeave(resident.id, b)).length;
        const slotsRemaining = (totalBlocks - blockNumber - futureLeaveBlocks) * 2 + (2 - usedInCurrentBlock);
        let slotsNeeded = 0;
        for (const rot of requiredRotations) {
          if (!pgyEligTable[resident.id][rot.id]) continue;
          const req = reqHUTable[resident.id][rot.id];
          if (req === 0) continue;
          const deficit = req - completionCount[resident.id][rot.id];
          if (deficit > 0) slotsNeeded += deficit;
        }
        slackCache[resident.id] = slotsRemaining - slotsNeeded;
        return slackCache[resident.id];
      }

      function assignResident(resident, rotation) {
        let half;
        const bothFree = !slotUsed[resident.id].A && !slotUsed[resident.id].B;

        if (isHalfBlock(rotation)) {
          half = nextFreeHalf(resident.id, slotUsed);
          slotUsed[resident.id][half] = true;
        } else if (isFlexible(rotation) && bothFree) {
          const remainingNeed = reqHUTable[resident.id][rotation.id] - completionCount[resident.id][rotation.id];
          const hasAlwaysHalfNeeds = requiredRotations.some(rot =>
            isHalfBlock(rot) &&
            pgyEligTable[resident.id][rot.id] &&
            completionCount[resident.id][rot.id] < reqHUTable[resident.id][rot.id]
          );
          if (hasAlwaysHalfNeeds || remainingNeed === 1) {
            half = nextFreeHalf(resident.id, slotUsed);
            slotUsed[resident.id][half] = true;
          } else {
            half = 'full';
            slotUsed[resident.id].A = true;
            slotUsed[resident.id].B = true;
          }
        } else if (bothFree) {
          half = 'full';
          slotUsed[resident.id].A = true;
          slotUsed[resident.id].B = true;
        } else {
          half = nextFreeHalf(resident.id, slotUsed);
          slotUsed[resident.id][half] = true;
        }

        const halfUnits = (half === 'full') ? 2 : 1;
        completionCount[resident.id][rotation.id] += halfUnits;

        const prevAssigned = lastAssignedBlock[resident.id][rotation.id];
        if (prevAssigned !== undefined && prevAssigned === block - 1) {
          consecutiveCount[resident.id][rotation.id] = (consecutiveCount[resident.id][rotation.id] || 1) + 1;
        } else {
          consecutiveCount[resident.id][rotation.id] = 1;
        }
        lastAssignedBlock[resident.id][rotation.id] = block;

        rotBlockCount[rotation.id][block]++;
        blockAssignedRot[resident.id] = rotation;
        delete slackCache[resident.id];

        blockAssignments.push({
          residentId: resident.id,
          rotationId: rotation.id,
          blockNumber: block,
          halfBlock: half,
          ptoWeeks: [],
        });
      }

      function scoreResidentForRotation(resident, rotation, blockNumber) {
        let score = 0;
        const required = reqHUTable[resident.id][rotation.id];
        const done     = completionCount[resident.id][rotation.id];
        const blocksRemaining = totalBlocks - blockNumber + 1;
        const slack    = residentSlack(resident, blockNumber);

        if (done < required) {
          const deficit = required - done;
          score += W.deficitBase + deficit * W.deficitPerUnit;
          score += Math.round((deficit / (blocksRemaining * 2)) * W.deficitUrgencyFactor);
          if (slack <= 0)       score += W.zeroSlack;
          else if (slack === 1) score += W.oneSlack;
          else if (slack === 2) score += W.twoSlack;

          if (required > 1) {
            const idealBlock = ((done + 1) / required) * totalBlocks;
            const distance   = Math.abs(blockNumber - idealBlock);
            score += Math.max(0, Math.round(W.temporalDistMax - distance * W.temporalDistDecay));
          }
        }

        if (done >= required && required > 0) score -= W.overcompletePenalty;

        const prefMin = rotation.preferredBlockMin;
        const prefMax = rotation.preferredBlockMax;
        if (prefMin != null && prefMax != null) {
          if (blockNumber >= prefMin && blockNumber <= prefMax) {
            score += W.phaseBonus;
          } else {
            const dist = blockNumber < prefMin ? prefMin - blockNumber : blockNumber - prefMax;
            score -= Math.min(dist * W.phasePenaltyRate, W.phasePenaltyMax);
          }
        }

        const lastBlock = lastAssignedBlock[resident.id][rotation.id];
        if (lastBlock !== undefined) {
          const actualGap = blockNumber - lastBlock;
          if (actualGap < 2) {
            score -= W.tightGapPenalty;
          } else {
            const targetGap    = required > 1 ? Math.floor(totalBlocks / required) : totalBlocks;
            const gapShortfall = targetGap - actualGap;
            if (gapShortfall > 0) score -= gapShortfall * W.gapShortfallRate;
          }
        }

        const pairedRotation = blockAssignedRot[resident.id];
        if (pairedRotation && isHalfBlock(rotation)) {
          if (isHighIntensityCall(rotation) && isHighIntensityCall(pairedRotation))
            score -= W.intensityStackPenalty;
        }

        const consLimit = rotation.maxConsecutiveBlocks ?? maxConsecutiveBlocksSameRotation;
        if (consLimit != null) {
          const prevBlock = lastAssignedBlock[resident.id][rotation.id];
          if (prevBlock !== undefined && prevBlock === blockNumber - 1) {
            const current = consecutiveCount[resident.id][rotation.id] || 1;
            if (current >= consLimit - 1) score -= W.consecutiveWarnPenalty;
          }
        }

        if (ptoCandidateBlocks[resident.id].has(blockNumber)) {
          if (rotation.ptoEligible) score += W.ptoEligibleBonus;
          else score -= W.ptoIneligiblePenalty;
        }

        if (slack <= 0) {
          const isThisTheirBiggestNeed = requiredRotations
            .filter(rot => pgyEligTable[resident.id][rot.id])
            .every(rot =>
              rot.id === rotation.id ||
              completionCount[resident.id][rot.id] >= reqHUTable[resident.id][rot.id] ||
              (reqHUTable[resident.id][rot.id] - completionCount[resident.id][rot.id]) <= (required - done)
            );
          if (!isThisTheirBiggestNeed) score -= W.worstNeedPenalty;
        }

        return score;
      }

      function rotationUrgency(rotation) {
        const externalCount = existingCoverage[rotation.id]?.[block] || 0;
        const currentCount  = rotBlockCount[rotation.id][block];
        let urgency = Math.max(0, rotation.minCapacity - currentCount - externalCount);
        let eligibleCount = 0;

        for (const r of orderedResidents) {
          if (isOnLeave(r.id, block)) continue;
          if (!hasFreeSlotFor(r.id, rotation, slotUsed)) continue;
          if (!pgyEligTable[r.id][rotation.id]) continue;
          const req  = reqHUTable[r.id][rotation.id];
          if (req === 0) continue;
          const done = completionCount[r.id][rotation.id];
          if (done < req) {
            eligibleCount++;
            const deficit = req - done;
            const blocksRemaining = totalBlocks - block + 1;
            const slack = residentSlack(r, block);
            urgency += 1 + (deficit / (blocksRemaining * 2)) * 10 + Math.max(0, 5 - slack);
          }
        }

        if (eligibleCount > 0) urgency *= (1 + 5 / eligibleCount);

        const futureBlockedCount = futureBlockedCounts[rotation.id] || 0;
        if (futureBlockedCount > 0) urgency += futureBlockedCount * W.futureBlockedUrgency;

        const prefMin = rotation.preferredBlockMin;
        const prefMax = rotation.preferredBlockMax;
        if (prefMin != null && prefMax != null) {
          if (prefMin === prefMax && block === prefMin) urgency *= W.phaseExactMultiplier;
          else if (block >= prefMin && block <= prefMax) urgency *= W.phaseWindowMultiplier;
          else if (block > prefMax) urgency *= W.phaseOverdueMultiplier;
        }

        return urgency;
      }

      // Pass 1: fill required rotations to minCapacity
      const unprocessed = new Set(requiredRotations.map(r => r.id));
      while (unprocessed.size > 0) {
        let bestRotation = null, bestUrgency = -Infinity;
        for (const rot of requiredRotations) {
          if (!unprocessed.has(rot.id)) continue;
          const u = rotationUrgency(rot);
          if (u > bestUrgency) { bestUrgency = u; bestRotation = rot; }
        }
        if (!bestRotation) break;
        unprocessed.delete(bestRotation.id);
        const rotation = bestRotation;

        const externalCount = existingCoverage[rotation.id]?.[block] || 0;
        const currentCount  = rotBlockCount[rotation.id][block];
        const stillNeeded   = Math.max(0, rotation.minCapacity - currentCount - externalCount);

        const phase1aLimit = rotation.minCapacity === 0
          ? Math.max(0, rotation.maxCapacity - currentCount - externalCount)
          : stillNeeded;

        const needed = orderedResidents
          .filter(r =>
            !isOnLeave(r.id, block) &&
            hasFreeSlotFor(r.id, rotation, slotUsed) &&
            pgyEligTable[r.id][rotation.id] &&
            isGapSatisfied(r, rotation, block) &&
            isConsecutiveLimitSatisfied(r, rotation, block) &&
            isPrerequisiteSatisfied(r, rotation) &&
            completionCount[r.id][rotation.id] < reqHUTable[r.id][rotation.id]
          )
          .map(r => ({ resident: r, score: scoreResidentForRotation(r, rotation, block) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, phase1aLimit);

        for (const { resident } of needed) assignResident(resident, rotation);

        const gap = rotation.minCapacity - rotBlockCount[rotation.id][block] - externalCount;
        if (gap > 0) {
          const eligibleForCoverage = orderedResidents.filter(r =>
            !isOnLeave(r.id, block) &&
            hasFreeSlotFor(r.id, rotation, slotUsed) &&
            pgyEligTable[r.id][rotation.id] &&
            isGapSatisfied(r, rotation, block) &&
            isConsecutiveLimitSatisfied(r, rotation, block) &&
            isPrerequisiteSatisfied(r, rotation)
          );
          const coverageOnly         = eligibleForCoverage.filter(r => reqHUTable[r.id][rotation.id] === 0);
          const alreadyDone          = eligibleForCoverage.filter(r =>
            reqHUTable[r.id][rotation.id] > 0 &&
            completionCount[r.id][rotation.id] >= reqHUTable[r.id][rotation.id]
          );
          const curriculumStillNeeds = eligibleForCoverage.filter(r =>
            reqHUTable[r.id][rotation.id] > 0 &&
            completionCount[r.id][rotation.id] < reqHUTable[r.id][rotation.id]
          );
          const scoreMap = arr => arr
            .map(r => ({ resident: r, score: scoreResidentForRotation(r, rotation, block) }))
            .sort((a, b) => b.score - a.score);

          const coverage = [
            ...scoreMap(coverageOnly),
            ...scoreMap(alreadyDone),
            ...scoreMap(curriculumStillNeeds),
          ].slice(0, gap);

          const filled = rotBlockCount[rotation.id][block] + externalCount + coverage.length;
          if (filled < rotation.minCapacity) {
            violations.push({
              type: 'COVERAGE_BELOW_MIN',
              severity: 'error',
              blockNumber: block,
              rotationId: rotation.id,
              message: `${rotation.name}: only ${filled} of ${rotation.minCapacity} required resident(s) in block ${block}${externalCount > 0 ? ` (${externalCount} from other programs)` : ''}`,
            });
          }
          for (const { resident } of coverage) assignResident(resident, rotation);
        }
      }

      // Pass 2: fill remaining capacity with curriculum-deficit residents
      const sortedForPass2 = [...requiredRotations].sort((a, b) =>
        rotationUrgency(b) - rotationUrgency(a)
      );
      for (const rotation of sortedForPass2) {
        const remaining = rotation.maxCapacity - rotBlockCount[rotation.id][block];
        if (remaining <= 0) continue;
        const eligible = orderedResidents
          .filter(r =>
            !isOnLeave(r.id, block) &&
            hasFreeSlotFor(r.id, rotation, slotUsed) &&
            pgyEligTable[r.id][rotation.id] &&
            isGapSatisfied(r, rotation, block) &&
            isConsecutiveLimitSatisfied(r, rotation, block) &&
            isPrerequisiteSatisfied(r, rotation) &&
            completionCount[r.id][rotation.id] < reqHUTable[r.id][rotation.id]
          )
          .map(r => ({ resident: r, score: scoreResidentForRotation(r, rotation, block) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, remaining);
        for (const { resident } of eligible) assignResident(resident, rotation);
      }

      // Pass 3: elective placeholders for unfilled slots
      for (const resident of orderedResidents) {
        if (isOnLeave(resident.id, block)) continue;
        const freeA = !slotUsed[resident.id].A;
        const freeB = !slotUsed[resident.id].B;
        if (freeA && freeB) {
          slotUsed[resident.id].A = true;
          slotUsed[resident.id].B = true;
          blockAssignments.push({ residentId: resident.id, rotationId: null, blockNumber: block, halfBlock: 'full', ptoWeeks: [] });
        } else if (freeA) {
          slotUsed[resident.id].A = true;
          blockAssignments.push({ residentId: resident.id, rotationId: null, blockNumber: block, halfBlock: 'A', ptoWeeks: [] });
        } else if (freeB) {
          slotUsed[resident.id].B = true;
          blockAssignments.push({ residentId: resident.id, rotationId: null, blockNumber: block, halfBlock: 'B', ptoWeeks: [] });
        }
      }

      // PTO approval pass
      const slotGroups = new Map();
      for (const asgn of blockAssignments) {
        const key = `${asgn.rotationId}||${asgn.halfBlock}`;
        if (!slotGroups.has(key))
          slotGroups.set(key, { rotation: rotationMap[asgn.rotationId], half: asgn.halfBlock, asgnList: [] });
        slotGroups.get(key).asgnList.push(asgn);
      }

      for (const { rotation, half, asgnList } of slotGroups.values()) {
        if (!rotation?.ptoEligible) continue;
        const weeks = slotWeeks(block, half);
        const ptoCountPerWeek = {};
        for (const w of weeks) ptoCountPerWeek[w] = 0;
        const externalCount = existingCoverage[rotation.id]?.[block] || 0;

        const candidates = asgnList
          .map(asgn => ({
            asgn,
            resident: orderedResidents.find(r => r.id === asgn.residentId),
            requestedWeeks: weeks.filter(w => ptoCandidates[asgn.residentId]?.has(w)),
          }))
          .filter(c => c.requestedWeeks.length > 0)
          .sort((a, b) => approvedPTOWeeks[a.asgn.residentId].size - approvedPTOWeeks[b.asgn.residentId].size);

        for (const { asgn, resident, requestedWeeks } of candidates) {
          const remainingAllotment = resident.ptoWeeksAllotted - approvedPTOWeeks[asgn.residentId].size;
          if (remainingAllotment <= 0) continue;
          const approved = [];
          for (const w of requestedWeeks) {
            if (approved.length >= remainingAllotment) break;
            const effectiveCoverage = asgnList.length + externalCount - ptoCountPerWeek[w] - 1;
            if (effectiveCoverage >= rotation.minCapacity) {
              approved.push(w);
              ptoCountPerWeek[w]++;
            }
          }
          if (approved.length > 0) {
            asgn.ptoWeeks = approved;
            for (const w of approved) approvedPTOWeeks[asgn.residentId].add(w);
          }
        }
      }

      allAssignments.push(...blockAssignments);
    } // end block loop

    // ── Repair pass ───────────────────────────────────────────────────────────
    const repairPairs = [];
    for (const resident of orderedResidents) {
      for (const rotation of requiredRotations) {
        if (!pgyEligTable[resident.id][rotation.id]) continue;
        const req = reqHUTable[resident.id][rotation.id];
        if (req === 0) continue;
        const deficit = req - completionCount[resident.id][rotation.id];
        if (deficit > 0) repairPairs.push({ resident, rotation });
      }
    }
    repairPairs.sort((a, b) => {
      const defA = reqHUTable[a.resident.id][a.rotation.id] - completionCount[a.resident.id][a.rotation.id];
      const defB = reqHUTable[b.resident.id][b.rotation.id] - completionCount[b.resident.id][b.rotation.id];
      return defB - defA;
    });

    for (const { resident, rotation } of repairPairs) {
      let deficit = reqHUTable[resident.id][rotation.id] - completionCount[resident.id][rotation.id];
      if (deficit <= 0) continue;

      // v3: pinned slots are never repaired into — they belong to the coordinator
      const electiveSlots = allAssignments
        .filter(a => a.residentId === resident.id && a.rotationId === null && !a.pinned)
        .sort((a, b) => a.blockNumber - b.blockNumber);

      for (const slot of electiveSlots) {
        if (deficit <= 0) break;
        if (isOnLeave(resident.id, slot.blockNumber)) continue;
        if (!isGapSatisfied(resident, rotation, slot.blockNumber)) continue;
        if (!isPrerequisiteSatisfied(resident, rotation)) continue;
        if (!isConsecutiveLimitSatisfied(resident, rotation, slot.blockNumber)) continue;
        if (!isHalfBlock(rotation) && !isFlexible(rotation) && slot.halfBlock !== 'full') continue;
        // Half-block rotations can't consume a full null slot as 2 units. Split it: take the A
        // half and leave a B null slot behind so the other half remains available.
        if (isHalfBlock(rotation) && slot.halfBlock === 'full') {
          slot.halfBlock = 'A';
          allAssignments.push({ residentId: resident.id, rotationId: null, blockNumber: slot.blockNumber, halfBlock: 'B', ptoWeeks: [] });
        }

        const blockCount = rotBlockCount[rotation.id][slot.blockNumber] || 0;
        const ext        = existingCoverage[rotation.id]?.[slot.blockNumber] || 0;
        if (blockCount + ext >= rotation.maxCapacity) continue;

        slot.rotationId = rotation.id;
        const units = slot.halfBlock === 'full' ? 2 : 1;
        completionCount[resident.id][rotation.id] += units;
        rotBlockCount[rotation.id][slot.blockNumber]++;

        const repairPrev = lastAssignedBlock[resident.id][rotation.id];
        if (repairPrev !== undefined && repairPrev === slot.blockNumber - 1) {
          consecutiveCount[resident.id][rotation.id] = (consecutiveCount[resident.id][rotation.id] || 1) + 1;
        } else {
          consecutiveCount[resident.id][rotation.id] = 1;
        }
        if (slot.blockNumber > (lastAssignedBlock[resident.id][rotation.id] ?? 0))
          lastAssignedBlock[resident.id][rotation.id] = slot.blockNumber;

        deficit -= units;
      }
    }

    // ── Single-swap pass ──────────────────────────────────────────────────────
    const swapPairs = [];
    for (const resident of orderedResidents) {
      for (const rotation of requiredRotations) {
        if (!pgyEligTable[resident.id][rotation.id]) continue;
        const req = reqHUTable[resident.id][rotation.id];
        if (req === 0) continue;
        if (req - completionCount[resident.id][rotation.id] > 0)
          swapPairs.push({ resident, rotation });
      }
    }
    swapPairs.sort((a, b) => {
      const defA = reqHUTable[a.resident.id][a.rotation.id] - completionCount[a.resident.id][a.rotation.id];
      const defB = reqHUTable[b.resident.id][b.rotation.id] - completionCount[b.resident.id][b.rotation.id];
      return defB - defA;
    });

    for (const { resident, rotation: targetRot } of swapPairs) {
      let deficit = reqHUTable[resident.id][targetRot.id] - completionCount[resident.id][targetRot.id];
      if (deficit <= 0) continue;

      // v3: never swap out a pinned assignment
      const swapCandidates = allAssignments
        .filter(a => {
          if (a.residentId !== resident.id || a.rotationId === null || a.pinned) return false;
          const srcRot = rotationMap[a.rotationId];
          if (!srcRot) return false;
          return completionCount[resident.id][a.rotationId] > reqHUTable[resident.id][srcRot.id];
        })
        .sort((a, b) => a.blockNumber - b.blockNumber);

      for (const slot of swapCandidates) {
        if (deficit <= 0) break;
        if (isOnLeave(resident.id, slot.blockNumber)) continue;
        if (!isGapSatisfied(resident, targetRot, slot.blockNumber)) continue;
        if (!isConsecutiveLimitSatisfied(resident, targetRot, slot.blockNumber)) continue;
        if (!isPrerequisiteSatisfied(resident, targetRot)) continue;

        const targetBlockCount = rotBlockCount[targetRot.id][slot.blockNumber] || 0;
        const targetExt        = existingCoverage[targetRot.id]?.[slot.blockNumber] || 0;
        if (targetBlockCount + targetExt >= targetRot.maxCapacity) continue;

        const srcRot = rotationMap[slot.rotationId];
        if (srcRot) {
          const srcBlockCount = rotBlockCount[srcRot.id][slot.blockNumber] || 0;
          const srcExt        = existingCoverage[srcRot.id]?.[slot.blockNumber] || 0;
          if (srcBlockCount - 1 + srcExt < srcRot.minCapacity) continue;
        }

        if (srcRot && completionCount[resident.id][slot.rotationId] <= reqHUTable[resident.id][srcRot.id]) continue;

        const units = slot.halfBlock === 'full' ? 2 : 1;
        completionCount[resident.id][slot.rotationId] -= units;
        completionCount[resident.id][targetRot.id]    += units;

        if (srcRot) {
          rotBlockCount[srcRot.id][slot.blockNumber]--;
          rotBlockCount[targetRot.id][slot.blockNumber]++;
        }

        const prevBlock = lastAssignedBlock[resident.id][targetRot.id];
        if (prevBlock !== undefined && prevBlock === slot.blockNumber - 1) {
          consecutiveCount[resident.id][targetRot.id] = (consecutiveCount[resident.id][targetRot.id] || 1) + 1;
        } else {
          consecutiveCount[resident.id][targetRot.id] = 1;
        }
        lastAssignedBlock[resident.id][targetRot.id] = slot.blockNumber;
        slot.rotationId = targetRot.id;

        if (srcRot) {
          const newSrcLast = allAssignments
            .filter(a => a.residentId === resident.id && a.rotationId === srcRot.id)
            .reduce((max, a) => Math.max(max, a.blockNumber), -Infinity);
          if (isFinite(newSrcLast)) lastAssignedBlock[resident.id][srcRot.id] = newSrcLast;
          else delete lastAssignedBlock[resident.id][srcRot.id];
        }

        deficit -= units;
      }
    }

    // ── Chain swap pass (2-resident trade) ────────────────────────────────────
    // For each pair (R1, R2) where R1 needs rotA and is over-complete in rotB,
    // and R2 needs rotB and is over-complete in rotA: find a block where both
    // have the matching assignment and trade atomically. Coverage is preserved
    // because both residents swap simultaneously (net 0 change per rotation).
    for (const r1 of orderedResidents) {
      const r1Deficits = requiredRotations.filter(rot =>
        pgyEligTable[r1.id][rot.id] &&
        reqHUTable[r1.id][rot.id] > 0 &&
        completionCount[r1.id][rot.id] < reqHUTable[r1.id][rot.id]
      );
      const r1Surpluses = requiredRotations.filter(rot =>
        pgyEligTable[r1.id][rot.id] &&
        reqHUTable[r1.id][rot.id] > 0 &&
        completionCount[r1.id][rot.id] > reqHUTable[r1.id][rot.id]
      );
      if (r1Deficits.length === 0 || r1Surpluses.length === 0) continue;

      for (const r2 of orderedResidents) {
        if (r2.id === r1.id) continue;

        for (const rotA of r1Deficits) {
          if (completionCount[r1.id][rotA.id] >= reqHUTable[r1.id][rotA.id]) continue;

          for (const rotB of r1Surpluses) {
            if (completionCount[r1.id][rotB.id] <= reqHUTable[r1.id][rotB.id]) continue;

            if (!pgyEligTable[r2.id][rotB.id]) continue;
            if (reqHUTable[r2.id][rotB.id] === 0) continue;
            if (completionCount[r2.id][rotB.id] >= reqHUTable[r2.id][rotB.id]) continue;

            if (!pgyEligTable[r2.id][rotA.id]) continue;
            if (completionCount[r2.id][rotA.id] <= reqHUTable[r2.id][rotA.id]) continue;

            // v3: exclude pinned slots from chain swap candidates
            const r1RotBSlots = allAssignments.filter(a =>
              !a.pinned && a.residentId === r1.id && a.rotationId === rotB.id
            );
            const r2RotAByBlock = new Map();
            for (const a of allAssignments) {
              if (!a.pinned && a.residentId === r2.id && a.rotationId === rotA.id)
                r2RotAByBlock.set(`${a.blockNumber}|${a.halfBlock}`, a);
            }

            for (const slotR1 of r1RotBSlots) {
              const slotR2 = r2RotAByBlock.get(`${slotR1.blockNumber}|${slotR1.halfBlock}`);
              if (!slotR2) continue;

              const b = slotR1.blockNumber;

              if (!isGapSatisfied(r1, rotA, b)) continue;
              if (!isConsecutiveLimitSatisfied(r1, rotA, b)) continue;
              if (!isPrerequisiteSatisfied(r1, rotA)) continue;

              if (!isGapSatisfied(r2, rotB, b)) continue;
              if (!isConsecutiveLimitSatisfied(r2, rotB, b)) continue;
              if (!isPrerequisiteSatisfied(r2, rotB)) continue;

              const units = slotR1.halfBlock === 'full' ? 2 : 1;

              completionCount[r1.id][rotB.id] -= units;
              completionCount[r1.id][rotA.id] += units;
              completionCount[r2.id][rotA.id] -= units;
              completionCount[r2.id][rotB.id] += units;

              slotR1.rotationId = rotA.id;
              slotR2.rotationId = rotB.id;

              if (b > (lastAssignedBlock[r1.id][rotA.id] ?? 0))
                lastAssignedBlock[r1.id][rotA.id] = b;
              if (b > (lastAssignedBlock[r2.id][rotB.id] ?? 0))
                lastAssignedBlock[r2.id][rotB.id] = b;

              // Recompute lastAssignedBlock for the rotations that were removed from each
              // resident — mirrors the same pattern used in the single-swap pass.
              const newR1RotBLast = allAssignments
                .filter(a => a.residentId === r1.id && a.rotationId === rotB.id)
                .reduce((max, a) => Math.max(max, a.blockNumber), -Infinity);
              if (isFinite(newR1RotBLast)) lastAssignedBlock[r1.id][rotB.id] = newR1RotBLast;
              else delete lastAssignedBlock[r1.id][rotB.id];

              const newR2RotALast = allAssignments
                .filter(a => a.residentId === r2.id && a.rotationId === rotA.id)
                .reduce((max, a) => Math.max(max, a.blockNumber), -Infinity);
              if (isFinite(newR2RotALast)) lastAssignedBlock[r2.id][rotA.id] = newR2RotALast;
              else delete lastAssignedBlock[r2.id][rotA.id];

              break;
            }
          }
        }
      }
    }

    // ── Elective placement pass ───────────────────────────────────────────────
    if (electivePreferences.length > 0) {
      const electiveRotations = rotations.filter(r => r.type !== 'required');
      const electiveRotMap = Object.fromEntries(electiveRotations.map(r => [r.id, r]));

      const preferencesByResident = {};
      for (const r of orderedResidents) preferencesByResident[r.id] = [];
      for (const pref of electivePreferences) {
        if (preferencesByResident[pref.residentId]) preferencesByResident[pref.residentId].push(pref);
      }
      for (const r of orderedResidents) preferencesByResident[r.id].sort((a, b) => a.rank - b.rank);

      const electiveBlockCounts = {};
      for (const rot of electiveRotations) {
        electiveBlockCounts[rot.id] = {};
        for (const asgn of allAssignments) {
          if (asgn.rotationId === rot.id)
            electiveBlockCounts[rot.id][asgn.blockNumber] = (electiveBlockCounts[rot.id][asgn.blockNumber] || 0) + 1;
        }
      }

      // Build a per-block paired-rotation lookup for intensity stacking checks
      const pairedRotBySlot = {};
      for (const a of allAssignments) {
        if (!a.rotationId || a.rotationId === null) continue;
        pairedRotBySlot[`${a.residentId}|${a.blockNumber}|${a.halfBlock}`] = rotationMap[a.rotationId];
      }

      const residentElectiveAssigned = {};
      for (const r of orderedResidents) residentElectiveAssigned[r.id] = new Set();

      for (const resident of orderedResidents) {
        const prefs = preferencesByResident[resident.id];
        if (prefs.length === 0) continue;

        const nullSlots = allAssignments
          .filter(a => a.residentId === resident.id && a.rotationId === null && !a.pinned)
          .sort((a, b) => a.blockNumber - b.blockNumber);

        for (const slot of nullSlots) {
          if (isOnLeave(resident.id, slot.blockNumber)) continue;
          const slotIsHalf = slot.halfBlock === 'A' || slot.halfBlock === 'B';

          // v3: score each eligible preference; pick the best rather than first
          let bestPref = null, bestScore = -Infinity;

          for (const pref of prefs) {
            if (residentElectiveAssigned[resident.id].has(pref.rotationId)) continue;

            const rotation = electiveRotMap[pref.rotationId];
            if (!rotation) continue;
            if (!pgyEligTable[resident.id][rotation.id]) continue;
            if (!isGapSatisfied(resident, rotation, slot.blockNumber)) continue;
            if (!isConsecutiveLimitSatisfied(resident, rotation, slot.blockNumber)) continue;
            if (!isPrerequisiteSatisfied(resident, rotation)) continue;

            const rotIsHalf = isHalfBlock(rotation);
            const rotIsFull = !rotIsHalf && !isFlexible(rotation);
            if (slotIsHalf && rotIsFull) continue;
            if (!slotIsHalf && rotIsHalf) continue;

            const extCount   = existingCoverage[rotation.id]?.[slot.blockNumber] || 0;
            const blockCount = electiveBlockCounts[rotation.id]?.[slot.blockNumber] || 0;
            if (rotation.maxCapacity != null && blockCount + extCount >= rotation.maxCapacity) continue;

            // Score: rank dominates; phase preference and intensity stacking refine within rank
            let score = -pref.rank * W.electiveRankWeight;

            const prefMin = rotation.preferredBlockMin;
            const prefMax = rotation.preferredBlockMax;
            if (prefMin != null && prefMax != null) {
              if (slot.blockNumber >= prefMin && slot.blockNumber <= prefMax) {
                score += W.phaseBonus;
              } else {
                const dist = slot.blockNumber < prefMin
                  ? prefMin - slot.blockNumber
                  : slot.blockNumber - prefMax;
                score -= Math.min(dist * W.phasePenaltyRate, W.phasePenaltyMax);
              }
            }

            // Penalise pairing two high-intensity electives in the same block
            const pairedHalf = slot.halfBlock === 'A' ? 'B' : slot.halfBlock === 'B' ? 'A' : null;
            if (pairedHalf && isHighIntensityCall(rotation)) {
              const pairedRot = pairedRotBySlot[`${resident.id}|${slot.blockNumber}|${pairedHalf}`];
              if (pairedRot && isHighIntensityCall(pairedRot)) score -= W.intensityStackPenalty;
            }

            if (score > bestScore) {
              bestScore = score;
              bestPref  = pref;
            }
          }

          if (bestPref) {
            const rotation = electiveRotMap[bestPref.rotationId];
            slot.rotationId = rotation.id;
            electiveBlockCounts[rotation.id][slot.blockNumber] =
              (electiveBlockCounts[rotation.id][slot.blockNumber] || 0) + 1;
            residentElectiveAssigned[resident.id].add(bestPref.rotationId);
            completionCount[resident.id][rotation.id] =
              (completionCount[resident.id][rotation.id] || 0) + (slot.halfBlock === 'full' ? 2 : 1);
            if (slot.blockNumber > (lastAssignedBlock[resident.id][rotation.id] ?? 0))
              lastAssignedBlock[resident.id][rotation.id] = slot.blockNumber;
            // Update paired-rotation index so subsequent slots in the same block see this assignment
            pairedRotBySlot[`${resident.id}|${slot.blockNumber}|${slot.halfBlock}`] = rotation;
          }
        }

        const unfilledCount = allAssignments.filter(
          a => a.residentId === resident.id && a.rotationId === null && !a.pinned
        ).length;
        if (unfilledCount > 0 && prefs.length > 0) {
          violations.push({
            type: 'ELECTIVE_UNMATCHED',
            severity: 'warning',
            residentId: resident.id,
            message: `${resident.name} has ${unfilledCount} elective slot(s) that could not be filled from their ${prefs.length} submitted preference(s)`,
          });
        }
      }
    }

    // ── Post-processing: completion check ─────────────────────────────────────
    for (const resident of orderedResidents) {
      for (const rotation of requiredRotations) {
        if (!pgyEligTable[resident.id][rotation.id]) continue;
        const required = reqHUTable[resident.id][rotation.id];
        if (required === 0) continue;
        const done = completionCount[resident.id][rotation.id];
        if (done < required) {
          violations.push({
            type: 'COMPLETION_MISSING',
            severity: 'error',
            residentId: resident.id,
            rotationId: rotation.id,
            message: done === 0
              ? `${resident.name} did not complete required rotation "${rotation.name}" this academic year`
              : `${resident.name} completed "${rotation.name}" ${done}/${required} required half-units`,
          });
        }
      }
    }

    for (const resident of orderedResidents) {
      const totalApproved = approvedPTOWeeks[resident.id].size;
      if (totalApproved > resident.ptoWeeksAllotted) {
        violations.push({
          type: 'PTO_OVER_ALLOTMENT',
          severity: 'warning',
          residentId: resident.id,
          message: `${resident.name} was approved for ${totalApproved} PTO weeks but is allotted ${resident.ptoWeeksAllotted}`,
        });
      }
    }

    const seenInBlock = {};
    for (const asgn of allAssignments) {
      if (!asgn.rotationId) continue;
      const key = `${asgn.residentId}||${asgn.rotationId}||${asgn.blockNumber}`;
      if (seenInBlock[key]) {
        const resident = orderedResidents.find(r => r.id === asgn.residentId);
        const rotation = rotationMap[asgn.rotationId];
        violations.push({
          type: 'DOUBLE_ASSIGNMENT',
          severity: 'error',
          residentId: asgn.residentId,
          rotationId: asgn.rotationId,
          blockNumber: asgn.blockNumber,
          message: `${resident?.name} is assigned to "${rotation?.name}" twice in block ${asgn.blockNumber}`,
        });
      }
      seenInBlock[key] = true;
    }

    return { assignments: allAssignments, violations };
  } // end runOnce

  // ── LNS helpers ───────────────────────────────────────────────────────────
  // buildDestroySet returns a Set of "${residentId}|${blockNumber}" keys whose
  // assignments will be cleared and rebuilt in the next runOnce call.
  function buildDestroySet(result, strategy) {
    const destroySet = new Set();
    if (strategy === 'deficit') {
      // Target only residents with unfulfilled required rotations.
      const deficitResidents = new Set(
        result.violations
          .filter(v => v.type === 'COMPLETION_MISSING')
          .map(v => v.residentId)
      );
      if (deficitResidents.size === 0) return destroySet;
      for (const a of result.assignments) {
        if (a.pinned) continue;
        if (!deficitResidents.has(a.residentId)) continue;
        // Always clear null (unfilled) slots; clear others with probability lnsDestroyRate
        if (a.rotationId === null || Math.random() < lnsDestroyRate) {
          destroySet.add(`${a.residentId}|${a.blockNumber}`);
        }
      }
    } else {
      // Random contiguous block window (~30% of the year)
      const windowSize = Math.max(2, Math.round(totalBlocks * 0.3));
      const startBlock = Math.floor(Math.random() * Math.max(1, totalBlocks - windowSize + 1)) + 1;
      const endBlock   = Math.min(startBlock + windowSize - 1, totalBlocks);
      for (const a of result.assignments) {
        if (a.pinned) continue;
        if (a.blockNumber >= startBlock && a.blockNumber <= endBlock) {
          destroySet.add(`${a.residentId}|${a.blockNumber}`);
        }
      }
    }
    return destroySet;
  }

  function lnsImprove(initial, baseResidents) {
    let current = initial;
    for (let iter = 0; iter < lnsMaxIterations; iter++) {
      if (countViolationScore(current).errors === 0) break;

      // Even iterations: deficit-focused (precise). Odd: block-window (diversifying).
      const strategy  = iter % 2 === 0 ? 'deficit' : 'window';
      const destroySet = buildDestroySet(current, strategy);
      if (destroySet.size === 0) continue;

      // Assignments outside the destroy set become ephemeral pins for this round.
      // Coordinator pins (a.pinned) are excluded — runOnce applies them via pinnedByBlock.
      const kept = current.assignments
        .filter(a =>
          a.rotationId !== null &&
          !a.pinned &&
          !destroySet.has(`${a.residentId}|${a.blockNumber}`)
        )
        .map(a => ({
          residentId:  a.residentId,
          rotationId:  a.rotationId,
          blockNumber: a.blockNumber,
          halfBlock:   a.halfBlock,
          _ephemeral:  true,
        }));

      const shuffled = shuffleArray([...baseResidents]);
      const candidate = runOnce(shuffled, kept);

      // Strip ephemeral markers so future rounds can freely destroy these slots
      for (const a of candidate.assignments) {
        if (a._ephemeral) { a.pinned = false; delete a._ephemeral; }
      }

      if (isBetter(candidate, current)) current = candidate;
    }
    return current;
  }

  // ── Randomized restart loop ────────────────────────────────────────────────
  let best = runOnce(residents);
  for (let attempt = 1; attempt < maxRestarts; attempt++) {
    const { errors } = countViolationScore(best);
    if (errors === 0) break;
    const shuffled = shuffleArray([...residents]);
    const candidate = runOnce(shuffled);
    if (isBetter(candidate, best)) best = candidate;
  }

  // ── LNS improvement pass ──────────────────────────────────────────────────
  // Only runs when restarts couldn't eliminate all errors. Transparent to the
  // caller — no new required inputs for the average user.
  if (lnsMaxIterations > 0 && countViolationScore(best).errors > 0) {
    best = lnsImprove(best, residents);
  }

  return best;
}

// ── Multi-program orchestrator ─────────────────────────────────────────────
/**
 * Generates schedules for multiple programs iteratively, so each program sees
 * the latest assignments from all others as existingCoverage. Programs that
 * still have fixable errors are re-run up to maxIterations times.
 *
 * @param {Object} options
 * @param {Array}  options.programs            - Array of program configs:
 *   { programId, residents, rotations, ptoRequests,
 *     electivePreferences?, maxConsecutiveBlocksSameRotation?,
 *     pinnedAssignments?, leavePeriods? }
 * @param {number} options.blockLengthWeeks
 * @param {number} options.totalBlocks
 * @param {Object} options.externalCoverage    - Coverage from outside all programs
 * @param {Object} options.scoringWeights      - Passed through to generateSchedule
 * @param {number} options.maxRestarts         - Per-program restart budget
 * @param {number} options.maxIterations       - Cross-program re-run iterations
 * @returns {Object} programId → { assignments, violations }
 */
function generateSchedulesMultiProgram({
  programs,
  blockLengthWeeks,
  totalBlocks,
  externalCoverage = {},
  scoringWeights = {},
  maxRestarts = 4,
  maxIterations = 3,
  lnsMaxIterations = 40,
  lnsDestroyRate = 0.35,
}) {
  const results = new Map();

  function buildCoverage(excludeProgramId) {
    const coverage = {};
    for (const [rotId, blockMap] of Object.entries(externalCoverage)) {
      coverage[rotId] = { ...blockMap };
    }
    for (const [pid, result] of results) {
      if (pid === excludeProgramId) continue;
      for (const asgn of result.assignments) {
        if (!asgn.rotationId) continue;
        if (!coverage[asgn.rotationId]) coverage[asgn.rotationId] = {};
        coverage[asgn.rotationId][asgn.blockNumber] =
          (coverage[asgn.rotationId][asgn.blockNumber] || 0) + 1;
      }
    }
    return coverage;
  }

  function runProgram(program) {
    return generateSchedule({
      residents:                        program.residents,
      rotations:                        program.rotations,
      ptoRequests:                      program.ptoRequests,
      blockLengthWeeks,
      totalBlocks,
      existingCoverage:                 buildCoverage(program.programId),
      maxConsecutiveBlocksSameRotation: program.maxConsecutiveBlocksSameRotation ?? null,
      electivePreferences:              program.electivePreferences ?? [],
      scoringWeights,
      maxRestarts,
      pinnedAssignments:                program.pinnedAssignments ?? [],
      leavePeriods:                     program.leavePeriods ?? [],
      lnsMaxIterations,
      lnsDestroyRate,
    });
  }

  // Initial pass — run all programs in sequence so each benefits from prior results
  for (const program of programs) {
    results.set(program.programId, runProgram(program));
  }

  // Iterative re-runs: programs with fixable errors are re-scheduled with updated coverage.
  // v3: shuffle program order each iteration so no program is systematically last.
  for (let iter = 0; iter < maxIterations; iter++) {
    const errorPrograms = programs.filter(p => {
      const result = results.get(p.programId);
      return result.violations.some(v =>
        v.severity === 'error' &&
        v.type !== 'INFEASIBLE_RESIDENT' &&
        v.type !== 'INFEASIBLE_COVERAGE'
      );
    });
    if (errorPrograms.length === 0) break;

    const orderedErrorPrograms = shuffleArray([...errorPrograms]);
    for (const program of orderedErrorPrograms) {
      results.set(program.programId, runProgram(program));
    }
  }

  const output = {};
  for (const [programId, result] of results) output[programId] = result;
  return output;
}

module.exports = { generateSchedule, generateSchedulesMultiProgram };
