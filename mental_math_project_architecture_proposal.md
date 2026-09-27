# Mental Math Voice Trainer — Project & Engineering Plan

## Purpose of this document

This document is a **proposed direction**, not a fixed architecture.

The goal is to give Cursor enough context to understand what we are building, the skills we want to learn, and the engineering direction we are considering.

### Important instruction for Cursor

**Do not blindly implement this plan.**

Before making major architectural decisions, review the proposal and:

1. Identify anything that is unnecessarily complex for the actual product.
2. Identify anything that will create technical debt later.
3. Identify missing concerns.
4. Suggest simpler or more scalable alternatives where appropriate.
5. Explain important trade-offs.
6. Propose a revised architecture if you think there is a better approach.
7. Prefer the simplest architecture that still gives us a meaningful opportunity to learn professional engineering practices.

The intention is to use this project not only to build an app, but also to learn **full-stack development, software architecture, testing, CI/CD, Docker, cloud infrastructure, infrastructure-as-code, observability, and eventually Kubernetes** through a real project.

---

# 1. Project Context

We are building a **mental-math training application** focused on improving speed, accuracy, confidence, and performance under pressure.

The application should eventually support:

- Addition
- Subtraction
- Multiplication
- Division
- Different difficulty levels
- Rapid-fire practice
- Performance tracking
- Adaptive difficulty
- Weak-area detection
- Long-term skill progression
- Voice-based interaction
- Spoken questions
- Spoken answers
- Natural handling of corrections and hesitation
- Analytics
- User accounts and persistent history

Example interaction:

> App: "What is seven plus eight?"

User:

> "Fifteen."

App:

> "Correct. Next."

A more realistic spoken interaction might be:

> User: "Uhhh... twenty... no, twenty-one."

The system should eventually be able to determine that the final intended answer was **21**, rather than blindly taking the first number returned by speech recognition.

Another example:

> User: "I think it's twenty."

The system should distinguish this from an unambiguous answer if we decide uncertainty/confidence is worth tracking.

---

# 2. Main Product Goal

The core product loop should remain simple:

```text
Generate Question
       ↓
Present Question
       ↓
User Answers
       ↓
Interpret Answer
       ↓
Validate Answer
       ↓
Record Result
       ↓
Update Skill Model
       ↓
Select Next Question
```

The product should not make AI responsible for deterministic mathematical correctness.

The application itself should own:

- Question generation
- Correct answer calculation
- Answer validation
- Difficulty rules
- Session state
- Scoring
- Progress tracking

AI/voice services should primarily help with:

- Speech recognition
- Natural-language interpretation when necessary
- Speech synthesis
- Potentially coaching/explanations later

This separation is intentional.

---

# 3. Proposed Initial Technology Stack

This is a proposal for discussion, not a hard requirement.

## Mobile

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind / Tailwind-style styling

## State

Potential candidates:

- Zustand
- TanStack Query

Use local state/store for client/session state and a server-state library where appropriate.

Avoid introducing both libraries everywhere just because they are available.

Cursor should evaluate the actual responsibilities of each.

## Backend / Database

Potential direction:

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Edge Functions or a separate Node.js service where justified

Again, this is a proposed direction.

If a separate backend becomes useful for architecture or learning, explain where that boundary should exist instead of introducing one prematurely.

## Forms / Validation

Potentially:

- React Hook Form
- Zod

Only use these where they add value.

## Voice

Potential V1 architecture:

```text
Question Engine
      ↓
Text Question
      ↓
TTS
      ↓
User speaks
      ↓
STT
      ↓
Transcript
      ↓
Deterministic Answer Parser
      ↓
If ambiguous → optional LLM fallback
      ↓
Numeric Answer
      ↓
Deterministic Validator
```

The first version should avoid using a large LLM on every answer unless there is a clear benefit.

---

# 4. Proposed Voice Architecture

Voice interaction will eventually be one of the more technically interesting parts of the project.

The desired interaction is:

```text
Question
   ↓
TTS starts
   ↓
User listens
   ↓
TTS finishes
   ↓
Microphone listens
   ↓
User answers
   ↓
STT produces transcript
   ↓
Answer interpreter extracts intended answer
   ↓
Math engine validates answer
   ↓
Feedback
   ↓
Next question
```

But we should design for real-world complications.

## Potential problems

We need to consider:

