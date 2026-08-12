# Coverage evidence ownership: established practice and remaining risks

Date: 2026-08-11

## Question

How conventional is the proposed coverage model?

The model under discussion has four labeled views:

1. coverage of Node-owned deterministic logic, using only the Node Vitest run;
2. coverage of Storybook-owned React controllers, using only the Storybook Chromium run;
3. coverage of Storybook-owned rendered UI, using only the Storybook Chromium run; and
4. combined production reach, using the union of all compatible coverage evidence and remaining
   informational.

Each production source file has exactly one required evidence owner. The owner's per-file
statements, branches, functions, and lines are compared with a reviewed baseline. Execution by a
different suite can contribute to combined production reach, but cannot rescue the owning
contract.

## Conclusion

The approach is not unique in its principles. Separating coverage by test suite, filtering it by
source group, checking coverage at file or class granularity, comparing coverage with a previous
baseline, and also publishing a combined view are all supported or recommended by established
coverage systems.

The exact composition appears bespoke:

- one explicit required test-environment owner for every production module;
- no cross-environment rescue for the owner's verdict;
- an exact per-file four-metric lockfile rather than one percentage floor; and
- human review before both ownership changes and baseline improvements are recorded.

That custom composition is defensible because it closes a real attribution gap left by a merged
percentage. It must not be described as an industry-standard product feature, though. It is a
repository policy assembled from established mechanisms.

## What established tools and projects already do

