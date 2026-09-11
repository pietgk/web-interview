# extract reference architecture

> **Superseded.** This brief was worked through and became
> [`docs/reference-architecture.md`](../reference-architecture.md), which is the specification.
> It is kept as the record of where the ideas came from. Where the two disagree, the spec wins;
> in particular the spec uses **Owner** for the party that owns an app, and reserves **Actor** for
> a process inside one.

we like the ideas and architecture in this repo and we want to use it as a start for a reference architecture spec.
the goal of this spec is that it can be used to create an app that is the starting point for further development together with the actor that owns the app.
the idea is that we supply enough solid engineering concepts into the spec that the resulting app enables to basic needs at a level of functionality and architecture is sufficient and solid to decrease the risk of AI slop, the validate ideas started in this repo could be used to feed concepts and starting ideas to support this idea.
part of the idea is that architecture validation is possible if we make that part of the concept from the start by making good preferably simple choices to enable it.

## some of the starting highlights

- the single datom being the data and the transaction
- clients syncing only the datoms needed for presenting the local readmodel
- the simple CQRS-ES implementation
- the minimalistic append only server file storage as the starting implementation
- use code to query as a powerfull option (can be very efficient and fast when the readmodel is in memory)
- use code to validate (maintain for example generated versioned zod schema validation functions)
- use code to maintain the presentation of context, memory, knowledge.

## ideas to research

become the best (simple, powerfull, dedicated) single actor (user, agent or bot) knowledge and data layer taking advantage of the fact that the actor is the owner of the system (presentation, functionality and data) using the reference architecture as its foundation.

communicate with other actors by messages and shared context references

the idea is that actors are responsible for their context and communicate with other actors as needed.

optimise from the start for a world of actors (humans, language-models and systems) with reasoning and deterministic powers using them for what they are good at.

we need to determine if graph, vector and full text search can become an effective clean part of the datom storage.
i think it can but not sure how elegant and clean and potentially simple clean and fast.

## potentials we see

using typescript as the query language
- matches the models strength to write code to access data
- avoid learning and implementing specific query languages that need to support more generic use cases and can not take advantage of the specific context as good as specific code created for the specific query based on the specific context at hand.