- User starts speaking while TTS is still playing.
- STT produces partial transcripts.
- STT produces duplicate/final transcripts.
- User hesitates.
- User changes their answer.
- User says "20... no, 30."
- User says "umm... I think 20."
- User says "I don't know."
- User says "10 or 20?"
- Network connection drops.
- STT request takes too long.
- TTS takes too long.
- User presses skip.
- User rapidly answers several questions.
- Two async events update the same session state.
- A previous request returns after the app has moved to the next question.
- Analytics submission fails after the user has already answered.
- The same answer gets recorded twice.
- The user leaves the session unexpectedly.

This means the voice subsystem may eventually need an explicit state machine rather than a collection of loosely connected callbacks.

Possible conceptual state machine:

```text
IDLE
  ↓
ASKING
  ↓
LISTENING
  ↓
PROCESSING
  ↓
RESULT
  ↓
NEXT QUESTION
```

With interruption/error transitions.

**Cursor should evaluate whether this state-machine approach is appropriate and suggest a better design if one exists.**

---

# 5. Deterministic Math Engine

The mathematical engine should remain independent from AI.

Conceptually:

```text
Question Generator
        ↓
Question Object
        ↓
Correct Answer
```

For example:

```ts
{
  id: "...",
  operation: "addition",
  operands: [7, 8],
  correctAnswer: 15,
  difficulty: 2
}
```

The exact data structure is open for review.

The engine should eventually support:

- Operation type
- Operand constraints
- Difficulty
- Expected answer
- Time target
- Question history
- Weak-area tags
- Avoiding immediate duplicates
- Configurable question sets
- Future adaptive selection

---

# 6. Answer Interpretation

We should separate **speech recognition** from **answer interpretation**.

For example:

```text
STT Transcript:

"two hundred, sorry, twenty"
```

Should not automatically become:

```text
200
```

Instead, an answer interpreter may determine that the final intended answer is:

```text
20
```

Potentially:

```text
"twenty" → 20

"200, sorry, 20" → 20

"twenty... no, twenty-one" → 21

"I don't know" → no answer

"10 or 20?" → ambiguous
```

The exact parser architecture should be reviewed by Cursor.

Possible design:

```text
Transcript
    ↓
Fast deterministic parser
    ↓
Confident?
 ┌──┴──┐
Yes    No
 ↓      ↓
Answer  LLM fallback
           ↓
        Answer
```

The LLM should never be the final authority on mathematical correctness.

The correct answer comes from the deterministic math engine.

---

# 7. Learning / Adaptive Difficulty

Eventually, the app should understand the user's performance.

Possible signals:

- Correct/incorrect
- Response time
- Operation type
- Operand size
- Difficulty
- Error patterns
- Number of retries
- Confidence/hesitation
- Recent performance
- Long-term performance

Possible progression:

```text
Beginner
   ↓
Basic
   ↓
Intermediate
   ↓
Advanced
```

But this is intentionally not finalized.

We want Cursor to help design a sensible skill model rather than prematurely building a complicated recommendation system.

A good first version may be a simple deterministic scoring model.

A more advanced version could eventually estimate skill per operation/difficulty combination.

---

# 8. Data & Analytics

We eventually want to track sessions and performance.

Potential entities:

```text
User
Session
Question
Attempt
Skill / Progress
```

Possible attempt data:

```text
questionId
userId
sessionId
operation
difficulty
correctAnswer
spokenTranscript
interpretedAnswer
isCorrect
responseTimeMs
timestamp
```

However, we should avoid storing unnecessary raw voice/audio data unless there is a strong product reason.

Cursor should review:

- Which data should be persisted?
- Which data should be transient?
- What should be derived rather than stored?
- How should analytics evolve without making the schema unnecessarily rigid?
- Which events need idempotency?

---

# 9. Suggested Development Order

The major philosophy is:

> **Build the product first, then progressively productionize it.**

Do not spend a long time building infrastructure before we have an actual application.

## Phase 0 — Minimal development environment

Set up only what is needed to start building:

```text
Node.js
pnpm
Git
GitHub
Expo
Cursor / VS Code
Supabase project
```

Verify:

```text
Expo app runs
        ↓
Git commit
        ↓
GitHub
        ↓
Supabase connection works
```

The objective is to get to a working development loop quickly.

---

# 10. Phase 1 — Core Product

Build the non-voice mathematical engine first.

Target:

```text
Generate question
      ↓
Display question
      ↓
User enters answer
      ↓
Validate
      ↓
Record result
      ↓
Next question
```

Example:

```text
7 + 8
```

User enters:

```text
15
```

App displays:

```text
Correct
```

Then continue.

Build:

- Question generation
- Answer validation
- Session flow
- Basic difficulty
- Basic statistics
- Local persistence where useful

