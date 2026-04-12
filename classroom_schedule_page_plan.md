# Classroom Schedule Page Plan

## Purpose

Build a simple classroom schedule page that feels easy and friendly for teachers, parents, and children. The page should not feel like software made for developers. It should feel more like a calm classroom tool: clear, visual, forgiving, and easy to understand at a glance.

This page is replacing the need to build daily schedules as slide decks. Instead of manually clicking through slides or updating static visuals, the page will show the current part of the day automatically and provide a live timer, a visual progress view of the day, and simple teacher controls.

---

## Guiding Principles

### 1. Extremely approachable
The page should work well for people who:
- do not know how to code
- do not want to configure complicated settings
- may be using a classroom computer, tablet, or TV
- need something understandable in seconds

### 2. Calm and classroom-friendly
The design should feel:
- welcoming
- simple
- visually clear
- low-stress
- suitable for young children

Avoid anything that feels overly technical, cluttered, or “dashboard-heavy.”

### 3. Teacher-first, child-visible
The main screen should be useful for students to look at, but also easy for a teacher to control quickly when needed.

### 4. Flexible but not overwhelming
The tool should support different daily schedules, but the setup should remain simple. Good defaults matter more than endless options.

---

## Core User Types

### Teachers
Teachers need to:
- build a daily schedule
- set start and end times
- show the current activity automatically
- use a timer
- quickly jump to another activity
- make changes without stress

### Parents
Parents may use the page to:
- understand the classroom routine
- follow a home schedule version
- review what comes next in the day

### Children
Children should be able to:
- glance at the screen and know what is happening now
- see what comes next
- understand the day’s flow through simple visuals and colors

---

## Main Goals

1. Show the current activity clearly
2. Automatically follow the daily schedule based on time
3. Provide a built-in live timer
4. Show progress through the day in a simple, low-profile sidebar
5. Allow manual override without confusion
6. Support portrait and landscape layouts
7. Be editable without coding
8. Feel understandable for first-time users

---

## Main Page Layout

The page should use a simple grid layout so it can switch between landscape and portrait without needing a redesign.

### Primary sections

#### 1. Header
Displays:
- current activity title
- current time range
- optional subtitle or note
- current day

Examples:
- Circle Time
- 7:50 AM – 8:00 AM
- Everybody sit on the rug!
- Thursday

#### 2. Main Content Area
Displays the primary content for the current block.

Depending on block type, this area may show:
- a large image
- a classroom icon
- instructions
- a calming visual
- a rotation layout
- a live full-screen timer

This should be the visual focus of the page.

#### 3. Sidebar
A persistent but low-profile sidebar that serves as:
- a table of contents for the day
- a visual progress rail
- a quick navigation tool

The sidebar should show:
- all schedule blocks
- which block is current
- which blocks are complete
- which block is next
- overall progress through the day

#### 4. Footer / Control Area
A simple area for timer and controls.

This may include:
- time remaining
- pause timer
- add 1 minute
- add 5 minutes
- next block
- previous block
- return to live schedule

---

## Sidebar Plan

The sidebar is one of the most important improvements over slides.

### What it should do
- stay visible without being distracting
- show the day as a sequence of blocks
- highlight the current block
- show completed blocks differently from future blocks
- allow clicking/tapping to jump to a block
- provide a subtle sense of progress through the day

### Sidebar item states
Each item should show one of these states:
- Completed
- Current
- Next
- Upcoming

### Sidebar content per item
Each item can show:
- title
- start/end time
- optional icon
- optional color marker

### Progress behavior
The current item should have a small live fill or progress indicator showing how far through the current block the class is.

### Overall day progress
At the bottom of the sidebar, include a subtle overall progress bar for the whole day.

### Portrait behavior
In portrait mode, the sidebar should:
- collapse more easily
- remain accessible
- possibly become a top strip or drawer

---

## Built-In Timer Plan

A live timer is one of the biggest advantages over slides.

### Timer functions
- automatically calculate remaining time in current block
- count down live
- update visually in real time
- optionally show a progress ring or bar
- allow manual pause
- allow small time extensions

### Teacher-friendly controls
Teachers should be able to:
- pause the timer
- resume the timer
- add 1 minute
- add 5 minutes
- reset the timer for the current block

### Student-friendly display
Children should be able to understand:
- how much time is left
- when an activity is nearly over

Helpful visual states:
- green = plenty of time
- yellow = almost done
- red = transition soon

These should be soft, not alarming.

---

## Schedule Logic

The schedule should be based on structured blocks rather than hand-built slides.

Each block should include:
- title
- start time
- end time
- optional note
- optional image
- layout type
- whether timer is shown
- optional day restrictions
- optional special label

### Example block types
- Standard activity
- Timer-focused activity
- Split info activity
- Rotation activity
- Transition / restroom / pack-up activity

### Day support
The page should support:
- Monday schedule
- Tuesday schedule
- Wednesday schedule
- Thursday schedule
- Friday schedule

This allows special items like therapy, specials, or modified routines without making separate files manually.

