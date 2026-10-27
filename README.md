# LiftLog: workout, weight & diet tracker

A Gravl-style tracker built from the *Gym Workout Tracker (4-Day)* template: Push, Pull, Legs + Core and an optional Bonus day, run as 4-week cycles.

It's a plain HTML/CSS/JS web app with no build step and no account. Your data stays on your device (browser `localStorage`).

## Features

- **Today**: your next workout in the rotation, where you are in the 4-week cycle (with that week's progression note), a this-week tracker, quick bodyweight entry, calories/macros and water.
- **Train**: start any day and log each set (weight × reps) as you go.
  - Shows what you did last time, plus a **progression suggestion** that follows the template's rule: hit the top of the rep range on every set → add the smallest increment; otherwise keep the weight and add reps.
  - Tap ✓ to finish a set. Any empty box is filled in from the suggestion.
  - The **rest timer** starts on its own: 2½ min for compound lifts, 90 s for the rest (you can change both).
  - Swap an exercise (using the template's swap list), add/remove sets or exercises, and save machine settings.
  - The session wrap-up has notes, "next time" choices, effort (1–5) and pain/form notes.
  - Flags PRs, based on estimated 1-rep max.
- **Diet** (MyFitnessPal-style food diary):
  - Search a built-in database of ~200 common foods, with calories and macros from USDA averages and real serving sizes. Log by servings, grams or ounces.
  - Search **Open Food Facts** online for branded and packaged foods, or **scan a barcode** with your camera (or type the barcode number).
  - The **My foods** tab holds custom foods you create or save; **Recent** shows foods you've logged; one-tap **+** adds a food at your last amount.
  - **Save meal** stores a whole meal so you can re-add it in one tap. You can also use **Quick add** for calories only, or copy yesterday's food.
  - Shows Goal − Food = Remaining, macro bars, water, and a 7-day calorie chart with averages.
  - A **calorie & macro calculator** (Plan tab) sets your goals from your age, height, weight, activity and goal.
- **Body**: log weight, waist and body fat %, with a trend chart, 7-day average and goal line.
- **Progress**: a calendar of the days you trained, weighed in and logged food; strength charts for each exercise; and your full workout history (open, edit, repeat or delete any workout).
- **Plan**: the weekly schedule, an editable workout menu, how-to and progression notes, exercise swaps, baseline weights/machine settings, goals and settings, plus JSON backup/restore and a CSV export.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

### On your phone

Host the folder anywhere static. The easiest option is **GitHub Pages**: in the repo, go to *Settings → Pages* and deploy from the branch root. Open the URL on your phone and choose **Add to Home Screen**. It then runs full-screen and works offline.

> Data is stored per browser and per device. Use **Plan → Your data → Export backup** regularly, and **Import backup** to move your data to another device.