Do not introduce unnecessary cloud architecture yet.

---

# 11. Phase 2 — Progression & Analytics

Add:

- Session history
- Accuracy
- Average response time
- Operation-specific performance
- Difficulty progression
- Weak-area detection
- Basic adaptive selection

Keep the algorithm understandable.

We want something we can inspect and reason about before introducing ML or complicated recommendation logic.

---

# 12. Phase 3 — Voice

Add:

```text
TTS
 ↓
Question
 ↓
STT
 ↓
Transcript
 ↓
Answer parser
 ↓
Validator
```

Initially prefer a simple implementation.

Only introduce an LLM fallback when deterministic parsing genuinely cannot handle the input.

Then test difficult conversational cases.

---

# 13. Phase 4 — Testing

Introduce proper automated testing.

Potential layers:

```text
Unit Tests
Integration Tests
Component Tests
End-to-End Tests
```

Especially test:

### Math engine

```text
7 + 8 = 15
```

### Answer parser

```text
"fifteen" → 15
"20, sorry, 21" → 21
```

### Session state

- duplicate events
- skipped questions
- retries
- rapid answers

### Voice state machine

- TTS interruption
- STT failure
- timeout
- retry
- stale async response

---

# 14. Phase 5 — CI/CD

Once tests exist, introduce GitHub Actions.

Proposed pipeline:

```text
Developer
   ↓
Feature branch
   ↓
Pull Request
   ↓
GitHub Actions
   ├── Install dependencies
   ├── Typecheck
   ├── Lint
   ├── Unit tests
   ├── Integration tests
   └── Build
   ↓
Merge
```

The purpose is not to build complicated DevOps infrastructure.

The purpose is to learn:

- CI
- automated validation
- reproducible builds
- pull-request quality gates

---

# 15. Phase 6 — Docker

Do not necessarily containerize everything.

Start with a backend/service if one exists.

Example:

```text
Node.js API
    ↓
Dockerfile
    ↓
Docker Image
    ↓
Docker Container
```

Then potentially:

```text
docker compose
```

for local development.

Example conceptual environment:

```text
API
Redis
PostgreSQL
```

Only introduce services that the application actually needs.

The goal is to understand:

- Images
- Containers
- Dockerfiles
- Networking
- Volumes
- Environment variables
- Docker Compose
- Reproducibility

---

# 16. Phase 7 — Cloud

Once we understand the application locally:

Learn cloud fundamentals.

Potential AWS architecture:

```text
Internet
   ↓
Load Balancer / API entry point
   ↓
Containerized API
   ↓
Database
   ↓
Supporting services
```

Potential services to evaluate:

- ECR
- ECS / Fargate
- RDS or another managed database
- CloudWatch
- IAM
- VPC
- S3 where appropriate

Do not introduce AWS services merely to make the architecture look impressive.

Use them when they teach a useful concept or solve a real application requirement.

---

# 17. Phase 8 — Terraform

Once cloud infrastructure exists, introduce Infrastructure as Code.

Possible structure:

```text
infra/
├── main.tf
├── variables.tf
├── outputs.tf
├── providers.tf
└── modules/
```

Goal:

```text
Infrastructure
      ↓
Terraform configuration
      ↓
Version controlled
      ↓
Reproducible environment
```

We want to learn:

- Providers
- Resources
- Variables
- Outputs
- State
- Modules
- Environment separation
- Secrets/configuration
- Planning/applying safely

Again, Cursor should recommend a simpler structure if appropriate.

---

# 18. Phase 9 — Observability

Add production visibility.

Potential concepts:

```text
Application logs
      ↓
Metrics
      ↓
Error tracking
      ↓
Alerts
```

We want to understand:

- structured logging
- request IDs
- error tracking
- latency
- failure rates
- health checks
- monitoring

Potential tools could include a managed monitoring service and/or Sentry, but the exact choice should be evaluated rather than assumed.

---

# 19. Phase 10 — Kubernetes

Kubernetes is intentionally a later learning objective.

Only study it after we understand:

```text
Containers
Docker
Networking
Cloud deployment
ECS or equivalent orchestration concepts
Scaling
Health checks
Deployment strategies
```

Then learn Kubernetes concepts:

```text
Cluster
Node
Pod
Deployment
Service
Ingress
ConfigMap
Secret
Horizontal Pod Autoscaler
```

The purpose is learning orchestration concepts, not forcing Kubernetes into a tiny app that doesn't need it.

For local learning, we may use something such as:

```text
kind
```

or:

