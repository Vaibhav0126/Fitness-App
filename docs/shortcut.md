# iOS Shortcut: send Apple Health metrics to Train every morning

A free Shortcut, run by a Personal Automation, reads last night's sleep, HRV, resting heart rate and yesterday's steps and active energy from Apple Health, then POSTs them to Train. It needs no paid app.

Shortcuts' **Find Health Samples** has no Workouts type, so this sends **daily metrics only**. Workouts come from Hevy, Health Auto Export, file uploads or the Apple Health export.

> Action names below are from Shortcuts on iOS 18–27 (Apple's Shortcuts User Guide, checked 2026-11-27). Menus move between iOS versions; if something is named slightly differently, look for the closest match. The endpoint contract is fixed and tested.

## 1. Create an upload token

1. In Train, open **Settings → Connections → Upload tokens**.
2. Name it (e.g. "iPhone Shortcut") and tap **Create token**.
3. **Copy it now.** Train stores only a hash, so it can't show the token again. If you lose it, revoke it and make a new one.
4. Copy the **iOS Shortcut** endpoint shown above the list: `https://<your-app>/api/ingest/shortcut`.

## 2. The request Train expects

```http
POST /api/ingest/shortcut
Authorization: Bearer trn_…your token…
Content-Type: application/json
```

```json
{
  "v": 1,
  "tz": "Asia/Tokyo",
  "days": [
    { "date": "2026-11-27", "sleepHours": 7.2, "hrvSdnnMs": 48, "restingHr": 56, "weightKg": 80.1 },
    { "date": "2026-11-26", "steps": 10432, "activeEnergyKcal": 640 }
  ]
}
```

| Field              | Required | Meaning                                                                          |
| ------------------ | -------- | -------------------------------------------------------------------------------- |
| `v`                | yes      | Payload version. Always `1`.                                                     |
| `tz`               | no       | IANA time zone. Defaults to your Train profile's zone. Only used to check dates. |
| `days`             | yes      | 1–14 objects, one per local date.                                                |
| `date`             | yes      | `YYYY-MM-DD` in your time zone. Sleep belongs to the date you **woke up**.       |
| `sleepHours`       | no       | Hours asleep (0–24). Minutes or seconds are converted automatically (see below). |
| `hrvSdnnMs`        | no       | HRV (SDNN) in ms, e.g. the average of last night's readings.                     |
| `restingHr`        | no       | Resting heart rate, bpm.                                                         |
| `steps`            | no       | Step count for that day.                                                         |
| `activeEnergyKcal` | no       | Active energy, kcal.                                                             |
| `walkingHrAvg`     | no       | Walking heart rate average, bpm.                                                 |
| `vo2max`           | no       | VO2 max, ml/kg/min.                                                              |
| `weightKg`         | no       | Body weight, kg.                                                                 |

Rules:

- **Loose values are fine.** Values can be numbers or text: `7.2`, `"7,2"`, `"48 ms"` and `"10,432"` all work.
- **Empty or 0 means "no sample".** An empty value is skipped. So is `0`, because Shortcuts returns 0 when Health couldn't be read, and a 0 must never overwrite a real value.
- **Re-sending is safe.** Sending the same day again changes nothing. Changed values replace the stored ones. You can run the Shortcut as often as you like, up to **60 requests an hour per token**.
- **Sleep units are converted.** If `sleepHours` is over 24 it's read as minutes; over 1,440 it's read as seconds. A Shortcut that sums sample durations therefore works whichever unit your iOS version returns.
- **Date limits.** Dates more than 60 days old, or more than a day in the future, are skipped. The response lists them under `skipped`.
- **Response.** `200 {"ok":true,"received":5,"counts":{…},"skipped":[]}`. A request with no values still gets 200, plus a `warning`. Errors return 400 (bad payload), 401 (bad or revoked token), 403 (demo or unverified account), 413 (body over 64 KB) or 429 (rate limit, with `Retry-After`).

Test it from a computer before you build the Shortcut:

```sh
curl -sS https://<your-app>/api/ingest/shortcut \
  -H "Authorization: Bearer $TRAIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"v":1,"days":[{"date":"2026-11-27","sleepHours":7.2,"restingHr":56}]}'
```

## 3. Build the Shortcut

Open **Shortcuts → + (new shortcut)** and name it **Send to Train**. Add the actions below in order. Text in _italics_ is a variable you pick from the variable bar. Long-press an action's output and choose **Rename** to give it the name shown.

### Dates

1. **Date**: Current Date.
2. **Format Date**: _Date_, Date Format **Custom**, `yyyy-MM-dd`. Rename the output to **Today**.
3. **Adjust Date**: subtract **1 day** from _Date_.
4. **Format Date**: _Adjusted Date_, Custom, `yyyy-MM-dd`. Rename to **Yesterday**.

### Last night's sleep → `sleepHours` (attributed to Today)

5. **Find Health Samples** where:
   - Type **is** Sleep
   - Start Date **is in the last** 18 hours
   - Value **is not** In Bed
   - Value **is not** Awake
   - Optional: add **Source is** _your Apple Watch_ if both your iPhone and Watch record sleep. Otherwise the stages overlap and the total doubles.
6. **Get Details of Health Samples**: **Duration** of _Health Samples_.
7. **Calculate Statistics**: **Sum** of _Details of Health Samples_. Rename to **Sleep**.

The sum is a number of hours, minutes or seconds depending on your iOS version. Train converts it, so you don't need **Convert Measurement**.

### HRV, resting heart rate, weight (attributed to Today)

8. **Find Health Samples**: Type **is** Heart Rate Variability, Start Date **is in the last** 12 hours.
9. **Calculate Statistics**: **Average** of _Health Samples_. Rename to **HRV**.
10. **Find Health Samples**: Type **is** Resting Heart Rate, Start Date **is in the last** 2 days. Sort by **Start Date**, Order **Latest First**, Limit **1**.
11. **Calculate Statistics**: **Average** of _Health Samples_. Rename to **Resting HR**. (The average of one sample is that sample, and it avoids a separate "get value" step.)
12. Optional, body weight: **Find Health Samples** with Type **is** Weight (Body Mass), Start Date **is in the last** 3 days, Latest First, Limit 1. Then **Calculate Statistics**: Average, renamed to **Weight**. If Health shows your weight in **lb**, add **Calculate**: _Weight_ × 0.4536.

### Yesterday's steps and active energy (attributed to Yesterday)

13. **Find Health Samples**: Type **is** Steps, Start Date **is** _Yesterday_ (or "is in the last 1 day" if the date filter isn't offered), **Group By: Day**.
    Group By makes Health de-duplicate iPhone and Watch steps, the way the Health app does. Summing raw samples counts them twice.
14. **Calculate Statistics**: **Sum** of _Health Samples_. Rename to **Steps**.
15. Repeat steps 13–14 for Type **Active Energy**. Rename the result to **Energy**.

### Build the request

16. **Dictionary**, renamed to **Today values**:
    - `date` (Text): _Today_
    - `sleepHours` (Number): _Sleep_
    - `hrvSdnnMs` (Number): _HRV_
    - `restingHr` (Number): _Resting HR_
    - `weightKg` (Number): _Weight_ (omit if you skipped step 12)
17. **Dictionary**, renamed to **Yesterday values**:
    - `date` (Text): _Yesterday_
    - `steps` (Number): _Steps_
    - `activeEnergyKcal` (Number): _Energy_
18. **Get Contents of URL**:
    - URL: your endpoint, `https://<your-app>/api/ingest/shortcut`
    - Method: **POST**
    - Headers:
      - `Authorization`: `Bearer trn_…` (your token, with the word Bearer and a space)
      - `Content-Type`: `application/json`
    - Request Body: **JSON**
      - `v` (Number): `1`
      - `tz` (Text): your time zone, e.g. `Asia/Tokyo` (optional)
      - `days` (Array) with two items: _Today values_ and _Yesterday values_ (each item typed **Dictionary**)
19. Optional: **Get Dictionary Value** `received` from _Contents of URL_ → **Show Notification** "Train: _Dictionary Value_ values sent". Leave this out once it works, so the automation stays silent.

Tap ▶︎ to run it once. Shortcuts asks for permission to read each Health type and to connect to your domain. Allow all of them. Then open **Today** in Train: the readiness card should show last night's values.

## 4. Run it every morning (Personal Automation)

iOS encrypts Health data while the iPhone is locked. A run before you've unlocked the phone reads nothing; Train then gets empty values and ignores them. Pick a trigger for when the phone is usually unlocked, and add a second one as a safety net:

1. **Shortcuts → Automation → + → Time of Day**: e.g. **08:30**, **Daily**. Choose **Run Immediately** and turn **Notify When Run** off. Pick **Send to Train**.
2. Optional: **Alarm → Is Stopped** (your wake-up alarm), with Run Immediately. This fires right after you stop the alarm, so it works best if you unlock the phone straight away. Otherwise the 08:30 run fills the gap.
   Keep both triggers in the morning. The sleep step looks back 18 hours, so an evening run would see only part of the night and replace the full value. Steps and energy are sent for **yesterday**, which is already complete by morning.

With both triggers, a run that hits a locked phone is filled in by the other one. Train ignores the empty values from the locked run.

## Troubleshooting

| Symptom                                  | Fix                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `401 Invalid or revoked token`           | Check the header is exactly `Authorization` = `Bearer <token>`. Make a new token if you lost the old one.                 |
| `200` with `"received": 0` and a warning | The phone was locked, or Health permissions are off: Settings → Health → Data Access & Devices → Shortcuts → turn all on. |
| Sleep twice as long as expected          | iPhone and Watch both recorded sleep. Add a **Source** filter to step 5.                                                  |
| Steps doubled                            | Add **Group By: Day** to step 13.                                                                                         |
| `429`                                    | More than 60 runs in an hour. Wait for `Retry-After` seconds.                                                             |
| Values in `skipped` with "out of range"  | A unit mix-up, e.g. weight in lb or energy in kJ. Convert in the Shortcut before sending.                                 |

Lost phone? **Settings → Connections → Revoke** stops the token immediately.
