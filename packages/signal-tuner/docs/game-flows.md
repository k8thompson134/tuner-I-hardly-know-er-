# Signal Tuner Game — User Flows & Game States

**Document purpose:** Map out the complete game flow, player journeys, transmission patterns, and audio/visual feedback strategy *without* implementation details.

> **Status:** design reference / Phase 2+ target, not yet built. See
> "Relationship to the current build" at the bottom for what's implemented
> today vs. what this doc envisions, and which pieces are cheapest to pick
> up next. Terminology note: what's built calls these **transmissions**
> (matching the "song lyrics" content theme in the repo's `CLAUDE.md`); this
> doc calls them **missions** — same concept, keep either name, just be
> consistent within whichever section you're editing.

---

## Game State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                      GAME STATES                             │
└─────────────────────────────────────────────────────────────┘

    START
      ↓
  ┌─────────────────────┐
  │  TRANSMISSION MENU  │  (optional: can auto-start mission 1)
  │  (select mission)   │
  └──────────┬──────────┘
             ↓
  ┌─────────────────────────────────┐
  │   ACTIVE TRANSMISSION            │
  │  - Sliders unfrozen              │
  │  - Player adjusting              │
  │  - Feedback flowing              │
  └──────────┬──────────┬────────────┘
             │          │
      (sliders lock)   (player gives up)
             │          │
             ↓          ↓
  ┌─────────────────────────────────┐
  │   TRANSMISSION COMPLETE          │  (or TRANSMISSION ABANDONED)
  │  - Show stats (time, attempts)   │
  │  - Play unlock fanfare           │
  │  - Play unlocked track (if any)  │
  │  - Show next/replay options      │
  └──────────┬──────────┬────────────┘
             │          │
      (next mission) (replay/menu)
             ↓          ↓
  ┌─────────────────────────────────┐
  │    TRANSMISSION MENU             │
  └──────────┬──────────┬────────────┘
             │          │
         (unlock next) (return to start)
             ↓          ↓
          END / LOOP
```

---

## Core User Flows

### Flow 1: Fresh Player — First Mission

**Entry:** Game starts → Auto-starts Mission 1 (or shows "Start?" prompt)

1. **IDLE STATE** (before slider touch)
   - Marquee: "MISSION 1" or blank
   - Sliders: unfrozen, at neutral positions
   - Visualizer: quiet/steady (not animating)
   - Player sees three EQ sliders and knows they need to do *something*

2. **EXPLORATION** (player adjusts sliders)
   - Player tries slider 1 (e.g., 170 Hz band)
   - **Light feedback:** Slider area lights up (orange if far, yellow if close)
   - **Audio feedback:** Subtle tone or beep indicating proximity (lower tone = far, higher = close)
   - **Visualizer:** Shows increasing activity as slider approaches zone
   - Player learns: "when I move this slider to the top, I get this feedback"

3. **ZONE 1 SOLVE** (slider 1 enters correct zone)
   - **Visual:** Slider 1 turns green, becomes locked/un-draggable, or shows "✓"
   - **Audio:** Distinct "solve" chime for slider 1 (e.g., ascending 3-note ding)
   - **Marquee:** Maybe updates to show progress "1 / 3" or stays silent
   - **Visualizer:** Reacts to solve (flash, specific pattern, or calms down)
   - Player feels: "I got one!"

4. **ZONE 2 & 3 EXPLORATION** (player tries remaining sliders)
   - Same feedback loop as zone 1 exploration
   - Player can tackle them in any order
   - No penalty for wrong zones (feedback is encouraging, not punishing)

5. **ALL THREE LOCKED** (final slider solved)
   - **Audio:** Full completion fanfare (orchestral sting, ascending tones, or satisfying chord)
   - **Visual:** Entire visualizer reacts (full spectrum lights up, waveform goes wild, or clears completely)
   - **Marquee:** Updates to show decoded message "COMMAND CENTER" (or whatever the mission is)
   - **Playlist:** Optionally starts playing an unlocked track (auto or manual)

6. **COMPLETION STATE**
   - Show stats: time taken, number of slider adjustments, message revealed
   - Option to "replay" or "next mission"
   - High score saved to localStorage

---

### Flow 2: Returning Player — Mission Selection

**Entry:** Player opens game, has already decoded mission 1

1. **TRANSMISSION MENU**
   - Shows list of available missions
   - Mission 1: ✓ COMPLETE (time: 2:45, best score: 92%)
   - Mission 2: 🔓 UNLOCKED (click to start)
   - Mission 3: 🔒 LOCKED (complete mission 2 first)

2. **SELECT MISSION 2**
   - Game transitions to ACTIVE TRANSMISSION state
   - Sliders reset to neutral
   - Marquee: "MISSION 2"
   - New pattern: different target zones than mission 1
   - Player explores and solves using learned patterns from mission 1

3. **COMPLETE & REPLAY OPTION**
   - After completion, can immediately retry for better score
   - Or move to mission 3
   - Or return to menu

---

### Flow 3: Stuck Player — Giving Up

**Entry:** Player has been adjusting for a while, frustrated

1. **LONG EXPLORATION** (3+ minutes without solving)
   - Marquee could gently offer hint: "Hint: try moving sliders further"
   - Or just continue encouraging feedback

2. **PLAYER WANTS TO QUIT**
   - Press a "reset" or "new mission" button
   - Transition to ABANDONED state
   - Stats show: attempted, never completed
   - Offer "retry this mission" or "try different mission"
   - No penalty, just encouragement

3. **RETRY OR MOVE ON**
   - Fresh slate, same mission pattern
   - OR skip to different mission entirely

---

## Transmission Patterns (by Difficulty)

### Mission 1: "COMMAND" — Easy

**Target pattern:**
```
Slider 170 Hz:   TOP (zone: 70-100)
Slider 600 Hz:   MIDDLE (zone: 33-66)
Slider 3000 Hz:  BOTTOM (zone: 0-33)
```

**Why easy:**
- Clear separation between zones
- No overlapping targets
- Wide zone ranges (±15 from center)
- Message is short: "COMMAND"

**Audio on completion:** 3-note ascending chime (C-E-G major)

---

### Mission 2: "CENTER" — Medium

**Target pattern:**
```
Slider 170 Hz:   MIDDLE (zone: 33-66)
Slider 600 Hz:   TOP (zone: 70-100)
Slider 3000 Hz:  MIDDLE (zone: 33-66)
```

**Why medium:**
- Repeated zones (two sliders need MIDDLE)
- Requires precision to distinguish "which middle"
- Player must use audio/visual cues more carefully
- Message is longer: "CENTER ONLINE"

**Audio on completion:** 4-note chord (C-E-G-C)

---

### Mission 3: "ONLINE" — Hard

**Target pattern:**
```
Slider 170 Hz:   BOTTOM (zone: 0-33)
Slider 600 Hz:   BOTTOM (zone: 0-33)
Slider 3000 Hz:  TOP (zone: 70-100)
```

**Why hard:**
- Two sliders in same zone (BOTTOM)
- Tight zone ranges (±10 from center)
- Player must distinguish audio feedback for similar zones
- Requires understanding the feedback language deeply
- Message is longest: "MISSION STATUS NOMINAL"

**Audio on completion:** 5-note ascending scale

---

### Mission 4 (Secret): "EASTER EGG" — Variable

**Target pattern:**
```
Slider 170 Hz:   TOP (zone: 66-100)
Slider 600 Hz:   MIDDLE (zone: 40-60) [tight]
Slider 3000 Hz:  BOTTOM (zone: 0-34)
```

**Why secret:**
- Hidden in the UI (not listed in menu)
- Maybe unlocked after completing 3 missions
- Or triggered by specific button combo (e.g., press Shuffle + Repeat)
- Message is playful: "YOU FOUND ME" or "NICE WORK"

---

## Audio/Visual Feedback Language

**These are the "signals" that communicate game state to the player.**

### Visual Indicators

#### Slider Zones (Before Solving)
| State | Visual | Meaning |
|-------|--------|---------|
| **Far from zone** | Grey/dim slider area | "You're not close" |
| **Approaching zone** | Orange glow around slider band | "Getting warmer" |
| **Very close** | Yellow/bright glow | "Almost there" |
| **In zone** | Green highlight | "This is it!" |
| **Solved/Locked** | Green + lock icon or dimmed | "This is locked in" |

#### Visualizer Feedback
| State | Visual | Meaning |
|-------|--------|---------|
| **Idle** | Flat/quiet waveform | Waiting for input |
| **Slider moving** | Waveform responds to movement | Acknowledge player input |
| **Zone 1 correct** | First band of spectrum lights up green | Slider 1 is good |
| **Zone 2 correct** | Second band lights up | Slider 2 is good |
| **Zone 3 correct** | Third band lights up | Slider 3 is good |
| **All zones correct** | Entire spectrum erupts/glows | COMPLETE! |

#### Marquee/Title Bar
| State | Text | Meaning |
|-------|------|---------|
| **Starting** | "MISSION 1" | Mission ID |
| **Exploring** | (stays silent or cycles through hints) | Don't overload |
| **Zone solved** | "1 / 3 COMPLETE" | Show progress |
| **All solved** | "COMMAND CENTER DECODED" | Success message |

### Audio Indicators

#### Proximity Tones (for each slider)
- **Far from zone:** Low beep (200 Hz tone, brief)
- **Approaching:** Medium beep (400 Hz)
- **Close:** Higher beep (600 Hz)
- **In zone:** Sustained tone (800 Hz, 0.5s hold)
- **Slider locked:** Ascending 3-note chime (unique per slider)

#### Examples by Slider:
```
Slider 170 Hz:   Lower register (200-400 Hz beeps)
Slider 600 Hz:   Mid register (400-700 Hz beeps)
Slider 3000 Hz:  Higher register (800-1200 Hz beeps)
```

#### Completion Sounds
```
Zone 1 solved:  Single ascending note (0.3s)
Zone 2 solved:  Two ascending notes (0.5s)
Zone 3 solved:  Fanfare (orchestral sting or 4-5 note chord, 1-2s)
All complete:   Full completion theme (2-3s)
```

#### Hints / Encouragement (passive)
- If player is idle for 30+ seconds: soft ambient tone (not annoying, just present)
- If player keeps trying same wrong zone: gentle "try something different" tone (subtle, encouraging)

---

## State Transitions & Triggers

### Active Transmission → Solve Check
**Trigger:** Player adjusts any EQ slider

```
Current slider value → Compare to target zone
  ├─ In zone → Mark as "approaching" (orange glow + mid tone)
  ├─ Enters zone → Mark as "solved" (green + chime)
  └─ Out of zone → Mark as "far" (grey)

Every 100ms: Check if all sliders solved
  ├─ Yes → Trigger TRANSMISSION COMPLETE
  └─ No → Continue listening
```

### Transmission Complete → Fanfare
**Trigger:** All three sliders in correct zones simultaneously

```
1. Play completion fanfare (audio)
2. Light up entire visualizer (visual)
3. Unlock track (if transmission has one)
4. Marquee shows decoded message
5. Transition to COMPLETION STATE after 2-3s
```

### Player Resets/Abandons
**Trigger:** Player clicks "Reset" button or navigates away

```
Sliders unlock → Return to neutral positions
Solved sliders → Reset to unsolved state
Marquee → Clear or show "MISSION X RESET"
Audio → Soft reset tone (not jarring)
Transition to → ACTIVE TRANSMISSION (ready to retry)
```

---

## Game Progression & Unlocking

### Linear Progression (Default)
```
Mission 1 (COMMAND)
    ↓ (on complete)
Mission 2 (CENTER) [unlocked]
    ↓
Mission 3 (ONLINE) [unlocked]
    ↓
Mission 4 (SECRET) [unlocked]
    ↓
Leaderboard / Replay mode
```

### Unlocking Strategy
- **Mission 1:** Always available at start
- **Mission 2:** Unlocks after Mission 1 completion
- **Mission 3:** Unlocks after Mission 2 completion
- **Mission 4 (Secret):** Unlocks after all 3 missions OR hidden trigger (button combo, time-played, etc.)

### Leaderboard / Replay
Once all missions unlocked, player can:
- Replay any mission for best score (time-based or accuracy-based)
- See high scores per mission (localStorage)
- Compete with themselves over multiple sessions

---

## Summary: Complete Player Journey

```
Game Start
    ↓
[AUTO-START or MENU SELECTION]
    ↓
Mission 1: COMMAND (Easy)
    ├─ Explore sliders (30s - 2min)
    ├─ Solve all zones (satisfying feedback)
    ├─ Hear fanfare, see decoded message
    └─ Complete (save score: time taken)
    ↓
[OFFER NEXT MISSION or REPLAY]
    ↓
Mission 2: CENTER (Medium)
    ├─ Apply learned patterns (2-4min)
    ├─ Discover repeated zones (MIDDLE x2)
    ├─ Tighter feedback precision required
    └─ Complete (faster than mission 1 expected)
    ↓
Mission 3: ONLINE (Hard)
    ├─ Real puzzle now (4-6min)
    ├─ Two sliders in same zone (harder to distinguish)
    ├─ Must listen carefully to audio cues
    └─ Complete (sense of accomplishment)
    ↓
[MISSION 4 UNLOCKED - SECRET]
    ├─ Player discovers it or finds unlock trigger
    ├─ Easter egg message or reward
    └─ Feels like hidden bonus
    ↓
[LEADERBOARD / REPLAY MODE]
    ├─ Chase better scores on any mission
    ├─ Share high scores
    └─ Long-term engagement
```

---

## Notes for Implementation

- **localStorage:** Track `{ missionId, completed, timeTaken, attempts, bestTime }`
- **Feedback timing:** Make beeps/tones responsive (< 100ms latency) so they feel immediate
- **No fail state:** Player never "loses," just keeps trying or moves on
- **Accessibility:** Ensure audio feedback has visual equivalent (critical for deaf players)
- **Mobile:** Test slider dragging on touch devices (might need wider touch targets)

---

## Relationship to the current build

What exists today (`packages/signal-tuner`, see `docs/webamp-adapter.md` for
the technical side) is a narrower slice of this flow — one transmission,
proximity-free, no menu. Mapping this doc's ideas onto it:

| This doc | Current build |
| --- | --- |
| 3 sliders, each with a target **zone** (e.g. TOP/MIDDLE/BOTTOM), proximity feedback as you approach | 1 slider (band `600`), 8 sequential **word bands** across its full 0–800 range, binary decode (in a band or not) — no "getting warmer" feedback |
| Per-slider register + rising pitch as you approach a zone | Single fixed 880Hz beep on decode, no proximity tone |
| Slider visually glows grey → orange → yellow → green, locks on solve | No visual state on the slider itself; decoded word only shows in the marquee |
| Mission menu, linear unlock, replay/best-score | Single transmission auto-runs on page load, no menu |
| Secret mission via button combo (e.g. Shuffle + Repeat) | Undecided — `webamp-adapter.md`'s "Buttons / toggle switches" section flags Shuffle/Repeat as available but unassigned; this doc is effectively the design decision for what they'd trigger |
| `localStorage` schema: `{ missionId, completed, timeTaken, attempts, bestTime }` | Explicitly deferred (see `CLAUDE.md`'s decisions list) |
| Abandon/reset flow | Not modeled — no "give up" path exists yet |

None of this contradicts the existing roadmap — `CLAUDE.md`'s Phase 2+ line
("more transmissions at varying difficulty... richer audio... visual
polish... signal-strength meter") is this doc, just less specified. Ranked
by effort if picking pieces up:

1. **Proximity audio feedback on the existing single-slider flow** — cheapest,
   biggest feel improvement, and doesn't require multiple transmissions or
   zones. `SignalTunerGame` already gets every frequency change; scaling a
   tone's pitch/volume by distance-to-nearest-band-edge is a small addition
   to `runTransmission.ts`'s existing `createVisualizedTone` wiring, no new
   adapter hooks needed.
2. **Secret transmission via a button combo** — resolves the open question
   in `webamp-adapter.md` directly: `webamp.isShuffleEnabled()` +
   `webamp.isRepeatEnabled()` (or a combo of both true) as the trigger,
   `runTransmission()` already accepts any transmission/band pair.
3. **Slider zone glow (grey/orange/yellow/green)** — needs either a custom
   skin element or a color-mapped patch over the slider's track, closer to
   Phase 1 skin work than a pure-code change.
4. **Multiple missions + menu + localStorage scores** — the big one; depends
   on deciding the zone-based multi-slider mechanic vs. the current
   word-band mechanic first, since the menu/score schema differ depending on
   which encoding wins.