```text
minikube
```

rather than paying for a Kubernetes cluster.

---

# 20. Long-Term Target Architecture

This is a **learning target**, not necessarily the architecture we should implement immediately.

```text
                         GitHub
                            │
                            ↓
                     GitHub Actions
                    /       |       \
                   /        |        \
              Tests      Docker     Build
                           │
                           ↓
                          ECR
                           │
                           ↓
                     Cloud Runtime
                    /      |       \
                   /       |        \
                 API     Worker     Redis
                  │
                  ↓
              PostgreSQL

                Terraform
                    │
                    └── manages cloud infrastructure

              Monitoring / Logging
                    │
                    └── production visibility
```

Mobile application:

```text
                    Expo / React Native
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
            Voice       App State    Analytics
              │
              ↓
         STT / TTS
              │
              ↓
          Backend/API
```

This architecture is intentionally modular so that we can progressively replace pieces as our needs grow.

---

# 21. What We Do NOT Want

We should avoid:

- Premature microservices
- Kubernetes on day one
- Multiple databases without a reason
- AI deciding deterministic math correctness
- Overcomplicated event-driven architecture
- Excessive abstractions
- Infrastructure added purely for résumé keywords
- Storing audio unnecessarily
- Building a distributed system before the product requires it
- Introducing five technologies where one would work
- Copying an enterprise architecture onto a small app

The project should remain understandable to a single developer.

---

# 22. Learning Philosophy

The project should teach us through progressively harder engineering problems.

The rough progression is:

```text
React Native
   ↓
TypeScript
   ↓
Application architecture
   ↓
State management
   ↓
Database design
   ↓
API design
   ↓
Voice systems
   ↓
Testing
   ↓
CI/CD
   ↓
Docker
   ↓
Linux / Networking
   ↓
Cloud
   ↓
Terraform
   ↓
Observability
   ↓
Container orchestration
   ↓
Kubernetes
```

The goal is not to collect technologies.

The goal is:

> **Understand why each technology exists, what problem it solves, what trade-offs it introduces, and when not to use it.**

---

# 23. Request for Cursor: Architecture Review Before Implementation

Before writing significant code, please review this document as a senior software architect.

## Please answer:

### A. What is good about this proposal?

Identify the parts you agree with and why.

### B. What is over-engineered?

Identify anything that should be removed, simplified, or delayed.

### C. What is missing?

Identify important concerns that are not included.

Consider:

- Security
- Authentication
- Authorization
- Data privacy
- API design
- Error handling
- State management
- Concurrency
- Idempotency
- Offline behavior
- Reliability
- Testing
- Observability
- Deployment
- Cost
- Developer experience

### D. Is the technology stack appropriate?

Review:

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind
- Zustand
- TanStack Query
- Supabase
- PostgreSQL
- React Hook Form
- Zod
- STT
- TTS
- LLM fallback

Suggest replacements only when there is a meaningful reason.

### E. Is the architecture appropriately separated?

Especially review:

```text
Math Engine
Voice Layer
Answer Parser
Session State
Backend
Analytics
Skill Model
```

Suggest better boundaries if necessary.

### F. What should the MVP contain?

Give us the smallest useful version of the application.

### G. What should be explicitly postponed?

Create a list of technologies/features that we should **not** build yet.

### H. What should the final architecture look like?

Provide your recommended architecture after reviewing this proposal.

### I. Recommend a development sequence

Give us a staged implementation plan.

Each stage should include:

- What we build
- Why we build it
- What we learn
- What tests should exist
- What new infrastructure becomes necessary

### J. Identify architectural risks

Especially investigate:

- voice/TTS/STT race conditions
- stale async responses
- duplicate attempts
- offline/network failures
- analytics consistency
- authentication/security
- database schema evolution
- excessive dependence on AI
- future scaling problems

---

# 24. Final Instruction to Cursor

Treat this document as a **proposal for discussion**.

Do not assume the proposed technologies or architecture are correct.

Your first responsibility is to **review, challenge, simplify, and improve the plan**.

After providing your review and recommended architecture, wait for approval before making major structural changes.

For implementation, prefer incremental changes that leave the repository in a working state after each meaningful step.

Whenever introducing a technology, explain:

1. What problem it solves.
2. Why we need it now.
3. Why a simpler option is insufficient.
4. What operational or learning cost it introduces.
5. Whether we can postpone it.

The overall objective is:

> Build a genuinely useful mental-math training product while using the project as a structured path to become a stronger full-stack engineer with real-world DevOps, cloud, system-design, and architecture skills.
