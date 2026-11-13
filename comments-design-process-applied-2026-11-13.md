# Collaborative by Design (design-process) — Review Comments Applied

**Date:** 13 November 2026  
**Source comments:** `c:\Users\atulv\Downloads\comments-design-process-2026-11-12.md`  
**File edited:** `projects/design-process.json`  
**Branch:** `editor-preview`  

---

## 1. What was changed and applied

### Overview
- **Comment 2: [cb028p, cb029p, cb030p] Anchor links to direction sections**
  - Added internal section links to the three direction preview cards so clicking them jumps directly to their corresponding section:
    - `cb028p` (`commons-home.jpg`) &rarr; links to `#sec-cc229t` (**NID Commons**)
    - `cb029p` (`game-components.jpg`) &rarr; links to `#sec-cc244t` (**Empathy Game**)
    - `cb030p` (`mediator-storyboard-2.jpg`) &rarr; links to `#sec-cc263t` (**Flow Mediator**)

### Insights & Goals
- **Comment 4: [cc158t, cc159t, cc160t, cc163t, cc166t, cc169t, cc172t, cc175t] Yellow highlight for Core Insights**
  - Added `color: "accent"` (`#ebb800` yellow) to the section heading and the 6 core insight headers:
    - `cc158t` ("insights") & `cc159t` ("Core insights")
    - `cc160t` ("Expression is fluid and situational.")
    - `cc163t` ("Visibility is not the same as participation.")
    - `cc166t` ("Collaboration styles are asymmetric.")
    - `cc169t` ("Feedback timing matters.")
    - `cc172t` ("Quietness can be misread.")
    - `cc175t` ("Future learning needs adaptive collaboration.")
- **Comment 5: [cc184t, cc187t, cc190t, cc193t, cc196t] Yellow highlight for Design Goals**
  - Added `color: "accent"` to the 5 design goals:
    - `cc184t` ("Promote empathy across expression styles")
    - `cc187t` ("Enable balanced collaboration")
    - `cc190t` ("Make invisible participation visible")
    - `cc193t` ("Recognise diverse contributions")
    - `cc196t` ("Support growth across learner archetypes")

### Process
- **Comment 6: [cc228p] Disable zoom on concept scoring matrix**
  - Removed `zoom: true` from `cc228p` (`concept-scoring.jpg`).
  - Cleaned up the caption from *"Every concept, scored. Click to enlarge."* &rarr; *"Every concept, scored."*

### Flow Mediator
- **Comment 7: [cc273p] Wizard of Oz video**
  - Converted `cc273p` from a static image to an embedded Google Drive video player (`type: "embed"`).
  - Embedded drive link: `https://drive.google.com/file/d/14Yxf1g1hjmxKabPtfHULwd1U-ddwLFFM/view?usp=sharing`.
  - Updated caption to **"WoZ prototype"** with `capShow: true`.

---

## 2. What was left for Atul / Claude (and what is needed)

### Comment 1: [cb026t, cb027t] — Project overview explanation
- **Comment note:** *"also needs to explain what this project is even about? currently quite mediocre, and confusing to jump into this. context also does not explain much."*
- **Why left:** Under `AGENTS.md`, writing new case-study copy from scratch is left for Atul or Claude to draft.
- **What is needed from Atul:** Approve or tweak a clearer framing sentence for `cb027t`.
  - **DRAFT option A (Concise):**
    > *"At NID, group projects often falter when quieter, reflective students are overshadowed by vocal participants. Across a two-week sprint, we investigated how different expression styles shape teamwork, prototyping three interventions for 2030: a shared digital workspace, an empathy-building card game, and an ambient AI mediator."*
  - **DRAFT option B (Direct):**
    > *"A speculative design project exploring how different modes of expression shape collaborative learning. To make teamwork more inclusive at NID by 2030, we explored three directions: a digital platform, a physical game, and an AI-based mediator."*

### Comment 3: [cb028p, cb029p, cb030p] — Elaborate direction card captions
- **Comment note:** *"need to elaborate a little bit more"*
- **Why left:** Needs Atul's preferred level of detail for the captions.
- **What is needed from Atul:** Check if you want to expand the existing one-line captions to these drafts:
  - **DRAFT `cb028p`:** *"NID Commons: a decentralised digital platform connecting student projects, skill sharing, and spontaneous peer feedback."*
  - **DRAFT `cb029p`:** *"Empathy Game: a physical card-and-token game played before group work to surface differing communication styles and build mutual trust."*
  - **DRAFT `cb030p`:** *"Flow Mediator: an ambient AI tool that observes group rhythm, flagging imbalance and prompting reflective pauses without interrupting discussion."*

### Comment 8: [empty space @ 54, 15286] — Reflection section
- **Comment note:** *"need to highlight insights, make it easier to glance through the project"*
- **Status:** The core insights and design goals are highlighted in yellow (Comments 4 & 5). If you also want a bulleted takeaway list or visual callout in the Reflection section at the bottom, let Claude or me know what points you'd like included.
