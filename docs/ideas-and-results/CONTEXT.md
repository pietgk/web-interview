# Ideas and Results

How a foggy Idea becomes shared, pointable understanding that a human and an agent can both use later. Spec is one kind of Record, not the name of the path.

## Language

**Idea**:
A thought that is not yet precise enough to use. Size is not part of the definition: an Idea may be as large as what will be implemented or as small as one foggy question in a session. A larger Idea contains smaller ones.
_Avoid_: feature, ticket, requirement, question

**Clarify**:
Making an Idea precise enough to use. Talk, Ask, and Try are Clarifies. Keep is not a Clarify. The set of Clarifies is not closed.
_Avoid_: Job, Grill, mode, Keep

**Show**:
The visual register: pictures instead of a wall of prose. Show is not a Clarify. It rides inside any Clarify and also when there is no Clarify yet. A Drawing is Show.
_Avoid_: mockup, diagram, explainer, HTML page

**Register**:
How an Idea is presented, distinct from the Clarify (why it is presented). Show is a register. A Clarify is not.
_Avoid_: mode, style, skin, Job

**Drawing**:
A picture of an Idea. A Drawing has a Subject and is Live or Look.
_Avoid_: mockup, HTML page, artifact, visualization, board, Medium

**Subject**:
What a Drawing is of. The set of Subjects is not closed. A Subject is not a Clarify. Architecture Subjects use Module, Interface, Depth, and Seam from codebase-design; those words are not defined here.
_Avoid_: type, kind, diagram type, Clarify, Job

**Live**:
A Drawing the human can act on so something happens. Ask and Try need a Live Drawing. Show and Keep do not.
_Avoid_: interactive, executable, clickable

**Look**:
A Drawing that is only seen. Pan and zoom are not Live.
_Avoid_: static, read-only, dead

**Medium**:
What carries a Drawing or a Talk turn. The set of Media is not closed. A Medium is not a Clarify, not a Subject, and not Live; it may supply Live. Medium is not a path step.
_Avoid_: tool, skill, format, Clarify, Job

**Talk**:
The Clarify of settling an Idea in prose when seeing or building would not make the answer more faithful. Grill is how this repo Talks when the Idea is foggy enough to need an interview. Its Result is the answer or decision. Working name.
_Avoid_: grilling, conversation, chat, prose, Tell, Job

**Ask**:
The Clarify of binding a question to a Drawing so the answer is about that picture. Ask is used only when Talk would be unfaithful. Ask needs a Live Drawing. Its Result is the answer, not the page.
_Avoid_: grilling, Lavish, feedback, form, Job

**Try**:
The Clarify of making a Live Drawing you have to drive or compare because the Idea is not judgeable until it is concrete. Try is used only when Talk would be unfaithful. Its Result is the verdict, not the throwaway artifact.
_Avoid_: prototype, demo, experiment, mockup, Job

**Result**:
Shared understanding that a human and an agent can both point at later. A Result is eligible to be Kept into a Place and eligible to be Promoted into a Record. A private "I get it" is not a Result.
_Avoid_: output, deliverable, aha, artifact, Drawing

**Keep**:
Landing a Result in a Place so it can be reopened without the thread. Keep is not a Clarify. The Place may be a Hold or a Record. Keep does not need Live. Keep lands a Result, not a Drawing.
_Avoid_: save, commit, capture, whiteboard, promote, Drawing

**Place**:
Where a Result lives so it can be reopened without the thread. A Place is a Hold or a Record.
_Avoid_: location, destination, folder, file

**Hold**:
A Place that survives the session and is not official. Hold is a status, not a folder. Working name.
_Avoid_: scratch, draft, inbox, temp, `.scratch/`

**Record**:
An official Place for a Result: a spec, an ADR, a plan, the glossary, or agent memory. Record is a status, not a folder. Working name.
_Avoid_: document, canon, `docs/`

**Promotion**:
The act of moving an existing Result into a Record — from a Hold, or from a Talk, Ask, or Try Result that was not yet in a Record. Keep into a Record is Keep, not Promotion.
_Avoid_: publish, save, commit, keep