---

## Manual Override Plan

Even with automatic schedule switching, teachers need easy control.

### Manual mode should allow:
- jump to any block
- go to next block
- go to previous block
- pause the live schedule
- return to live schedule

### Important rule
Manual mode must never feel risky.

It should be obvious:
- when the page is following the real clock
- when the page is in manual mode

A simple label like this is enough:
- Live Schedule
- Manual Override Active

And there should always be a visible:
- Return to Live Schedule button

---

## Setup Experience

The setup process should be simple enough for a non-technical teacher.

### Best approach
Use a builder page with a form-based editor, not code.

Teachers should be able to:
- add a schedule block
- enter title
- enter times
- choose image
- add note
- choose layout type
- save

### Strong defaults
The system should make good choices automatically so users do not have to decide everything.

Examples:
- standard layout by default
- timer on by default for timed activities
- calm classroom theme by default
- current day auto-selected

### Helpful actions
- duplicate block
- reorder block
- copy yesterday’s schedule
- copy Monday to all weekdays
- create an early release version

---

## Content Editing

Everything should be editable with plain-language labels.

Avoid labels like:
- JSON
- config
- data schema
- rendering mode

Use labels like:
- Activity Name
- Start Time
- End Time
- Note
- Image
- Show Timer
- Color
- Day of Week

---

## Accessibility and Usability

This page should be easy to use for a wide range of users.

### Important design choices
- large readable text
- high contrast
- simple wording
- large buttons
- easy touch targets
- clear focus states
- limited clutter

### Good child-facing design
- consistent colors
- recognizable icons
- visual rhythm
- not too many competing elements

### Good adult-facing design
- predictable controls
- minimal learning curve
- clear “what happens if I click this?” behavior

---

## Orientation Support

The page should support both:
- Landscape
- Portrait

### Landscape use cases
- classroom display
- TV
- monitor
- projector

### Portrait use cases
- tablet
- vertical display
- mobile preview
- quick teacher editing

### Layout rule
Use the same content blocks in both modes, but rearrange them using grid layout.

This keeps the design simple and maintainable.

---

## Suggested MVP Features

These are the best features for version 1.

### Must-have
- current block display
- automatic switching by time
- live timer
- sidebar with progress through the day
- manual next/back/jump
- return to live schedule
- weekday schedule support
- landscape/portrait layouts

### Nice-to-have
- image upload per block
- notes per block
- rotation layout
- duplicate schedule
- overall day progress bar

### Later features
- sound cues
- drag-and-drop groups
- saved templates
- multiple classrooms
- parent home view
- printable schedule view

---

## Suggested MVP Screen Set

### 1. Display Page
Used in the classroom.

Shows:
- current activity
- image/content
- timer
- sidebar progress
- simple controls

### 2. Builder Page
Used by teacher/admin.

Allows:
- editing schedule blocks
- switching weekdays
- saving schedule
- choosing visuals and notes

### 3. Optional Simple Home Page
A very basic landing page with two choices:
- Open Classroom Display
- Edit Schedule

This makes the tool feel approachable from the first click.

---

## Tone and Visual Style

The page should not feel corporate or technical.

### Desired qualities
- warm
- calm
- cheerful
- clean
- dependable

### Avoid
- tiny control-heavy admin panels
- too many exposed settings
- developer language
- overly flashy animation
- cluttered “smart dashboard” styling

### Good direction
Think:
- classroom routine board
- digital pocket chart
- friendly visual schedule
- simple teacher control panel

---

## Data Model Direction

Internally, the schedule can still be structured cleanly, but users should never need to see that structure.

The system should store:
- schedules by weekday
- blocks within each day
- block display settings
- timer settings
- layout type

But the interface should present this as simple schedule editing, not configuration.

---

## Success Criteria

This page is successful if:

### Teachers can
- set it up without fear
- run it during class without constant attention
- quickly recover from schedule changes

### Parents can
- understand the day’s flow immediately
- use a simplified schedule if needed

### Children can
- see what is happening now
- understand what comes next
- follow the rhythm of the day more independently

---

## Recommended Build Order

### Phase 1: Core display
- build display layout
- add sidebar
- add timer
- add live schedule switching

### Phase 2: Simple editing
- add teacher builder page
- support weekday schedules
- support notes and images

### Phase 3: Special layouts
- add rotation layout
- improve timer modes
- improve portrait mode

### Phase 4: Polish
- templates
- better icons
- accessibility improvements
- optional sounds and transitions

---

## Final Recommendation

Do not try to recreate the slide deck exactly.

Instead, build a simple classroom schedule system that keeps the good parts of the slides:
- visual clarity
- clear routine blocks
- familiar activity structure

Then improve it with what HTML does better:
- live timing
- automatic schedule switching
- sidebar progress
- easy editing
- portrait and landscape support
- teacher-friendly controls

The goal is not “slides on a webpage.”

The goal is:
**a friendly daily schedule tool that feels natural for teachers, parents, and children.**
