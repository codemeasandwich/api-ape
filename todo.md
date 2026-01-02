# Query System - TODO

A fluent, chainable query API for api-ape with filtering, field selection, and real-time subscriptions.

---

## Client API Design
```js
const petsReq = ape.pets.list(data, (item) => shouldSubscribe)
      petsReq.filter`name ! ${undefined} AND bio.checkin > ${10} OR bio.type = ${"admin"}`
      petsReq.fields("*", {bio: ["email"]})
      petsReq.then(pets => ...).catch(err => ...)
```

---

## Phase 1: Filter Parser
- [ ] Create `client/utils/filter.js` - tagged template parser
- [ ] Parse operators: `=`, `!` (not equal), `?` (exists), `>`, `<`
- [ ] Parse `AND` / `OR` with correct precedence
- [ ] Support nested paths (e.g., `bio.checkin`, `owner.type`)
- [ ] Return serializable filter object to send over wire

## Phase 2: Fields Selection  
- [ ] Parse `fields("*", {relation: ["field1", "field2"]})`
- [ ] `"*"` = all root-level fields
- [ ] Object syntax for nested/related field selection
- [ ] Max depth limit (≤ 4)

## Phase 3: Query Builder (Client)
- [ ] Refactor `client/index.js` → proper query builder
- [ ] Chainable `.filter()` and `.fields()` methods
- [ ] Integrate with existing `connectSocket.js` sender
- [ ] Send query payload: `{ type, data, filter, fields, subscribe }`

## Phase 4: Subscription Callback
- [ ] Second arg: `(item) => boolean` subscription predicate
- [ ] Register listener via `setOnReciver` for matching type
- [ ] Filter incoming broadcasts client-side with predicate

## Phase 5: Server Query Execution
- [ ] Parse incoming `filter` object
- [ ] Apply filter to controller response data
- [ ] Respect `fields` selection (project/limit returned data)
- [ ] Track subscribed queryIds for broadcast targeting

## Phase 6: Skip/Have Optimization (Future)
- [ ] `.dont([id1, id2])` - skip items client already has
- [ ] Server tracks live refs per client
- [ ] Only send missing/changed items

---

## Open Questions

### Query Method Semantics
- `ape.pets.list(null, (pet) => { pet.owner == me })`:
  - [ ] What does the first argument (`null`) represent? Initial filter data? Query options?
  - [ ] What does the callback do? Live subscription filter? Server-side predicate?

### Filter Syntax
- `.filter\`name ! ${undefined} AND owner.checkin > ${10} OR owner.type = ${"nice"}\``:
  - [ ] Confirm operators: `!` = not equal, `?` = exists, `>` `<` `=` = comparison
  - [ ] Need additional operators? `>=`, `<=`, `LIKE`, `IN`, `BETWEEN`?
  - [ ] Should `AND`/`OR` respect standard boolean precedence?
  - [ ] Should `${10}DaysAgo` be a special relative time syntax?

### Fields Selection
- `.fields("*", {toys: ["type"]})`:
  - [ ] `"*"` = all fields at root level?
  - [ ] Object syntax `{relation: [...]}` for nested/related fields?
  - [ ] Max depth limit? (code comment says ≤ 4)
  - [ ] Support exclusion? (e.g., `"-password"`)

### Real-time Subscriptions
- [ ] How should live updates work? Push on any change to matching items?
- [ ] Can the subscription filter differ from the initial query filter?
- [ ] What events trigger updates? Create, Update, Delete?
- [ ] Broadcast filtering - server-side or client-side predicate eval?

### Additional Features (In Scope?)
- [ ] Pagination: `.limit()`, `.offset()`, `.cursor()`
- [ ] Sorting: `.orderBy()`
- [ ] Aggregations: `.count()`, `.sum()`
- [ ] Skip/Have optimization: `.dont([ids])` for delta updates
