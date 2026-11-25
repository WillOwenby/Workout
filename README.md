# LiftLog: workout, weight & diet tracker

A Gravl-style tracker built from the *Gym Workout Tracker (4-Day)* template: Push, Pull, Legs + Core and an optional Bonus day, run as 4-week cycles.

It's a plain HTML/CSS/JS web app with no build step and no account. Your data stays on your device (browser `localStorage`).

## Features

- **Today**: your next workout in the rotation, where you are in the 4-week cycle (with that week's progression note), a this-week tracker, quick bodyweight entry, calories/macros and water.
- **Train**: start any day and log each set (weight × reps) as you go.
  - Shows what you did last time and suggests your next weights and reps with **progressive overload**:
    - **Double progression:** add reps until you hit the top of the range on every set, then add weight. With 3+ reps to spare on the one-tap effort check, it adds two jumps.
    - **Weight jump for each exercise:** big lower-body lifts default to double the base jump. Change any exercise from its ⋯ menu.
    - **Your "Next time" choices** (increase weight / add reps / keep weights) override the automatic rule.
    - **Stalls:** after 3 sessions without progress, a **Lighter restart (−10%)** button appears.
    - **Back-off:** if reps fall below the range two sessions in a row, it suggests dropping about 7.5%.
    - **Optional lighter Week 4:** about 90% weight and one less set.
    - **Status tags** on each exercise: ↑ Progressing, → Holding, ⚠ Stalled, ↓ Back off.
    - **Weekly effort target** (reps in reserve: 3, 2, 1 across the 4-week cycle) on every exercise. The one-tap effort check is compared with it: more reps left than targeted means a bigger jump or +2 reps.
    - **Rep schemes picked from a dropdown** in the plan editor: ranges (8–12…), the same reps every set (5-5-5…), or pyramids and waves (10/8/6, 3/2/1). Each has its own progression rule.
    - **Weekly rotating pyramids are the default:** big lifts go 12/10/8 → 10/8/6 → 8/6/4 across Weeks 1–3 (Week 4 repeats Week 1). Smaller lifts go 15/12/10 → 12/10/8 → 10/8/6. Each pyramid's weights come from the last time you ran that same pyramid: hit every set and the next one adds a jump to each set. A pyramid you haven't done yet is estimated from your recent sets. Plank and cardio keep their time/minute targets.
    - **Form cues:** tap an exercise name to show two short pointers.
    - **Warm-up ramp** (about 50% × 8, 70% × 5, 85% × 2) on the first big lift of each workout.
  - Tap ✓ to finish a set. Any empty box is filled in from the suggestion.
  - The **rest timer** starts on its own: 2½ min for compound lifts, 90 s for the rest (you can change both).
  - **Switch exercises in one tap:** each exercise has a dropdown with its **top 3 alternatives** (for example bench press → dumbbell bench, machine chest press, Smith bench), each showing your last result. The alternative you used last time is marked.
  - **Quick exercise search** (~90 exercises, filterable by muscle group) for adding or switching an exercise. Anything else can be typed as a custom exercise.
  - Every exercise and alternative keeps **its own history**: previous sets, progression suggestions, PRs, machine settings and weight jump. Switching keeps the slot's sets and rep range.
  - The session wrap-up has notes, "next time" choices, effort (1–5) and pain/form notes.
  - Flags PRs, based on estimated 1-rep max.
- **Diet** (MyFitnessPal-style food diary):
  - Search a built-in database of ~200 common foods, with calories and macros from USDA averages and real serving sizes. Log by servings, grams or ounces.
  - Searching also checks two online databases automatically as you type: **USDA FoodData Central** (~400k US branded foods from manufacturer label data) and **Open Food Facts**. You can also **scan a barcode** with your camera, or type the barcode number.
  - The shared USDA demo key allows about 30 searches an hour. For more, get a free key at https://fdc.nal.usda.gov/api-key-signup and paste it into **Plan → Settings**.
  - The **My foods** tab holds custom foods you create or save; **Recent** shows foods you've logged; one-tap **+** adds a food at your last amount.
  - **Save meal** stores a whole meal so you can re-add it in one tap. You can also use **Quick add** for calories only, or copy yesterday's food.
  - Shows Goal − Food = Remaining, macro bars, water, and a 7-day calorie chart with averages.
  - A **calorie & macro calculator** (Plan tab) sets your goals from your age, height, weight, activity and goal.
- **Body**: log weight, waist and body fat %, with a trend chart, 7-day average and goal line.
- **Progress**: a calendar of the days you trained, weighed in and logged food; strength charts for each exercise; and your full workout history (open, edit, repeat or delete any workout).
- **Plan**: the weekly schedule, an editable workout menu, how-to and progression notes, exercise swaps, baseline weights/machine settings, goals and settings, plus JSON backup/restore and a CSV export.

## Coach features

- **Weekly check-in** (Today): once you have about 2 weeks of food logs and weigh-ins, the app estimates your real maintenance calories from your weight trend and what you ate. It then suggests a new calorie and macro goal for your target rate, changing by at most 250 kcal a week. Tap **Apply** or **Not now**.
- **Workout summary** after finishing: PRs, lifts that went up, volume compared with last time, and one focus for next time (for example, try an alternative for a stalled lift).
- **"How do you feel?"** in the workout header: *Rough* keeps last time's weights and adds a rep in reserve, while *Great* allows two jumps on lifts you nailed.
- **Protein ideas** in Diet when you're 20+ g short later in the day. Tap to add.
- **Sets per muscle** this week (and last week) in Progress, plus which planned muscles you haven't trained yet.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

### On your phone

Host the folder anywhere static. The easiest option is **GitHub Pages**: in the repo, go to *Settings → Pages* and deploy from the branch root. Open the URL on your phone and choose **Add to Home Screen**. It then runs full-screen and works offline.

> Data is stored per browser and per device. Use **Plan → Your data → Export backup** regularly, and **Import backup** to move your data to another device.
