# Mermaid diagram gallery

A sampler of [Mermaid](https://mermaid.js.org) diagram types and sizes, for
exercising Markdown Preview's diagram rendering (scale-to-fit, the expand-to-modal
button, and theme colors). Open this file and switch to **Preview** to view it.

## A small flowchart

Compact enough to render at (or near) native size inline.

```mermaid
flowchart LR
    A[Start] --> B{Cache hit?}
    B -->|yes| C[Return cached value]
    B -->|no| D[Fetch from source]
    D --> E[Populate cache]
    E --> C
```

## A wide flowchart

Long node and edge labels push this well past a narrow pane's width — a good
check that it scales down cleanly instead of overflowing, and that the expand
button gives back the detail at full size.

```mermaid
flowchart LR
    A["Client submits booking form\n(ScheduleDraftValues, FE state)"]
    B["Confirmation modal collects final details\n(IModalConfirmResponse)"]
    C["Frontend maps draft + confirmation\ninto SubmitJobBookingInput"]
    D["No mapper exists yet for this path\n(tracked as follow-up work)"]
    E["Existing mapper converts to the wire format\n(JobBookingMapper.ToBookJobRequest, ~1:1 copy)"]
    F["Monolith receives BookJobRequest\nand creates the job"]

    A -->|"phase 4: initial submit"| B
    B -->|"phase 6: confirm-mapping\n(exists, being corrected)"| C
    C -.->|"NO MAPPER EXISTS YET\nfor any path"| D
    D -->|"planned"| E
    E -->|"exists, ~1:1 copy"| F
```

## A tall flowchart

Many nodes stacked top-down — a check on vertical scaling and the expand
modal's scroll behavior for diagrams taller than the viewport.

```mermaid
flowchart TD
    A[Request received] --> B[Validate payload]
    B --> C{Valid?}
    C -->|no| Z[Reject with 400]
    C -->|yes| D[Authenticate caller]
    D --> E{Authorized?}
    E -->|no| Y[Reject with 403]
    E -->|yes| F[Load account context]
    F --> G[Check rate limit]
    G --> H{Over limit?}
    H -->|yes| X[Reject with 429]
    H -->|no| I[Begin transaction]
    I --> J[Apply business rules]
    J --> K[Persist changes]
    K --> L[Emit domain event]
    L --> M[Commit transaction]
    M --> N[Return 200 with result]
```

## A sequence diagram

A different diagram shape entirely — vertical lifelines and horizontal
messages, rather than a node graph.

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API Gateway
    participant SVC as Booking Service
    participant DB as Database

    U->>FE: Submit booking form
    FE->>API: POST /bookings
    API->>SVC: CreateBooking(request)
    SVC->>DB: INSERT booking
    DB-->>SVC: booking id
    SVC-->>API: 201 Created
    API-->>FE: booking confirmation
    FE-->>U: Show confirmation screen
```

## A state diagram

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> PendingReview: submit
    PendingReview --> Draft: request changes
    PendingReview --> Approved: approve
    PendingReview --> Rejected: reject
    Approved --> Archived: archive
    Rejected --> Draft: revise
    Archived --> [*]
```

## A class diagram

```mermaid
classDiagram
    class Booking {
        +string id
        +DateTime scheduledAt
        +BookingStatus status
        +confirm()
        +cancel()
    }
    class Customer {
        +string id
        +string name
        +string email
    }
    class BookingStatus {
        <<enumeration>>
        Draft
        Confirmed
        Cancelled
    }
    Booking "many" --> "1" Customer : booked by
    Booking --> BookingStatus : has
```

## A pie chart

A non-graph shape — good check that scale-to-fit and theme colors hold up
outside the node/edge diagram family too.

```mermaid
pie title Support ticket categories this week
    "Booking issues" : 38
    "Billing questions" : 24
    "Login problems" : 12
    "Feature requests" : 18
    "Other" : 8
```

## A small diagram with an intentional syntax error

Checks the error fallback — this should show a readable error plus the raw
source, not a blank pane.

```mermaid
flowchart LR
    A[Start --> B[Missing closing bracket above]
```

Plain text after the gallery, to confirm normal Markdown keeps rendering
normally around and after the diagrams.