| Practice | Primary-source precedent | How close it is to this proposal |
| --- | --- | --- |
| Keep coverage distinct by suite or environment | Codecov Flags explicitly group reports by test type such as unit, integration, and UI. It recommends a separate, correctly flagged upload for each report because attaching several flags to one report can produce incorrect results. [Codecov Flags](https://docs.codecov.com/docs/flags) | Close to keeping Node and Storybook evidence distinct. Flags label the producer, but do not by themselves assign each source file one required producer. |
| Filter a status by both evidence producer and source paths | Codecov project statuses can select flags and paths. Codecov Components can define source groups, and a component with both `flag_regexes` and `paths` uses an AND filter. [Codecov status checks](https://docs.codecov.com/do/docs/commit-status), [Codecov Components](https://docs.codecov.com/docs/components) | Very close to "Storybook evidence for UI-owned paths" or "Node evidence for logic-owned paths." The repo's explicit per-file registry is finer-grained than normal path filters. |
| Publish a combined coverage view | Storybook documents merging its report with coverage from other tools, and nyc documents merging unit and integration runs. Google testing guidance says the aggregate view across unit and integration/system sources is important for seeing what automation reaches across the pipeline. [Storybook test-runner](https://github.com/storybookjs/test-runner#3---merging-code-coverage-with-coverage-from-other-tools), [nyc README](https://github.com/istanbuljs/nyc#what-about-nyc-merge), [Google Testing Blog](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html) | Direct precedent for keeping the fourth combined-production view. Google also warns that integration and end-to-end execution can be incidental, which supports not letting the union replace suite-specific evidence. |
| Apply checks per file or class | Vitest supports `thresholds.perFile`, glob-specific thresholds, percentage floors, and maximum uncovered-item counts. JaCoCo can apply limits to each class, source file, or method and can constrain covered ratios or missed counts. Jest similarly supports file/path/glob thresholds and negative maximum-uncovered values. [Vitest coverage config](https://vitest.dev/config/coverage.html#coverage-thresholds), [JaCoCo check goal](https://www.jacoco.org/jacoco/trunk/doc/check-mojo.html), [Jest configuration](https://jestjs.io/docs/configuration#coveragethreshold-object) | Strong precedent for per-file enforcement and checking both ratios and uncovered counts. These tools normally apply configured floors, not a generated exact tuple for every file. |
| Ratchet against prior coverage | Codecov's `target: auto` uses the base or parent commit's coverage as the target. Vitest's `thresholds.autoUpdate` raises configured statement, branch, function, and line thresholds when current coverage improves. [Codecov status checks](https://docs.codecov.com/do/docs/commit-status), [Vitest coverage config](https://vitest.dev/config/coverage.html#coverage-thresholds-autoupdate) | Direct precedent for a no-regression ratchet. The proposed lockfile is stricter because normal verification does not rewrite it, stores exact covered/total values per file, and treats an improvement as a reviewable contract change. |
| Preserve producer identity after merging | coverage.py contexts retain distinct static contexts when data files are combined and can record dynamic contexts per test function. Reports can then be filtered by context. [coverage.py measurement contexts](https://coverage.readthedocs.io/en/latest/contexts.html) | Confirms that "combined" need not mean "provenance discarded." Istanbul-format counters used here do not automatically retain comparable per-test context, so the repo must retain the separate Node and Storybook artifacts itself. |
| Label Storybook coverage as story-only | Storybook states that its UI summary is the statement percentage covered by tested stories, does not include other Vitest tests, and is colored by configurable watermarks. It separately recommends running all Vitest tests for the most complete overall report. [Storybook coverage documentation](https://storybook.js.org/docs/writing-tests/test-coverage) | Direct support for showing Storybook-only and combined percentages as different, clearly labeled facts. It does not make the Storybook watermark an architecture-aware quality gate. |

## What seems custom to this repository

### One required evidence owner per production file

Codecov can intersect suite flags with paths, but its model permits arbitrary overlapping filters.
Vitest projects support different execution configurations, including browser projects, but
coverage configuration is process-wide rather than independently owned by each project.
[Vitest test projects](https://vitest.dev/guide/projects.html#configuration)

The stronger rule here is semantic: `todoModel.js` must be reached by the Node suite because its
natural interface is deterministic logic, while `TodoItem.jsx` must be reached by Storybook because
its natural interface is rendered browser behavior. That is an architecture policy, not a standard
coverage-tool concept.

### Exact four-metric per-file lockfile

Vitest, Jest, and JaCoCo can enforce file-level ratios and missed counts. Vitest can ratchet
thresholds upward automatically. None of the reviewed primary documentation describes a generated
lockfile that records exact covered and total statements, branches, functions, and lines for every
owned file, rejects regressions, and also pauses on improvements for human review.

This does not prove that no other project has built such a system. It means the pattern should be
presented as this repository's stricter composition, not as a built-in or universal industry
practice.

### Coverage ownership as a design pressure

The proposed rule uses ownership classification to expose mixed responsibilities. If deterministic
policy is trapped inside a React component, the component cannot honestly be assigned only to the
Node or Storybook seam. The desired response is to improve the module boundary, not to label the
same mixed module whichever way makes the gate pass.

Coverage tools provide source filters and thresholds, but they do not make this separation-of-
concerns decision for a team.

## Remaining problems and failure modes

### 1. Execution is not assertion quality

Even perfect owner-specific coverage only proves that an owned suite executed the instrumented
item. It cannot prove that the test asserted the right outcome, covered missing behavior that is not
present in the implementation, or used meaningful inputs. Google's coverage guidance explicitly
describes coverage as a lossy, indirect metric and says covered lines or branches are not
necessarily tested correctly. It recommends human review of uncovered code and other techniques
such as mutation testing. [Google Testing Blog](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html)

Consequence: the ownership baseline must remain one protection among behavior assertions, story
plays, accessibility checks, and end-to-end journeys. Its PASS cannot be named "test quality
passed."

### 2. A baseline can preserve an inadequate starting point

A no-regression lockfile guarantees "not less reach than the reviewed baseline," not "sufficient
testing." A weak file can stay weak forever and remain green. Aggregate and owner-specific
percentages make that debt visible, but no-regression alone does not pay it down.

Consequence: baseline review must inspect the actual uncovered statements and branches. New or
changed code may also justify a separate patch-coverage expectation. Codecov distinguishes overall
project coverage from patch coverage for precisely this different question.
[Codecov status checks](https://docs.codecov.com/do/docs/commit-status#patch-status)

### 3. Exactly one owner can be misread as exactly one legitimate test type

An end-to-end journey may validly execute logic and components owned by other suites. A component
integration can reveal defects that direct unit tests cannot. The one-owner rule must mean "one
required source of coverage for this gate," not "only this suite may ever exercise the file."

Consequence: retain the combined production view and allow overlap. Prohibit cross-suite rescue of
the owner verdict, not useful cross-layer testing.

### 4. Misclassification can make the numbers trustworthy but the architecture wrong

A mixed module can be assigned to Storybook and remain well-covered there even though it contains
extractable deterministic policy. Conversely, forcing React lifecycle behavior into Node can create
an artificial harness. Coverage cannot validate the classification rationale.

Consequence: ownership changes need architectural review, and the human documentation needs a
decision rule based on the module's natural interface. The registry should fail closed for new
production files, but its labels should never be edited merely to regain green status.

### 5. Exact baselines create maintenance churn when instrumentation changes

V8 coverage is remapped to source locations. Vitest notes that this remapping is part of its
provider pipeline and that V8 has engine-level limitations. Compiler changes, source-map changes,
dependency upgrades, or refactoring can change the number and identity of statements, functions,
and branches without changing user-visible behavior. [Vitest coverage guide](https://vitest.dev/guide/coverage.html#v8-provider)

Consequence: pin the coverage toolchain, make bulk baseline diffs highly visible, and require
review after tool upgrades. A mass tuple change should not be treated as automatic evidence
improvement.

### 6. Merging is valid only when the inputs describe code compatibly

Storybook warns that merging reports produced by different coverage providers can produce wrong
results because providers can count different executable items. Other systems have the same class
of constraint: coverage.py refuses to combine branch and statement-only data, and requires path
remapping when different runs identify the same source by different filesystem paths.
[Storybook test-runner](https://github.com/storybookjs/test-runner#merging-test-coverage-results-in-wrong-coverage),
[coverage.py messages](https://coverage.readthedocs.io/en/latest/messages.html),
[coverage.py combine](https://coverage.readthedocs.io/en/latest/commands/cmd_combine.html)

Consequence: keep Node and Storybook on the same pinned Vitest coverage provider and source state;
canonicalize file paths; validate compatible statement/function/branch maps before unioning; and
fail if an expected input report is absent. The owner-specific views remain meaningful even if the
optional combined view must be withheld because compatibility cannot be established.

### 7. Partial or stale suite evidence can look current

Codecov's carryforward feature deliberately reuses an older flag when a suite did not run. Its docs
recommend an initial full upload and distinguish carried-forward flags in the UI. Codecov status
configuration also has explicit behaviors for flags whose coverage was not newly uploaded.
[Codecov carryforward flags](https://docs.codecov.com/docs/carryforward-flags),
[Codecov status checks](https://docs.codecov.com/do/docs/commit-status#flag-coverage-not-uploaded-behavior)

Consequence: this repository's local authoritative gate should not carry coverage forward. Every
required owner must produce fresh evidence for the current source revision, with revision/source
identity recorded and checked.

### 8. Browser coverage can be nondeterministic

Async effects, timers, race-dependent rendering, conditional browser capabilities, and skipped or
filtered stories can change which counters are hit. Storybook also states that its UI coverage is
calculated for all stories as a group, not an individual story or subset, so a suite total alone
cannot explain which story supplies a line's evidence.
[Storybook coverage documentation](https://storybook.js.org/docs/writing-tests/test-coverage)

Consequence: keep the existing separate gates for story discovery and execution, make browser
scenarios deterministic, and report the owning suite at file level without claiming attribution to
a particular story. If per-test attribution becomes necessary, that requires additional context or
trace data rather than ordinary aggregate counters.

### 9. Four percentages can still be misunderstood

The change from one unlabeled percentage to four labeled views repairs the source-set and evidence-
producer ambiguity. It does not turn the figures into quality grades. A percentage remains useful
only with its numerator, denominator, source set, producer, and verdict rule visible.

Consequence: every summary should distinguish:

- owner-specific percentage: execution reach from the required environment over that owner's
  production source set;
- owner baseline verdict: exact per-file contract comparison, which gates;
- combined production percentage: union reach from compatible environments over all production
  source, which is informational; and
- behavior verdicts: unit assertions, Storybook plays and accessibility, and end-to-end journeys,
  which gate independently.

## Recommended claim

The defensible developer-facing statement is:

> We use established coverage practices - separate suite evidence, source-set filtering, per-file
> checks, baseline comparison, and a combined production view - in a stricter repository-specific
> ownership contract. Every production module has one required test environment, and only fresh
> coverage from that environment can satisfy its reviewed per-file baseline. The combined
> percentage remains useful for total automation reach, but neither it nor any owner percentage is
> presented as proof of test quality.

